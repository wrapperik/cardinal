import { backfillSession, isSession, sessionRemoteRevision } from "@/features/sessions/session-rules";
import type { LocalSession, SessionTally } from "@/features/sessions/session-rules";
import { createSyncedStore, type SyncedStoreConfig } from "@/lib/sync/store";
import type { FieldAdapterConfig } from "@/lib/sync/adapter";

const LEGACY_STORAGE_KEY = "cardinal.sessions";

/**
 * `users/{uid}/sessions/{sessionId}` carries ownership in its path, so it has
 * no owner field. `startedAt` is fixed at creation; `endedAt` is a client
 * timestamp only once the session closes.
 */
export const SESSION_FIELD: FieldAdapterConfig = {
  idField: "sessionId",
  ownerIdField: null,
  timestampFields: ["startedAt", "endedAt"],
  serverTimestamps: { startedAt: "onCreate" },
};

const sessionSyncConfig: SyncedStoreConfig<LocalSession> = {
  name: "sessions",
  collectionPath: (uid) => `users/${uid}/sessions`,
  pathIsOwnerScoped: true,
  field: SESSION_FIELD,
  remoteUpdatedAtField: "startedAt",
  remoteRevision: sessionRemoteRevision,
  isValid: isSession,
  migrateLegacyKey: LEGACY_STORAGE_KEY,
  backfill: backfillSession,
};

const store = createSyncedStore<LocalSession>(sessionSyncConfig);

export function useSessions(): LocalSession[] {
  return store.useRecords();
}

export function getSessions(): LocalSession[] {
  return store.getRecords();
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
    deckId: null,
    startedAt: Date.now(),
    endedAt: null,
    correctCount: 0,
    wrongCount: 0,
    passedCount: 0,
    bestStreakInSession: 0,
    gameTypesPlayed: [],
  };
  store.put(session);
  return session;
}

/**
 * Copies only the tally's persisted counters, not `currentStreak` — that
 * field is a live run that exists purely to feed `bestStreakInSession` while
 * a session is in progress, and has no meaning once the session is over.
 */
export function finishSession(id: string, tally: SessionTally): void {
  const session = store.getRecords().find((candidate) => candidate.id === id);
  if (!session) return;

  store.put({
    ...session,
    endedAt: Date.now(),
    correctCount: tally.correctCount,
    wrongCount: tally.wrongCount,
    passedCount: tally.passedCount,
    bestStreakInSession: tally.bestStreakInSession,
    gameTypesPlayed: tally.gameTypesPlayed,
  });
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
