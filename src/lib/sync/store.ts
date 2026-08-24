/**
 * createSyncedStore: the factory every local store in src/features is meant
 * to be migrated onto. It reproduces the existing module-level store pattern
 * exactly — a module-scope snapshot, a listener Set, commit() that notifies
 * then fire-and-forgets a persist, hydrate-once, useSyncExternalStore, and
 * deliberately no loading state — and layers Firestore sync underneath it
 * using the pure modules in this directory.
 *
 * This file is impure (AsyncStorage, Firestore, firebase/auth) and has no
 * .test.ts beside it on purpose: every decision worth testing in isolation
 * already has a pure home in adapter.ts, outbox.ts, or merge.ts. What is left
 * here is wiring, in the same spirit as courses.ts/decks.ts/sessions.ts
 * never being unit-tested themselves.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { useSyncExternalStore } from "react";

import { auth, db } from "@/lib/firebase";

import { fromFirestorePayload, toFirestorePayload, type FieldAdapterConfig } from "./adapter";
import { syncStorageKeys } from "./keys";
import { reconcile, type RemoteEntry } from "./merge";
import { applyFailure, enqueue, nextToDrain, removeOp, replaceOp } from "./outbox";
import { SERVER_TIMESTAMP, type MetaMap, type OutboxOp } from "./types";

export interface SyncedStoreConfig<T extends { id: string }> {
  /** Namespaces this store's AsyncStorage keys — see keys.ts. Does not affect the Firestore path; that is collectionPath below. */
  name: string;
  /**
   * Firestore collection path for the given uid, e.g. `() => "courses"` for
   * a root collection or `(uid) => \`users/${uid}/sessions\`` for a
   * subcollection.
   */
  collectionPath: (uid: string) => string;
  /**
   * True when collectionPath already varies by uid (a users/{uid}/...
   * subcollection), so the live listener does not also need a `where`
   * filter on top of it. Root collections like `decks` and `uploads` are
   * not scoped by path and need the filter — firestore.rules only allows an
   * unfiltered read there when it can statically prove the query returns
   * nothing else, which in practice means every list query must filter on
   * ownerId.
   */
  pathIsOwnerScoped: boolean;
  field: FieldAdapterConfig;
  /**
   * Which local record field reconcile() should treat as a remote record's
   * "last write" — normally the same field marked 'always' in
   * field.serverTimestamps, or createdAt when the collection has no
   * updatedAt of its own. Must be one of field.timestampFields, since this
   * reads the value after fromFirestorePayload has already converted it to
   * millis.
   */
  remoteUpdatedAtField: string;
  /** Validates and drops anything malformed, in the style of isCourse/isSession. */
  isValid: (value: unknown) => value is T;
  /** Present for stores that ship with fixed starter content, e.g. courses. */
  seeds?: T[];
  /** Reconciles freshly-hydrated local records against seeds, in the style of mergeCourses. Defaults to "seeds first, then non-seed survivors" keyed on id. */
  mergeWithSeeds?: (stored: T[], seeds: T[]) => T[];
}

export interface SyncedStore<T extends { id: string }> {
  useRecords(): T[];
  getRecords(): T[];
  /** Applies a create or edit immediately and syncs it in the background. */
  put(record: T): void;
  remove(id: string): void;
}

function defaultMergeWithSeeds<T extends { id: string }>(stored: T[], seeds: T[]): T[] {
  const seedIds = new Set(seeds.map((seed) => seed.id));
  return [...seeds, ...stored.filter((record) => !seedIds.has(record.id))];
}

