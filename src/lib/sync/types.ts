/**
 * Shared types for the sync layer, kept in their own module so adapter.ts,
 * outbox.ts, and merge.ts can each import just the shapes they need without
 * pulling the other two in — none of the three needs to know about the
 * others' internals.
 */

/**
 * Sidecar metadata for one local record, persisted under its own AsyncStorage
 * key rather than folded into the record itself. Keeping it separate means a
 * store's local record type never has to grow an `updatedAt` field just to
 * support sync — which is what lets Chunk 2 swap `createSyncedStore` in for
 * an existing module-level store without touching that store's type, without
 * migrating whatever an already-installed app already has in AsyncStorage,
 * and without disturbing the seed-id stability every existing store relies
 * on (`seedCourses` deliberately gives seeded courses `createdAt: 0`; a
 * record-level `updatedAt` would have needed a matching fake value too).
 *
 * `remoteConfirmed` is not part of the two-field shape this was originally
 * scoped as, but turned out to be load-bearing: a `set` (the full-document
 * write used for a record's first create) and an `update` (a partial write)
 * build genuinely different payloads — a create must force `createdAt` to
 * serverTimestamp(), while an update must omit that field entirely so
 * firestore.rules' `unchanged('createdAt')` still holds. Without recording
 * whether Firestore has ever acknowledged a given id, a second edit made
 * while the first create is still in flight has no way to know it should
 * still be a `set`, and would misclassify as an `update` against a document
 * that does not exist yet.
 */
export interface RecordMeta {
  /** Epoch millis of the last local write. Drives last-write-wins reconciliation. */
  updatedAt: number;
  /** True from the moment a local write happens until its op has drained successfully. */
  dirty: boolean;
  /** Whether Firestore has ever acknowledged this id — see the note above. */
  remoteConfirmed: boolean;
}

export type MetaMap = Record<string, RecordMeta>;

/**
 * Stands in for firebase/firestore's `serverTimestamp()` FieldValue.
 * Producing the real thing requires importing firebase/firestore at runtime,
 * which every pure module in this directory deliberately avoids so vitest
 * can run them under plain node with no alias resolution — so the adapter
 * hands back this marker instead, and store.ts (the one impure, untested
 * module here) is the only place that swaps it for the genuine FieldValue
 * right before a write goes out.
 */
export const SERVER_TIMESTAMP = "cardinal/serverTimestamp" as const;
export type ServerTimestampMarker = typeof SERVER_TIMESTAMP;

export type OutboxOpKind = "set" | "update" | "delete";

interface OutboxOpBase {
  opId: string;
  /** Firestore collection path the op targets, e.g. "courses" or "users/abc/sessions". */
  collection: string;
  docId: string;
  /** Count of prior failed attempts. Zero before the first send. */
  attempts: number;
  /** Epoch millis. The drain loop leaves this op alone until now is past it. */
  nextAttemptAt: number;
  createdAt: number;
}

/**
 * `set` is a full-document write (setDoc), used for a record's first create
 * since firestore.rules' `create` branch expects every required field
 * present. `update` is a partial write (updateDoc), used for every edit
 * after that so fields the adapter deliberately omitted — like an immutable
 * `createdAt` — are left untouched rather than sent as `undefined`.
 *
 * `set` and `update` are kept as separate union members rather than combined
 * under one `kind: "set" | "update"` branch, even though they share a
 * payload shape — collapsing them would make `Extract<OutboxOp, {kind:
 * "set"}>` evaluate to `never`, since a member typed `"set" | "update"` does
 * not structurally extend `{ kind: "set" }`. outbox.ts's `NewOutboxOp` type
 * relies on that Extract to distribute correctly.
 */
export type OutboxOp =
  | (OutboxOpBase & { kind: "set"; payload: Record<string, unknown> })
  | (OutboxOpBase & { kind: "update"; payload: Record<string, unknown> })
  | (OutboxOpBase & { kind: "delete"; payload: null });

export type FailureClass = "retryable" | "terminal";
