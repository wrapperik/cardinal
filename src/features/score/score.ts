/**
 * Pure scoring over finished sessions: a per-session point total, a daily
 * recap summary, the study-streak count, and small display helpers. No React
 * Native imports on purpose — exercised directly by vitest under node, same
 * reasoning as session-rules.ts.
 */

import type { LocalSession, SessionTally } from "@/features/sessions/session-rules";

/** Points an answer is worth. A wrong answer still earns: you saw the card. A pass earns nothing — it was never attempted. */
export const SCORE_WEIGHTS = { correct: 10, wrong: 3, passed: 0 } as const;
/** Streaks shorter than this earn no bonus — two right answers in a row is luck, not a run. */
export const STREAK_BONUS_FROM = 3;
/** Points per streak step at or past STREAK_BONUS_FROM. */
export const STREAK_BONUS_STEP = 5;
/** Longest a single session can contribute to time studied. Guards a session left open. */
export const MAX_SESSION_MILLIS = 90 * 60 * 1000;
/** Rough seconds a player spends on one card, for the recap length estimate. */
export const SECONDS_PER_CARD = 15;

export interface DailyStats {
  score: number;
  cardsStudied: number;
  correct: number;
  wrong: number;
  passed: number;
  /** 0–1. Zero when nothing has been answered, never NaN. */
  accuracy: number;
  bestStreak: number;
  sessionCount: number;
  studyMillis: number;
}

export const EMPTY_DAILY: DailyStats = {
  score: 0,
  cardsStudied: 0,
  correct: 0,
  wrong: 0,
  passed: 0,
  accuracy: 0,
  bestStreak: 0,
  sessionCount: 0,
  studyMillis: 0,
};

/**
 * Local midnight preceding `at`, not a UTC modulo — a UTC day boundary would
 * roll every stat over at the wrong hour for most of the world, and the
 * whole point of a "daily" recap is that it matches the calendar day the
 * player is actually living in.
 */
