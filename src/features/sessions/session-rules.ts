/**
 * Pure rules for a study session's running tally and its finished-session
 * summary. No React Native imports on purpose — exercised directly by vitest
 * under node, same reasoning as course-rules.ts and course-stats.ts.
 */

// Relative, not "@/features/upload/course-stats": this module is loaded
// directly by vitest, which has no alias resolution configured, so the one
// runtime dependency this pure file has must be resolvable on its own. See
// the equivalent note in extract/parse.ts.
import { GAME_TYPE_ORDER } from "../upload/course-stats";
import type { AnswerResult, GameType } from "@/types/cardinal";

export interface SessionTally {
  correctCount: number;
  wrongCount: number;
  passedCount: number;
  bestStreakInSession: number;
  /** Live run of correct answers; not persisted, it only feeds bestStreak. */
  currentStreak: number;
  gameTypesPlayed: GameType[];
}

export function emptyTally(): SessionTally {
  return {
    correctCount: 0,
    wrongCount: 0,
    passedCount: 0,
    bestStreakInSession: 0,
    currentStreak: 0,
    gameTypesPlayed: [],
  };
}

/**
 * Immutable — returns a new tally, so this can live in React state.
 *
 * A pass breaks the streak exactly like a wrong answer does. `RecallQuality`
 * in @/types/cardinal.ts already grades a pass as 0 — the worst grade a card
 * can receive, below even a wrong answer's 2 — so letting a streak survive a
 * pass would contradict how the app already scores recall everywhere else.
 *
 * `gameTypesPlayed` accumulates in `GAME_TYPE_ORDER` rather than arrival
 * order, so the summary reads the same regardless of which template the
 * player happened to hit first.
 */
export function recordAnswer(tally: SessionTally, result: AnswerResult, gameType: GameType): SessionTally {
  const currentStreak = result === "correct" ? tally.currentStreak + 1 : 0;
  const gameTypesPlayed = tally.gameTypesPlayed.includes(gameType)
    ? tally.gameTypesPlayed
    : GAME_TYPE_ORDER.filter((gt) => gt === gameType || tally.gameTypesPlayed.includes(gt));

  return {
    correctCount: tally.correctCount + (result === "correct" ? 1 : 0),
    wrongCount: tally.wrongCount + (result === "incorrect" ? 1 : 0),
    passedCount: tally.passedCount + (result === "passed" ? 1 : 0),
    bestStreakInSession: Math.max(tally.bestStreakInSession, currentStreak),
    currentStreak,
    gameTypesPlayed,
  };
}

const VALID_GAME_TYPES = new Set<GameType>(GAME_TYPE_ORDER);

/**
 * Mirrors `SessionDoc` in @/types/cardinal.ts, with one deliberate
 * difference: it uses epoch millis rather than `Timestamp`, exactly as
 * `LocalDeck` mirrors `DeckDoc`.
 */
export interface LocalSession {
  id: string;
  courseId: string;
  /** Null when the session spans a course rather than one deck. */
  deckId: string | null;
  startedAt: number;
  /** Null while the session is still open. */
  endedAt: number | null;
  correctCount: number;
  wrongCount: number;
  passedCount: number;
  bestStreakInSession: number;
  gameTypesPlayed: GameType[];
}

export function isSession(value: unknown): value is LocalSession {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<LocalSession>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.courseId === "string" &&
    (candidate.deckId === null || typeof candidate.deckId === "string") &&
    Number.isFinite(candidate.startedAt) &&
    (candidate.endedAt === null || Number.isFinite(candidate.endedAt)) &&
    // Counters are integers, not merely numbers: they are summed and divided
    // in summariseSessions, and a single NaN survivor propagates all the way
    // out to an accuracy figure rendered on screen.
    Number.isInteger(candidate.correctCount) &&
    Number.isInteger(candidate.wrongCount) &&
    Number.isInteger(candidate.passedCount) &&
    Number.isInteger(candidate.bestStreakInSession) &&
    Array.isArray(candidate.gameTypesPlayed) &&
    candidate.gameTypesPlayed.every((gt) => VALID_GAME_TYPES.has(gt))
  );
}

/**
 * Adds the nullable deck field to sessions written before sessions began
 * recording their scope. Kept separate from validation so createSyncedStore
 * can persist the correction during hydration before `isSession` filters it.
 */
export function backfillSession(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const candidate = value as Record<string, unknown>;
  return "deckId" in candidate ? candidate : { ...candidate, deckId: null };
}

/** A finished session supersedes the otherwise immutable time it opened. */
export function sessionRemoteRevision(session: LocalSession): number {
  return session.endedAt ?? session.startedAt;
}

/** Validates hydrated session data, dropping anything malformed, in the style of `mergeCourses`'s use of `isCourse`. */
export function sanitiseSessions(value: unknown): LocalSession[] {
  return Array.isArray(value) ? value.map(backfillSession).filter(isSession) : [];
}

export interface CourseSummary {
  sessionCount: number;
  totalCorrect: number;
  totalWrong: number;
  totalPassed: number;
  /** 0–1. Zero when nothing has been answered, never NaN. */
  accuracy: number;
  bestStreak: number;
  /** Epoch millis of the most recent finished session, or null. */
  lastStudiedAt: number | null;
}

/**
 * Only finished sessions (`endedAt !== null`) count — an open session's
 * counters are still moving, so folding it in would understate or overstate
 * the summary depending on exactly when this happens to run.
 *
 * Passes are excluded from the accuracy denominator because a passed card was
 * never actually answered right or wrong; counting it against the player
 * would punish the one outcome that explicitly is not a wrong answer. The
 * divide-by-zero guard on an unstarted course mirrors the intent behind
 * `StatsDoc.overallAccuracy`'s comment in cardinal.ts — "stored rather than
 * computed so the client never divides by zero" — the storage strategy is
 * different here, but the reason not to let 0/0 reach the screen is the same.
 */
export function summariseSessions(sessions: LocalSession[], courseId: string): CourseSummary {
  const finished = sessions.filter((session) => session.courseId === courseId && session.endedAt !== null);

  const totalCorrect = finished.reduce((sum, session) => sum + session.correctCount, 0);
  const totalWrong = finished.reduce((sum, session) => sum + session.wrongCount, 0);
  const totalPassed = finished.reduce((sum, session) => sum + session.passedCount, 0);
  const answered = totalCorrect + totalWrong;

  const lastStudiedAt = finished.reduce<number | null>((latest, session) => {
    const endedAt = session.endedAt as number;
    return latest === null || endedAt > latest ? endedAt : latest;
  }, null);

  return {
    sessionCount: finished.length,
    totalCorrect,
    totalWrong,
    totalPassed,
    accuracy: answered === 0 ? 0 : totalCorrect / answered,
    bestStreak: finished.reduce((max, session) => Math.max(max, session.bestStreakInSession), 0),
    lastStudiedAt,
  };
}
