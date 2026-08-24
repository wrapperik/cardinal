import { useSyncExternalStore } from "react";

import { clearCheckpoint, getCheckpoint, saveCheckpoint } from "@/features/recap/checkpoints";
import { getProgress, recordProgress } from "@/features/progress/progress";
import {
  advanceRecap,
  buildRecapPlan,
  isRecapComplete,
  resumeIndex,
  type RecapState,
} from "@/features/recap/recap-rules";
import { emptyTally } from "@/features/sessions/session-rules";
import { finishSession, startSession } from "@/features/sessions/sessions";
import type { LocalDeck } from "@/features/upload/types";
import type { AnswerResult } from "@/types/cardinal";

/**
 * A module-level store, same pattern as checkpoints.ts — but deliberately
 * NOT persisted. This is live runtime state for whichever recap is currently
 * being played; the durable part of it is already the checkpoint, saved
 * separately on every answer. Losing this snapshot to an app restart just
 * means the next visit resumes from the last saved checkpoint instead of
 * mid-round, which is the correct fallback, not a bug to work around with
 * AsyncStorage.
 */
let snapshot: RecapState | null = null;

const listeners = new Set<() => void>();

function commit(next: RecapState | null) {
  snapshot = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return snapshot;
}

export function useActiveRecap(): RecapState | null {
  return useSyncExternalStore(subscribe, getSnapshot);
}

export function getActiveRecap(): RecapState | null {
  return snapshot;
}

/**
 * Builds the plan, resolves the checkpoint, opens a session. Null when the
 * course has no cards — every seeded/SAMPLE course today, which has nothing
 * stored to recap. The dispatcher route falls back to the shipped fixtures
 * in that case, so no session should be opened for a recap that never
 * actually starts.
 */
export function beginRecap(decks: LocalDeck[], courseId: string): RecapState | null {
  // Close out anything still standing before opening a new one. The normal
  // exits all run endRecap themselves, but a recap left live by a route this
  // store never hears about — an OS back gesture, a reload — would otherwise
  // have its session record orphaned open, and an unfinished session is
  // invisible to summariseSessions forever.
  if (snapshot) endRecap();

  const plan = buildRecapPlan(decks, courseId, getProgress());
  if (plan.cards.length === 0) return null;

  const index = resumeIndex(getCheckpoint(courseId), plan);
  const session = startSession(courseId);
  const state: RecapState = { courseId, plan, index, sessionId: session.id, tally: emptyTally() };
  commit(state);
  return state;
}

/**
 * Folds in one answer and persists the new position as a checkpoint.
 * No-ops when there is no active recap — a report that arrives after
 * `endRecap` (a late verdict timeout, say) must not resurrect a session.
 */
export function reportRecapAnswer(result: AnswerResult): void {
  if (!snapshot) return;
  const card = snapshot.plan.cards[snapshot.index];
  if (!card) return;

  recordProgress(card, result);
  const next = advanceRecap(snapshot, result);
  // Self-clears at completion — saveCheckpoint drops the entry rather than
  // storing a terminal index once `index` reaches the plan's end.
  saveCheckpoint(next.courseId, next.index, next.plan.cards.length);
  commit(next);
}

/**
 * Ends the session record. Clears the checkpoint only when the plan actually
 * finished — an abandoned recap has to leave its checkpoint standing, or the
 * next visit would start over instead of resuming where the player left off.
 * Safe to call twice: a second call finds no active recap and no-ops.
 */
export function endRecap(): void {
  if (!snapshot) return;
  finishSession(snapshot.sessionId, snapshot.tally);
  if (isRecapComplete(snapshot)) clearCheckpoint(snapshot.courseId);
  commit(null);
}
