import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot, type Unsubscribe } from "firebase/firestore";
import { useSyncExternalStore } from "react";

import { auth, db } from "@/lib/firebase";

export interface StatsSummary {
  totalCardsStudied: number;
  totalSessions: number;
  totalCorrect: number;
  totalWrong: number;
  overallAccuracy: number;
  cardsDueToday: number;
  updatedAt: number | null;
}

export const EMPTY_STATS: StatsSummary = {
  totalCardsStudied: 0,
  totalSessions: 0,
  totalCorrect: 0,
  totalWrong: 0,
  overallAccuracy: 0,
  cardsDueToday: 0,
  updatedAt: null,
};

function millisFromTimestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (
    value &&
    typeof value === "object" &&
    "toMillis" in value &&
    typeof value.toMillis === "function"
  ) {
    const result = value.toMillis();
    return typeof result === "number" && Number.isFinite(result) ? result : null;
  }
  return null;
}

function nonNegativeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

/** Maps the Function-owned document without giving this module any write path. */
export function statsFromFirestore(value: unknown): StatsSummary | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const totalCardsStudied = nonNegativeNumber(data.totalCardsStudied);
  const totalSessions = nonNegativeNumber(data.totalSessions);
  const totalCorrect = nonNegativeNumber(data.totalCorrect);
  const totalWrong = nonNegativeNumber(data.totalWrong);
  const overallAccuracy = nonNegativeNumber(data.overallAccuracy);
  const cardsDueToday = nonNegativeNumber(data.cardsDueToday);
  const updatedAt = millisFromTimestamp(data.updatedAt);

  if (
    totalCardsStudied === null ||
    totalSessions === null ||
    totalCorrect === null ||
    totalWrong === null ||
    overallAccuracy === null ||
    overallAccuracy > 1 ||
    cardsDueToday === null ||
    updatedAt === null
  ) {
    return null;
  }

  return {
    totalCardsStudied,
    totalSessions,
    totalCorrect,
    totalWrong,
    overallAccuracy,
    cardsDueToday,
    updatedAt,
  };
}

let snapshot = EMPTY_STATS;
let unsubscribe: Unsubscribe | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

onAuthStateChanged(auth, (user) => {
  unsubscribe?.();
  unsubscribe = null;
  snapshot = EMPTY_STATS;
  notify();

  if (!user) return;
  unsubscribe = onSnapshot(
    doc(db, "users", user.uid, "stats", "summary"),
    (document) => {
      snapshot = document.exists() ? statsFromFirestore(document.data()) ?? EMPTY_STATS : EMPTY_STATS;
      notify();
    },
    () => {
      snapshot = EMPTY_STATS;
      notify();
    },
  );
});

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useStats(): StatsSummary {
  return useSyncExternalStore(subscribe, () => snapshot);
}

export function getStats(): StatsSummary {
  return snapshot;
}
