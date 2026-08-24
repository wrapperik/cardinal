/**
 * Durable write-queue logic: coalescing a new op into an already-pending
 * queue, and classifying a failed attempt as worth retrying or not.
 *
 * Pure — no AsyncStorage or Firestore imports. The Firebase JS SDK only
 * queues offline writes in memory, and React Native has no persistent local
 * cache for Firestore to fall back on (see the note in firebase.native.ts),
 * so a write made while offline would otherwise die the moment the app is
 * killed. store.ts is what actually persists this queue and attempts the
 * writes; this module only decides what the queue should look like next.
 */

import type { FailureClass, OutboxOp, OutboxOpKind } from "./types";

/**
 * A not-yet-materialized op: same shape as OutboxOp, minus the two fields
 * store.ts shouldn't have to invent when it first enqueues one. Built by
 * mapping over the kind union rather than `Omit<OutboxOp, ...>` directly,
 * since `Omit` applied straight to a discriminated union collapses it to the
 * intersection of member keys and loses the kind/payload correlation.
 */
type NewOutboxOp = {
  [K in OutboxOpKind]: Omit<Extract<OutboxOp, { kind: K }>, "attempts" | "nextAttemptAt"> & {
    attempts?: number;
    nextAttemptAt?: number;
  };
}[OutboxOpKind];

/**
 * Folds a new op into an existing, already-coalesced queue.
 *
 * A `delete` absorbs whatever was already queued for the same doc — there is
 * no point sending an edit that a subsequent delete will erase anyway, so
 * repeated `set`/`update` ops collapse to just the latest payload, and any
 * op followed by a `delete` collapses to just the delete.
 *
 * The reverse is deliberately NOT collapsed: a `set` or `update` arriving
 * after a queued `delete` is a resurrection — the record was deleted and
 * then recreated (or un-deleted) before the delete ever reached the server —
 * so it is appended as its own entry rather than merged into the delete.
 * Draining the delete first and the write second still lands on the correct
 * final state (the record exists), even though the delete's target may
 * already be gone by the time it runs, because deleting a document that does
 * not exist is a harmless no-op in Firestore. A second delete queued behind
 * an already-pending delete is simply dropped, since one is all draining
 * needs to do.
 *
 * Collapsing into an existing entry keeps that entry's position in the
 * array rather than moving it to the back — this is what keeps drain order
 * strict global FIFO across different documents: an op's place in the queue
 * is set once, by whichever write first opened it, and further edits to the
 * same doc update its content without letting it cut in front of — or
 * behind — anyone else's pending op.
 */
export function enqueue(queue: OutboxOp[], op: NewOutboxOp): OutboxOp[] {
  const materialized = {
    ...op,
    attempts: op.attempts ?? 0,
    nextAttemptAt: op.nextAttemptAt ?? op.createdAt,
    // kind and payload are copied verbatim from `op`, whose own type already
    // keeps them correlated — the cast just re-asserts that correlation
    // after the spread widens it.
  } as OutboxOp;

  const index = queue.findIndex((existing) => existing.docId === materialized.docId);
  if (index === -1) return [...queue, materialized];

  const existing = queue[index];
  if (existing.kind === "delete") {
    if (materialized.kind === "delete") return queue;
    return [...queue, materialized];
  }

  const next = [...queue];
  next[index] = {
    ...existing,
    kind: materialized.kind,
    payload: materialized.payload,
    createdAt: materialized.createdAt,
    attempts: 0,
    nextAttemptAt: materialized.nextAttemptAt,
  } as OutboxOp;
  return next;
}

export function removeOp(queue: OutboxOp[], opId: string): OutboxOp[] {
  return queue.filter((op) => op.opId !== opId);
}

export function replaceOp(queue: OutboxOp[], next: OutboxOp): OutboxOp[] {
  return queue.map((op) => (op.opId === next.opId ? next : op));
}

/**
 * The op strict FIFO drain should attempt next: the queue head, but only
 * once its backoff has elapsed. Returning null rather than skipping ahead to
 * a later, currently-due op is what keeps drain order strict FIFO — a
 * troublesome head briefly stalls the whole queue instead of letting other
 * docs' writes reorder around it, which is an acceptable trade for a
 * small-volume app and much simpler to reason about than per-doc
 * parallelism.
 */
export function nextToDrain(queue: OutboxOp[], now: number): OutboxOp | null {
  const [head] = queue;
  if (!head) return null;
  return head.nextAttemptAt <= now ? head : null;
}

/**
 * Codes the Firestore JS SDK attaches to a FirestoreError. A rules rejection
 * or a malformed request is terminal — retrying sends the exact same request
 * into the exact same rejection — while everything network- or
 * server-load-shaped is worth another attempt. An unrecognised or missing
 * code defaults to retryable rather than terminal: dropping an op silently
 * loses a write the user believes is saved, while a wrong "keep retrying"
 * only costs some backoff cycles before someone notices.
 */
const TERMINAL_CODES = new Set([
  "permission-denied",
  "unauthenticated",
  "invalid-argument",
  "failed-precondition",
  "not-found",
  "already-exists",
  "out-of-range",
  "unimplemented",
  "data-loss",
]);

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const candidate = (error as { code?: unknown }).code;
  return typeof candidate === "string" ? candidate : undefined;
}

export function classifyFailure(error: unknown): FailureClass {
  const code = errorCode(error);
  return code && TERMINAL_CODES.has(code) ? "terminal" : "retryable";
}

const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 60000;

/**
 * `attempts` is the count of failed attempts so far. The first retry
 * (attempts=1) waits 1s, doubling each subsequent attempt up to a 60s cap —
 * 1s, 2s, 4s, 8s, 16s, 32s, 60s, 60s, ...
 */
export function backoffMs(attempts: number): number {
  const exponent = Math.max(0, attempts - 1);
  return Math.min(BASE_DELAY_MS * 2 ** exponent, MAX_DELAY_MS);
}

export interface FailureOutcome {
  class: FailureClass;
  /** The op to requeue, with attempts/nextAttemptAt advanced. Absent when the op should be dropped instead. */
  op?: OutboxOp;
}

/**
 * Applies one failed attempt to an op. A terminal failure drops it — the
 * caller is expected to surface it, since nothing about retrying changes the
 * outcome — while a retryable one bumps the attempt count and schedules the
 * next try, without touching the op's position in the queue.
 */
export function applyFailure(op: OutboxOp, error: unknown, now: number): FailureOutcome {
  const failureClass = classifyFailure(error);
  if (failureClass === "terminal") return { class: failureClass };

  const attempts = op.attempts + 1;
  return {
    class: failureClass,
    op: { ...op, attempts, nextAttemptAt: now + backoffMs(attempts) },
  };
}