function makeOpId(): string {
  return `op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createSyncedStore<T extends { id: string }>(config: SyncedStoreConfig<T>): SyncedStore<T> {
  let snapshot: T[] = config.seeds ?? [];
  let meta: MetaMap = {};
  let outbox: OutboxOp[] = [];
  let uid: string | null = null;
  let hydrationToken = 0;
  let firestoreUnsubscribe: Unsubscribe | null = null;
  let drainTimer: ReturnType<typeof setTimeout> | null = null;
  let draining = false;

  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());

  function keys() {
    return syncStorageKeys(config.name, uid);
  }

  function commitRecords(next: T[]) {
    snapshot = next;
    notify();
    // Fire-and-forget, matching every other store in src/features: a failed
    // cache write costs one refresh next launch, which is not worth
    // interrupting the interaction over.
    AsyncStorage.setItem(keys().records, JSON.stringify(next)).catch(() => {});
  }

  function commitMeta(next: MetaMap) {
    meta = next;
    AsyncStorage.setItem(keys().meta, JSON.stringify(next)).catch(() => {});
  }

  function commitOutbox(next: OutboxOp[]) {
    outbox = next;
    AsyncStorage.setItem(keys().outbox, JSON.stringify(next)).catch(() => {});
  }

  /** Builds and enqueues the write for one record, choosing `set` vs `update` from whether Firestore has ever acknowledged this id — see the RecordMeta.remoteConfirmed comment in ./types. */
  function enqueueWrite(queue: OutboxOp[], record: T, metaMap: MetaMap): OutboxOp[] {
    if (!uid) return queue;
    const kind: "set" | "update" = metaMap[record.id]?.remoteConfirmed ? "update" : "set";
    const payload = toFirestorePayload(record, kind, uid, config.field);
    const now = Date.now();
    return enqueue(queue, {
      opId: makeOpId(),
      collection: config.collectionPath(uid),
      docId: record.id,
      kind,
      payload,
      createdAt: now,
    });
  }

  function attachFirestoreListener() {
    firestoreUnsubscribe?.();
    firestoreUnsubscribe = null;
    if (!uid) return;

    const ref = collection(db, config.collectionPath(uid));
    const q = config.pathIsOwnerScoped
      ? query(ref)
      : query(ref, where(config.field.ownerIdField ?? "ownerId", "==", uid));

    firestoreUnsubscribe = onSnapshot(q, (snap) => {
      const remoteRecords: RemoteEntry<T>[] = [];
      for (const docSnap of snap.docs) {
        const record = fromFirestorePayload<T>(docSnap.id, docSnap.data(), config.field);
        if (!config.isValid(record)) continue;
        const updatedAt = (record as unknown as Record<string, unknown>)[config.remoteUpdatedAtField];
        if (typeof updatedAt !== "number") continue;
        remoteRecords.push({ record, updatedAt });
      }

      const result = reconcile(snapshot, meta, remoteRecords);
      let nextMeta = result.meta;
      let nextOutbox = outbox;
      for (const record of result.toUpload) {
        if (!nextMeta[record.id]) {
          nextMeta = {
            ...nextMeta,
            [record.id]: { updatedAt: Date.now(), dirty: true, remoteConfirmed: false },
          };
        }
        nextOutbox = enqueueWrite(nextOutbox, record, nextMeta);
      }

      commitRecords(result.records);
      commitMeta(nextMeta);
      if (nextOutbox !== outbox) commitOutbox(nextOutbox);
      scheduleDrain();
    });
  }

  async function sendOp(op: OutboxOp): Promise<void> {
    const ref = doc(db, op.collection, op.docId);
    if (op.kind === "delete") {
      await deleteDoc(ref);
      return;
    }

    const payload: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(op.payload)) {
      payload[key] = value === SERVER_TIMESTAMP ? serverTimestamp() : value;
    }

    if (op.kind === "set") {
      await setDoc(ref, payload);
    } else {
      await updateDoc(ref, payload);
    }
  }

  async function drain(): Promise<void> {
    if (draining) return;
    draining = true;
    if (drainTimer) {
      clearTimeout(drainTimer);
      drainTimer = null;
    }

    try {
      if (!uid) return;

      while (true) {
        const op = nextToDrain(outbox, Date.now());
        if (!op) return;

        try {
          await sendOp(op);
          commitOutbox(removeOp(outbox, op.opId));
          const current = meta[op.docId];
          const nextMeta = { ...meta };
          if (op.kind === "delete") {
            delete nextMeta[op.docId];
          } else if (current) {
            nextMeta[op.docId] = { ...current, dirty: false, remoteConfirmed: true };
          }
          commitMeta(nextMeta);
        } catch (error) {
          const outcome = applyFailure(op, error, Date.now());
          if (!outcome.op) {
            // Terminal: the rules rejected this write, and retrying sends
            // the exact same request into the exact same rejection. Drop it
            // rather than retry forever — losing one sync is not worth
            // wedging every later op behind it, matching how every store
            // already treats a failed AsyncStorage write as not worth
            // interrupting the user over.
            console.warn(`[sync:${config.name}] dropping ${op.kind} for ${op.docId}`, error);
            commitOutbox(removeOp(outbox, op.opId));
            continue;
          }
          commitOutbox(replaceOp(outbox, outcome.op));
          const delay = Math.max(outcome.op.nextAttemptAt - Date.now(), 0);
          drainTimer = setTimeout(() => {
            drainTimer = null;
            void drain();
          }, delay);
          return;
        }
      }
    } finally {
      draining = false;
    }
  }

  function scheduleDrain() {
    void drain();
  }

  async function hydrate(nextUid: string | null) {
    const token = ++hydrationToken;
    uid = nextUid;
    const k = keys();

    const [rawRecords, rawMeta, rawOutbox] = await Promise.all([
      AsyncStorage.getItem(k.records),
      AsyncStorage.getItem(k.meta),
      AsyncStorage.getItem(k.outbox),
    ]);

    // A later auth transition landed while this one's reads were in flight —
    // let that one own the snapshot instead of stomping it with stale data.
    if (token !== hydrationToken) return;

    const stored: unknown[] = rawRecords ? JSON.parse(rawRecords) : [];
    const merge = config.mergeWithSeeds ?? defaultMergeWithSeeds;
    snapshot = merge(stored.filter(config.isValid), config.seeds ?? []);
    meta = rawMeta ? (JSON.parse(rawMeta) as MetaMap) : {};
    outbox = rawOutbox ? (JSON.parse(rawOutbox) as OutboxOp[]) : [];
    notify();

    attachFirestoreListener();
    scheduleDrain();
  }

  // Hydrates on the first auth state and again on every uid change — the
  // Firestore listener is torn down and re-attached each time, and on
  // sign-out (nextUid null) attachFirestoreListener() just detaches without
  // AsyncStorage ever being cleared, so the signed-out user's cache is
  // exactly as they left it if they sign back in. There is deliberately no
  // separate immediate local-only hydration pass before this fires: Firebase
  // persists auth state (see firebase.native.ts), so on a warm launch this
  // callback runs with the right uid already known rather than a
  // signed-out-then-signed-in flicker, and until it fires the seeds/empty
  // fallback below is the same "no loading state" behaviour every other
  // store already relies on.
  onAuthStateChanged(auth, (user) => {
    void hydrate(user?.uid ?? null);
  });

  function put(record: T) {
    const now = Date.now();
    const nextRecords = snapshot.some((existing) => existing.id === record.id)
      ? snapshot.map((existing) => (existing.id === record.id ? record : existing))
      : [...snapshot, record];

    const previous = meta[record.id];
    const nextMeta: MetaMap = {
      ...meta,
      [record.id]: { updatedAt: now, dirty: true, remoteConfirmed: previous?.remoteConfirmed ?? false },
    };

    commitRecords(nextRecords);
    commitMeta(nextMeta);

    if (uid) {
      commitOutbox(enqueueWrite(outbox, record, nextMeta));
      scheduleDrain();
    }
  }

  function remove(id: string) {
    if (!snapshot.some((record) => record.id === id)) return;
    commitRecords(snapshot.filter((record) => record.id !== id));

    const nextMeta = { ...meta };
    delete nextMeta[id];
    commitMeta(nextMeta);

    if (uid) {
      commitOutbox(
        enqueue(outbox, {
          opId: makeOpId(),
          collection: config.collectionPath(uid),
          docId: id,
          kind: "delete",
          payload: null,
          createdAt: Date.now(),
        }),
      );
      scheduleDrain();
    }
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function getSnapshot() {
    return snapshot;
  }

  return {
    useRecords: () => useSyncExternalStore(subscribe, getSnapshot),
    getRecords: () => snapshot,
    put,
    remove,
  };
}
