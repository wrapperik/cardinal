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
import { applyFailure, dropChildrenOf, enqueue, nextToDrain, removeOp, replaceOp } from "./outbox";
import { SERVER_TIMESTAMP, type ExpandedOp, type MetaMap, type OutboxOp } from "./types";

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
  /**
   * Optionally derives a remote record's reconciliation revision instead of
   * reading `remoteUpdatedAtField`. Sessions use this because a close is
   * represented by `endedAt`, while their `startedAt` never changes.
   */
  remoteRevision?: (record: T) => number;
  /** Validates and drops anything malformed, in the style of isCourse/isSession. */
  isValid: (value: unknown) => value is T;
  /**
   * Optionally expands a Firestore document into the complete local record
   * before validation. Decks use this to read their cards subcollection: the
   * root document alone intentionally does not contain playable card data.
   */
  hydrateRemote?: (input: {
    id: string;
    data: Record<string, unknown>;
  }) => T | null | Promise<T | null>;
  /** Present for stores that ship with fixed starter content, e.g. courses. */
  seeds?: T[];
  /** Reconciles freshly-hydrated local records against seeds, in the style of mergeCourses. Defaults to "seeds first, then non-seed survivors" keyed on id. */
  mergeWithSeeds?: (stored: T[], seeds: T[]) => T[];
  /**
   * A flat, pre-namespacing AsyncStorage key this store used to read before
   * it existed as a SyncedStore. When set, and the uid-namespaced records
   * key (see keys.ts) is empty on hydrate, this key is read once and its
   * contents adopted into the namespaced key instead of falling back to
   * seeds/empty. Optional and additive: a store with nothing to migrate
   * simply never sets this, and behaves exactly as before. The legacy key
   * itself is never cleared — only ever read — so a wrong migration still
   * leaves the original data recoverable rather than silently destroying it.
   */
  migrateLegacyKey?: string;
  /**
   * Rewrites one just-hydrated raw record before isValid ever sees it.
   * Optional and additive — a store with nothing to correct simply never
   * sets this, and hydrate() behaves exactly as before. Exists for a store
   * whose local shape gained a required field after records were already
   * on disk (a card's `cardId`, added in the same chunk this hook was —
   * see backfillDeck in deck-rules.ts): isValid can only accept or reject a
   * record as given, and rejecting every pre-existing one outright would
   * silently delete a player's whole history the first time the new code
   * runs against old data. Applied to every record from both the primary
   * key and an adopted legacy key, and — whenever it actually changes
   * something — persisted back immediately, for the same reason
   * migrateLegacyKey's adoption is: an app kill before the next put() must
   * not leave the correction sitting only in memory.
   */
  backfill?: (value: unknown) => unknown;
  /**
   * Converts a persisted legacy shape into records before backfill and
   * validation. Stores that have always persisted arrays leave this unset.
   */
  decodeRecords?: (value: unknown) => unknown[];
  /**
   * Expands one `put()`'d record into several ordered outbox ops instead of
   * the single write every other store uses — a deck plus its cards, which
   * firestore.rules forces to be two genuinely separate, sequential writes:
   * the cards rule's deckOwner() reads the parent deck via get(), which
   * only sees state from before the current write, so a deck and a card
   * can never be created in the same atomic batch (see the emulator test
   * named for exactly this in tests/rules/firestore.test.ts). Strict global
   * FIFO in the outbox (see nextToDrain in outbox.ts) is what makes
   * "expand in order, enqueue in order" enough to guarantee that ordering —
   * no separate scheduling logic is needed here.
   *
   * The first op returned is enqueued as the parent; every op after it is
   * tagged with that op's freshly-assigned id via parentOpId, so a terminal
   * failure on the parent cascades to drop the rest (dropChildrenOf in
   * outbox.ts) instead of retrying child writes against a parent that will
   * never exist. `meta` is passed through so the hook can replicate the
   * same set-vs-update decision enqueueWrite makes for the default path
   * (see RecordMeta.remoteConfirmed in ./types).
   */
  expand?: (record: T, uid: string, meta: MetaMap) => ExpandedOp[];
}

