import { useSyncExternalStore } from "react";

/**
 * A module-level store holding the single most recently completed run, same
 * pattern as recap/session.ts — but deliberately NOT persisted. By the time
 * this is written the session itself is already durably finished (see
 * finishSession in sessions.ts), so this only has to survive the navigation
 * from the game screen to the completion screen, not an app restart.
 */
export interface CompletedRun {
  courseId: string;
  courseTitle: string;
  score: number;
  cardsAnswered: number;
  correct: number;
  wrong: number;
  passed: number;
  /** 0–1. */
  accuracy: number;
  bestStreak: number;
  /** Wall-clock length of the run. */
  millis: number;
  finishedAt: number;
}

let snapshot: CompletedRun | null = null;

const listeners = new Set<() => void>();

function commit(next: CompletedRun | null) {
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

export function useLastRun(): CompletedRun | null {
  return useSyncExternalStore(subscribe, getSnapshot);
}

export function getLastRun(): CompletedRun | null {
  return snapshot;
}

export function setLastRun(run: CompletedRun): void {
  commit(run);
}

export function clearLastRun(): void {
  commit(null);
}
