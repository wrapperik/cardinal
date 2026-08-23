import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";

import { sanitiseSessions } from "@/features/sessions/session-rules";
import type { LocalSession, SessionTally } from "@/features/sessions/session-rules";

const STORAGE_KEY = "cardinal.sessions";

/**
 * A module-level store rather than a context, for the same reason as
 * src/features/upload/decks.ts — sessions are read from the recap player and
 * the course detail screen, and there is nothing to seed here since a fresh
 * install has no history yet.
 */
let snapshot: LocalSession[] = [];

const listeners = new Set<() => void>();

function commit(next: LocalSession[]) {
  snapshot = next;
  listeners.forEach((l) => l());
  // Fire-and-forget: a failed write costs the player one session's stats
  // next launch, which is not worth interrupting the recap over.
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
// until then every screen just shows no sessions, which is the correct
// fallback rather than a loading state.
AsyncStorage.getItem(STORAGE_KEY)
  .then((raw) => {
    if (!raw) return;
    const parsed: unknown = JSON.parse(raw);
    snapshot = sanitiseSessions(parsed);
    listeners.forEach((l) => l());
  })
  .catch(() => {});

export function useSessions(): LocalSession[] {
  return useSyncExternalStore(subscribe, getSnapshot);
}

export function getSessions(): LocalSession[] {
  return snapshot;
}

/**
 * Not a slug of anything user-visible — unlike course ids, nobody reads a
 * session id — so a timestamp plus a random tail is enough to keep two
 * sessions started in the same millisecond apart.
 */
function makeSessionId(): string {
  return `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function startSession(courseId: string): LocalSession {
  const session: LocalSession = {
    id: makeSessionId(),
    courseId,
    startedAt: Date.now(),
    endedAt: null,
    correctCount: 0,
    wrongCount: 0,
    passedCount: 0,
    bestStreakInSession: 0,
    gameTypesPlayed: [],
  };
  commit([...snapshot, session]);
  return session;
}

/**
 * Copies only the tally's persisted counters, not `currentStreak` — that
 * field is a live run that exists purely to feed `bestStreakInSession` while
 * a session is in progress, and has no meaning once the session is over.
 */
export function finishSession(id: string, tally: SessionTally): void {
  commit(
    snapshot.map((session) =>
      session.id === id
        ? {
            ...session,
            endedAt: Date.now(),
            correctCount: tally.correctCount,
            wrongCount: tally.wrongCount,
            passedCount: tally.passedCount,
            bestStreakInSession: tally.bestStreakInSession,
            gameTypesPlayed: tally.gameTypesPlayed,
          }
        : session,
    ),
  );
}

/**
 * Takes `sessions` as a parameter rather than reading the module snapshot,
 * for the same reason as `selectCards` in decks.ts — so a caller inside a
 * useMemo can depend on the subscription it already holds instead of going
 * stale the moment a session finishes.
 */
export function sessionsForCourse(sessions: LocalSession[], courseId: string): LocalSession[] {
  return sessions.filter((session) => session.courseId === courseId);
}