export function startOfDay(at: number): number {
  const date = new Date(at);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/**
 * Only finished sessions score — an open session's counters and elapsed time
 * are still moving, so folding one in would understate or overstate the
 * total depending on exactly when this happens to run. `summariseSessions`
 * in session-rules.ts documents this same reasoning for course summaries.
 *
 * The streak bonus rewards runs, not merely long ones: a bestStreak of 2 or
 * fewer is indistinguishable from luck and earns nothing, and each step past
 * STREAK_BONUS_FROM adds one more STREAK_BONUS_STEP.
 */
export function scoreForSession(session: LocalSession): number {
  if (session.endedAt === null) return 0;

  return scoreForTally({
    correctCount: session.correctCount,
    wrongCount: session.wrongCount,
    passedCount: session.passedCount,
    bestStreakInSession: session.bestStreakInSession,
    currentStreak: 0,
    gameTypesPlayed: session.gameTypesPlayed,
  });
}

/**
 * The live equivalent of scoreForSession, over a tally that is still moving.
 * Both must stay one formula: a HUD that counts differently from the summary
 * it leads to is worse than no HUD.
 */
export function scoreForTally(tally: SessionTally): number {
  const base =
    tally.correctCount * SCORE_WEIGHTS.correct +
    tally.wrongCount * SCORE_WEIGHTS.wrong +
    tally.passedCount * SCORE_WEIGHTS.passed;
  const streakBonus = Math.max(0, tally.bestStreakInSession - (STREAK_BONUS_FROM - 1)) * STREAK_BONUS_STEP;

  return base + streakBonus;
}

/** Correct as a fraction of answered. Passes are excluded from the denominator — a passed card was never actually answered right or wrong. 0 when nothing was answered, never NaN. */
export function accuracyOf(correct: number, wrong: number): number {
  const answered = correct + wrong;
  return answered === 0 ? 0 : correct / answered;
}

/**
 * Everything finished since local midnight, folded into one summary. `now`
 * defaults to the live clock rather than being required, so call sites like
 * a home-screen recap card do not each have to remember to pass Date.now().
 *
 * Mirrors summariseSessions' accuracy and clamp reasoning exactly: passes
 * are excluded from the accuracy denominator because a passed card was never
 * actually answered right or wrong, and studyMillis is clamped to
 * MAX_SESSION_MILLIS per session so a session left open overnight cannot
 * inflate "time studied today" by however long it happened to sit idle.
 */
export function dailyStats(sessions: LocalSession[], now: number = Date.now()): DailyStats {
  const todayStart = startOfDay(now);
  const finished = sessions.filter(
    (session) => session.endedAt !== null && session.endedAt >= todayStart,
  );

  if (finished.length === 0) return EMPTY_DAILY;

  const correct = finished.reduce((sum, session) => sum + session.correctCount, 0);
  const wrong = finished.reduce((sum, session) => sum + session.wrongCount, 0);
  const passed = finished.reduce((sum, session) => sum + session.passedCount, 0);
  const studyMillis = finished.reduce((sum, session) => {
    const elapsed = (session.endedAt as number) - session.startedAt;
    return sum + Math.min(MAX_SESSION_MILLIS, Math.max(0, elapsed));
  }, 0);

  return {
    score: finished.reduce((sum, session) => sum + scoreForSession(session), 0),
    cardsStudied: correct + wrong + passed,
    correct,
    wrong,
    passed,
    accuracy: accuracyOf(correct, wrong),
    bestStreak: finished.reduce((max, session) => Math.max(max, session.bestStreakInSession), 0),
    sessionCount: finished.length,
    studyMillis,
  };
}

/**
 * A local calendar day, as a comparable `YYYY-MM-DD` key.
 *
 * Deliberately not "epoch millis divided into 24-hour buckets": a local day
 * is 23 or 25 hours long on the two days a year the clocks move, so bucketing
 * by a fixed 86,400,000 drifts an hour out of step from the first DST change
 * onwards and starts attributing a session to the wrong day. A key derived
 * from the local calendar fields cannot drift, because it asks the calendar
 * what day it was rather than doing arithmetic on the answer.
 */
function dayKey(at: number): string {
  const date = new Date(at);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/** The local calendar day before the one containing `at`, at its own midnight. */
function previousDay(at: number): number {
  const date = new Date(at);
  // setDate handles month, year and DST rollover itself; subtracting a day's
  // worth of millis would land at 23:00 or 01:00 rather than midnight when a
  // clock change falls between the two dates.
  date.setDate(date.getDate() - 1);
  return startOfDay(date.getTime());
}

/**
 * Consecutive calendar days ending today (or yesterday, if today is still
 * empty) that have at least one finished session. Starting from yesterday
 * when today is empty means the streak survives until the player has
 * actually missed a whole day, rather than dropping to zero the moment
 * midnight passes and before they have had a chance to study today.
 *
 * The days a player actually studied are collected into a Set once, rather
 * than re-scanning every session per day walked backwards — a long streak
 * over a long history is otherwise quadratic for no reason.
 */
export function studyStreakDays(sessions: LocalSession[], now: number = Date.now()): number {
  const studied = new Set(
    sessions
      .filter((session) => session.endedAt !== null)
      .map((session) => dayKey(session.endedAt as number)),
  );
  if (studied.size === 0) return 0;

  let cursor = startOfDay(now);
  if (!studied.has(dayKey(cursor))) {
    cursor = previousDay(cursor);
    if (!studied.has(dayKey(cursor))) return 0;
  }

  let streak = 0;
  while (studied.has(dayKey(cursor))) {
    streak += 1;
    cursor = previousDay(cursor);
  }
  return streak;
}

/** "0MIN" | "7MIN" | "1H 12M" — uppercase, matching every other label in the app. */
export function formatDuration(millis: number): string {
  if (!Number.isFinite(millis) || millis < 0) return "0MIN";

  const totalMinutes = Math.floor(millis / 60000);
  if (totalMinutes < 60) return `${totalMinutes}MIN`;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}H ${minutes}M`;
}

/** Whole minutes a recap of `cardCount` cards should take. 0 cards → 0. */
export function estimateRecapMinutes(cardCount: number): number {
  if (cardCount <= 0) return 0;
  return Math.max(1, Math.round((cardCount * SECONDS_PER_CARD) / 60));
}
