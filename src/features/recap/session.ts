import { useSyncExternalStore } from "react";

import { clearCheckpoint, getCheckpoint, saveCheckpoint } from "@/features/recap/checkpoints";
import { clearLastRun, setLastRun } from "@/features/recap/last-run";
import { getProgress, recordProgress } from "@/features/progress/progress";
import {
  advanceRecap,
  buildRecapPlan,
  isRecapComplete,
  resumeIndex,
  type RecapState,
} from "@/features/recap/recap-rules";
import { accuracyOf, MAX_SESSION_MILLIS, scoreForTally } from "@/features/score/score";
import { emptyTally } from "@/features/sessions/session-rules";
import { finishSession, getSessions, startSession } from "@/features/sessions/sessions";
import { courseById } from "@/features/upload/courses";
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

  // Starting a run invalidates the last one's summary. Without this, the
  // completion screen stays reachable with a stale result long after the run
  // it described — and endRecap() just above may itself have written one for
  // a run that finished on the way in here.
  clearLastRun();

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

  // Only a genuinely completed run gets recorded — this is also the abandon
  // path (runner.ts's abandon() calls it), and an abandoned run must not
  // produce a completion screen.
  if (isRecapComplete(snapshot)) {
    clearCheckpoint(snapshot.courseId);

    const finished = getSessions().find((s) => s.id === snapshot?.sessionId);
    const millis = finished?.endedAt != null
      ? Math.min(MAX_SESSION_MILLIS, Math.max(0, finished.endedAt - finished.startedAt))
      : 0;
    const { tally, courseId } = snapshot;

    setLastRun({
      courseId,
      courseTitle: courseById(courseId)?.title ?? courseId,
      score: scoreForTally(tally),
      cardsAnswered: tally.correctCount + tally.wrongCount + tally.passedCount,
      correct: tally.correctCount,
      wrong: tally.wrongCount,
      passed: tally.passedCount,
      accuracy: accuracyOf(tally.correctCount, tally.wrongCount),
      bestStreak: tally.bestStreakInSession,
      millis,
      finishedAt: Date.now(),
    });
  }

  commit(null);
}

/**
 * Restarts the current course's recap from its first card: clears the
 * checkpoint FIRST so beginRecap's resumeIndex has nothing to resume from,
 * then reuses beginRecap wholesale — which already closes out the run being
 * discarded (via its own `if (snapshot) endRecap()`), and since that run is
 * not complete, endRecap will not write a completion summary or re-touch
 * the checkpoint. A restart is therefore not a new code path, just
 * beginRecap called against an emptied checkpoint.
 */
export function restartRecap(decks: LocalDeck[], courseId: string): RecapState | null {
  clearCheckpoint(courseId);
  return beginRecap(decks, courseId);
}