export interface SyncedStore<T extends { id: string }> {
  useRecords(): T[];
  getRecords(): T[];
  /** Listener readiness and queued writes, for concise live sync UI. */
  useSyncStatus(): SyncStatus;
  /** Applies a create or edit immediately and syncs it in the background. */
  put(record: T): void;
  /**
   * Saves a record already confirmed by Firestore without queuing a client
   * write. Used when a server-owned workflow creates the canonical record
   * before the regular collection listener has delivered it locally.
   */
  adoptRemote(record: T, revision: number): void;
  remove(id: string): void;
}

export type SyncStatus = "offline" | "syncing" | "synced";

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
  let listenerReady = false;
  let listenerFailed = false;
  let syncStatus: SyncStatus = "offline";

  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());

  function setSyncStatus(next: SyncStatus) {
    if (syncStatus === next) return;
    syncStatus = next;
    notify();
  }

  function refreshSyncStatus() {
    if (!uid || listenerFailed) {
      setSyncStatus("offline");
      return;
    }
    if (!listenerReady || outbox.length > 0) {
      setSyncStatus("syncing");
      return;
    }
    setSyncStatus("synced");
  }

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
    refreshSyncStatus();
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

  /**
   * Builds and enqueues whatever writes one record needs — the single op
   * enqueueWrite already builds, or, when config.expand is set, the
   * ordered parent-then-children sequence it describes. Both put() and the
   * listener's toUpload loop (attachFirestoreListener below) call this
   * rather than enqueueWrite directly, so a deck saved offline and only
   * discovered as unsynced once the listener attaches gets the same
   * deck-then-cards treatment a deck saved online does.
   */
  function enqueueOps(queue: OutboxOp[], record: T, metaMap: MetaMap): OutboxOp[] {
    if (!uid) return queue;
    if (!config.expand) return enqueueWrite(queue, record, metaMap);

    const expanded = config.expand(record, uid, metaMap);
    const now = Date.now();
    let next = queue;
    let parentOpId: string | undefined;

    expanded.forEach((op, index) => {
      const opId = makeOpId();
      next = enqueue(next, {
        opId,
        collection: op.collection,
        docId: op.docId,
        kind: op.kind,
        payload: op.payload,
        createdAt: now,
        parentOpId,
      });
      if (index === 0) parentOpId = opId;
    });

    return next;
  }

  function attachFirestoreListener() {
    firestoreUnsubscribe?.();
    firestoreUnsubscribe = null;
    if (!uid) return;
    listenerReady = false;
    listenerFailed = false;
    refreshSyncStatus();

    const ref = collection(db, config.collectionPath(uid));
    const q = config.pathIsOwnerScoped
      ? query(ref)
      : query(ref, where(config.field.ownerIdField ?? "ownerId", "==", uid));

    let snapshotVersion = 0;
    firestoreUnsubscribe = onSnapshot(q, (snap) => {
      const version = ++snapshotVersion;
      void (async () => {
        const entries = await Promise.all(
          snap.docs.map(async (docSnap): Promise<RemoteEntry<T> | null> => {
            try {
              const data = docSnap.data();
              const record = config.hydrateRemote
                ? await config.hydrateRemote({ id: docSnap.id, data })
                : fromFirestorePayload<T>(docSnap.id, data, config.field);
              if (!record || !config.isValid(record)) return null;
              const updatedAt = config.remoteRevision
                ? config.remoteRevision(record)
                : (record as unknown as Record<string, unknown>)[config.remoteUpdatedAtField];
              return typeof updatedAt === "number" ? { record, updatedAt } : null;
            } catch (error) {
              console.warn(`[sync:${config.name}] could not hydrate remote ${docSnap.id}`, error);
              return null;
            }
          }),
        );

        // A newer snapshot may have arrived while a child collection was
        // loading. Applying the older one afterwards would roll local state
        // back, so only the latest completed snapshot may reconcile.
        if (version !== snapshotVersion) return;
        const remoteRecords = entries.filter((entry): entry is RemoteEntry<T> => entry !== null);
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
          nextOutbox = enqueueOps(nextOutbox, record, nextMeta);
        }

        commitRecords(result.records);
        commitMeta(nextMeta);
        if (nextOutbox !== outbox) commitOutbox(nextOutbox);
        listenerReady = true;
        refreshSyncStatus();
        scheduleDrain();
      })();
    }, () => {
      listenerReady = false;
      listenerFailed = true;
      setSyncStatus("offline");
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
            // A card queued behind a deck that will now never exist can
            // never succeed either — see the ordering note on `expand`
            // above — so a terminal failure on a parent op takes its
            // children down with it rather than leaving them to retry
            // forever against a deck that is never coming.
            commitOutbox(dropChildrenOf(removeOp(outbox, op.opId), op.opId));
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
    listenerReady = false;
    listenerFailed = false;
    refreshSyncStatus();
    const k = keys();

    const [rawRecords, rawMeta, rawOutbox] = await Promise.all([
      AsyncStorage.getItem(k.records),
      AsyncStorage.getItem(k.meta),
      AsyncStorage.getItem(k.outbox),
    ]);

    // A later auth transition landed while this one's reads were in flight —
    // let that one own the snapshot instead of stomping it with stale data.
    if (token !== hydrationToken) return;

    let recordsSource = rawRecords;
    let adoptedLegacy = false;
    if (!recordsSource && config.migrateLegacyKey) {
      const legacy = await AsyncStorage.getItem(config.migrateLegacyKey);
      if (token !== hydrationToken) return;
      if (legacy) {
        recordsSource = legacy;
        adoptedLegacy = true;
      }
    }

    const parsed: unknown = recordsSource ? JSON.parse(recordsSource) : [];
    // A store can opt into decoding an older non-array cache shape before the
    // common record pipeline. The default preserves every existing store's
    // array-only persistence contract while safely treating malformed JSON
    // values as an empty record list.
    const decoded = config.decodeRecords
      ? config.decodeRecords(parsed)
      : Array.isArray(parsed)
        ? parsed
        : [];
    // Backfill runs before isValid ever sees a record — see the field
    // comment on SyncedStoreConfig.backfill. Applied uniformly whether the
    // records came from the primary key or were just adopted from a legacy
    // one, since a legacy install's data is exactly the data most likely to
    // predate whatever this backfill exists to correct.
    const normalised = config.backfill ? decoded.map(config.backfill) : decoded;

    // Persist immediately rather than waiting for the first put(): a user
    // who signs in, sees their migrated or corrected records, and
    // force-quits before touching anything should not have that silently
    // undone by the next cold start reading the old, uncorrected data
    // again. Skipped when nothing actually changed, so a store with no
    // migrateLegacyKey/backfill configured never pays for a JSON.stringify
    // it doesn't need on every single hydrate.
    if (adoptedLegacy || JSON.stringify(normalised) !== JSON.stringify(parsed)) {
      AsyncStorage.setItem(k.records, JSON.stringify(normalised)).catch(() => {});
    }

    const merge = config.mergeWithSeeds ?? defaultMergeWithSeeds;
    snapshot = merge(normalised.filter(config.isValid), config.seeds ?? []);
    meta = rawMeta ? (JSON.parse(rawMeta) as MetaMap) : {};
    outbox = rawOutbox ? (JSON.parse(rawOutbox) as OutboxOp[]) : [];
    notify();

    attachFirestoreListener();
    refreshSyncStatus();
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
  if (typeof window !== "undefined") {
    onAuthStateChanged(auth, (user) => {
      void hydrate(user?.uid ?? null);
    });
  }

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
      commitOutbox(enqueueOps(outbox, record, nextMeta));
      scheduleDrain();
    }
  }

  function adoptRemote(record: T, revision: number) {
    const nextRecords = snapshot.some((existing) => existing.id === record.id)
      ? snapshot.map((existing) => (existing.id === record.id ? record : existing))
      : [...snapshot, record];

    commitRecords(nextRecords);
    commitMeta({
      ...meta,
      [record.id]: { updatedAt: revision, dirty: false, remoteConfirmed: true },
    });
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
    useSyncStatus: () => useSyncExternalStore(subscribe, () => syncStatus),
    put,
    adoptRemote,
    remove,
  };
}
