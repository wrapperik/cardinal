import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";

import { sanitiseCheckpoints } from "@/features/recap/recap-rules";
import type { Checkpoint } from "@/features/recap/recap-rules";

const STORAGE_KEY = "cardinal.checkpoints";

/**
 * A module-level store rather than a context, for the same reason as
 * src/features/upload/courses.ts — the recap detail screen and the recap
 * player both need this, and there is nothing to seed since a fresh install
 * has nobody mid-recap yet.
 */
let snapshot: Record<string, Checkpoint> = {};

const listeners = new Set<() => void>();

function commit(next: Record<string, Checkpoint>) {
  snapshot = next;
  listeners.forEach((l) => l());
  // Fire-and-forget: a failed write costs the player one resume point next
  // launch, which is not worth interrupting the recap over.
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return snapshot;
}

// Hydrate once at import. Anything already rendered re-renders when it lands;
// until then every screen just shows no checkpoints, which is the correct
// fallback rather than a loading state.
AsyncStorage.getItem(STORAGE_KEY)
  .then((raw) => {
    if (!raw) return;
    const parsed: unknown = JSON.parse(raw);
    snapshot = sanitiseCheckpoints(parsed);
    listeners.forEach((l) => l());
  })
  .catch(() => {});

export function useCheckpoints(): Record<string, Checkpoint> {
  return useSyncExternalStore(subscribe, getSnapshot);
}

export function getCheckpoint(courseId: string): Checkpoint | undefined {
  return snapshot[courseId];
}

/**
 * A checkpoint at or past the queue's end has nothing left to resume —
 * storing one anyway would let the course detail screen offer a "continue"
 * that ends the recap the instant it is tapped. So a finished recap clears
 * its checkpoint instead of recording a terminal one.
 */
export function saveCheckpoint(courseId: string, index: number, total: number): void {
  if (index >= total) {
    clearCheckpoint(courseId);
    return;
  }
  commit({ ...snapshot, [courseId]: { index, total, updatedAt: Date.now() } });
}

export function clearCheckpoint(courseId: string): void {
  if (!(courseId in snapshot)) return;
  const next = { ...snapshot };
  delete next[courseId];
  commit(next);
}
