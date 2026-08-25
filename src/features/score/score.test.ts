import { describe, expect, it } from "vitest";

import type { LocalSession, SessionTally } from "@/features/sessions/session-rules";

import {
  MAX_SESSION_MILLIS,
  STREAK_BONUS_FROM,
  STREAK_BONUS_STEP,
  SCORE_WEIGHTS,
  accuracyOf,
  dailyStats,
  estimateRecapMinutes,
  formatDuration,
  scoreForSession,
  scoreForTally,
  startOfDay,
  studyStreakDays,
} from "./score";

function tally(overrides: Partial<SessionTally> = {}): SessionTally {
  return {
    correctCount: 0,
    wrongCount: 0,
    passedCount: 0,
    bestStreakInSession: 0,
    currentStreak: 0,
    gameTypesPlayed: [],
    ...overrides,
  };
}

function session(overrides: Partial<LocalSession> = {}): LocalSession {
  return {
    id: "session-1",
    courseId: "geography",
    deckId: null,
    startedAt: 0,
    endedAt: 1000,
    correctCount: 0,
    wrongCount: 0,
    passedCount: 0,
    bestStreakInSession: 0,
    gameTypesPlayed: [],
    ...overrides,
  };
}

describe("scoreForSession", () => {
  it("scores an open session as zero", () => {
    expect(scoreForSession(session({ endedAt: null, correctCount: 10 }))).toBe(0);
  });

  it("weights correct, wrong, and passed answers per SCORE_WEIGHTS", () => {
    const value = scoreForSession(session({ correctCount: 2, wrongCount: 1, passedCount: 5 }));
    expect(value).toBe(2 * SCORE_WEIGHTS.correct + 1 * SCORE_WEIGHTS.wrong + 5 * SCORE_WEIGHTS.passed);
  });

  it("gives no streak bonus at or below STREAK_BONUS_FROM - 1", () => {
    const value = scoreForSession(session({ bestStreakInSession: STREAK_BONUS_FROM - 1 }));
    expect(value).toBe(0);
  });

  it("gives exactly one bonus step at STREAK_BONUS_FROM", () => {
    const value = scoreForSession(session({ bestStreakInSession: STREAK_BONUS_FROM }));
    expect(value).toBe(STREAK_BONUS_STEP);
  });

  it("gives two bonus steps one past STREAK_BONUS_FROM", () => {
    const value = scoreForSession(session({ bestStreakInSession: STREAK_BONUS_FROM + 1 }));
    expect(value).toBe(STREAK_BONUS_STEP * 2);
  });
});

describe("scoreForTally", () => {
  it("gives no streak bonus at or below STREAK_BONUS_FROM - 1", () => {
    expect(scoreForTally(tally({ bestStreakInSession: STREAK_BONUS_FROM - 1 }))).toBe(0);
  });

  it("gives exactly one bonus step at STREAK_BONUS_FROM", () => {
    expect(scoreForTally(tally({ bestStreakInSession: STREAK_BONUS_FROM }))).toBe(STREAK_BONUS_STEP);
  });

  it("gives two bonus steps one past STREAK_BONUS_FROM", () => {
    expect(scoreForTally(tally({ bestStreakInSession: STREAK_BONUS_FROM + 1 }))).toBe(STREAK_BONUS_STEP * 2);
  });

  it("agrees with scoreForSession for the same counters, across combinations", () => {
    const combos: (Partial<LocalSession> & Partial<SessionTally>)[] = [
      { correctCount: 0, wrongCount: 0, passedCount: 0, bestStreakInSession: 0 },
      { correctCount: 5, wrongCount: 2, passedCount: 3, bestStreakInSession: 1 },
      { correctCount: 4, wrongCount: 0, passedCount: 0, bestStreakInSession: STREAK_BONUS_FROM },
      { correctCount: 10, wrongCount: 4, passedCount: 1, bestStreakInSession: STREAK_BONUS_FROM + 3 },
      { correctCount: 0, wrongCount: 7, passedCount: 0, bestStreakInSession: 2 },
    ];

    for (const counters of combos) {
      const s = session(counters);
      const t = tally(counters);
      expect(scoreForSession(s)).toBe(scoreForTally(t));
    }
  });
});

describe("accuracyOf", () => {
  it("is zero when nothing was answered", () => {
    expect(accuracyOf(0, 0)).toBe(0);
  });

  it("is 1 when everything was correct", () => {
    expect(accuracyOf(5, 0)).toBe(1);
  });

  it("excludes passes: only correct and wrong feed the ratio", () => {
    expect(accuracyOf(3, 1)).toBe(3 / 4);
  });
});

describe("startOfDay", () => {
  it("zeroes the local time components", () => {
    const at = new Date(2026, 7, 25, 14, 30, 15, 500).getTime();
    const expected = new Date(2026, 7, 25, 0, 0, 0, 0).getTime();
    expect(startOfDay(at)).toBe(expected);
  });
});

describe("dailyStats", () => {
  it("returns EMPTY_DAILY when there are no sessions", () => {
    expect(dailyStats([], Date.now())).toEqual({
      score: 0,
      cardsStudied: 0,
      correct: 0,
      wrong: 0,
      passed: 0,
      accuracy: 0,
      bestStreak: 0,
      sessionCount: 0,
      studyMillis: 0,
    });
  });

  it("excludes open sessions", () => {
    const now = new Date(2026, 7, 25, 12, 0, 0).getTime();
    const sessions = [session({ endedAt: null, correctCount: 5 })];
    expect(dailyStats(sessions, now).sessionCount).toBe(0);
  });

  it("excludes sessions that ended before local midnight", () => {
    const midnight = new Date(2026, 7, 25, 0, 0, 0, 0).getTime();
    const now = midnight + 60 * 60 * 1000;
    const sessions = [session({ startedAt: midnight - 2000, endedAt: midnight - 1 })];
    expect(dailyStats(sessions, now).sessionCount).toBe(0);
  });

  it("includes a session ending exactly at local midnight", () => {
    const midnight = new Date(2026, 7, 25, 0, 0, 0, 0).getTime();
    const now = midnight + 60 * 60 * 1000;
    const sessions = [session({ startedAt: midnight - 1000, endedAt: midnight })];
    expect(dailyStats(sessions, now).sessionCount).toBe(1);
  });

  it("excludes passes from the accuracy denominator", () => {
    const now = new Date(2026, 7, 25, 12, 0, 0).getTime();
    const dayStart = startOfDay(now);
    const sessions = [
      session({ startedAt: dayStart + 1000, endedAt: dayStart + 2000, correctCount: 3, wrongCount: 1, passedCount: 10 }),
    ];
    expect(dailyStats(sessions, now).accuracy).toBe(3 / 4);
  });

  it("sums cardsStudied and score across today's finished sessions", () => {
    const now = new Date(2026, 7, 25, 12, 0, 0).getTime();
    const dayStart = startOfDay(now);
    const sessions = [
      session({
        id: "s1",
        startedAt: dayStart + 1000,
        endedAt: dayStart + 2000,
        correctCount: 2,
        wrongCount: 1,
        passedCount: 1,
      }),
      session({
        id: "s2",
        startedAt: dayStart + 3000,
        endedAt: dayStart + 4000,
        correctCount: 1,
        wrongCount: 0,
        passedCount: 0,
      }),
    ];
    const stats = dailyStats(sessions, now);
    expect(stats.sessionCount).toBe(2);
    expect(stats.cardsStudied).toBe(5);
    expect(stats.score).toBe(scoreForSession(sessions[0]) + scoreForSession(sessions[1]));
  });

  it("clamps studyMillis contribution to MAX_SESSION_MILLIS", () => {
    const now = new Date(2026, 7, 25, 12, 0, 0).getTime();
    const dayStart = startOfDay(now);
    const sessions = [
      session({ startedAt: dayStart, endedAt: dayStart + MAX_SESSION_MILLIS * 3 }),
    ];
    expect(dailyStats(sessions, now).studyMillis).toBe(MAX_SESSION_MILLIS);
  });

  it("reports the max bestStreak across today's sessions", () => {
    const now = new Date(2026, 7, 25, 12, 0, 0).getTime();
    const dayStart = startOfDay(now);
    const sessions = [
      session({ id: "s1", startedAt: dayStart, endedAt: dayStart + 1000, bestStreakInSession: 4 }),
      session({ id: "s2", startedAt: dayStart, endedAt: dayStart + 1000, bestStreakInSession: 9 }),
    ];
    expect(dailyStats(sessions, now).bestStreak).toBe(9);
  });
});

describe("studyStreakDays", () => {
  const dayMillis = 24 * 60 * 60 * 1000;

  it("is zero when neither today nor yesterday has a finished session", () => {
    const now = new Date(2026, 7, 25, 12, 0, 0).getTime();
    expect(studyStreakDays([], now)).toBe(0);
  });

  it("counts today when today has a finished session, walking backwards", () => {
    const now = new Date(2026, 7, 25, 12, 0, 0).getTime();
    const today = startOfDay(now);
    const sessions = [
      session({ id: "s0", startedAt: today, endedAt: today + 1000 }),
      session({ id: "s1", startedAt: today - dayMillis, endedAt: today - dayMillis + 1000 }),
      session({ id: "s2", startedAt: today - 2 * dayMillis, endedAt: today - 2 * dayMillis + 1000 }),
    ];
    expect(studyStreakDays(sessions, now)).toBe(3);
  });

  it("starts from yesterday when today is still empty", () => {
    const now = new Date(2026, 7, 25, 8, 0, 0).getTime();
    const today = startOfDay(now);
    const sessions = [
      session({ id: "s1", startedAt: today - dayMillis, endedAt: today - dayMillis + 1000 }),
      session({ id: "s2", startedAt: today - 2 * dayMillis, endedAt: today - 2 * dayMillis + 1000 }),
    ];
    expect(studyStreakDays(sessions, now)).toBe(2);
  });

  it("stops at the first gap day", () => {
    const now = new Date(2026, 7, 25, 12, 0, 0).getTime();
    const today = startOfDay(now);
    const sessions = [
      session({ id: "s0", startedAt: today, endedAt: today + 1000 }),
      // Gap: nothing on today - 1 day.
      session({ id: "s2", startedAt: today - 2 * dayMillis, endedAt: today - 2 * dayMillis + 1000 }),
    ];
    expect(studyStreakDays(sessions, now)).toBe(1);
  });

  it("ignores open sessions when deciding whether a day counts", () => {
    const now = new Date(2026, 7, 25, 12, 0, 0).getTime();
    const today = startOfDay(now);
    const sessions = [session({ startedAt: today, endedAt: null })];
    expect(studyStreakDays(sessions, now)).toBe(0);
  });

  // Walking backwards by calendar date rather than by a fixed number of
  // millis is what makes these two hold: a month boundary and a leap day are
  // the cheapest observable proxies for the DST case the day-key approach
  // actually exists to survive, which cannot be exercised without pinning
  // the suite to a particular timezone.
  it("walks across a month boundary", () => {
    const now = new Date(2026, 2, 2, 9, 0, 0).getTime();
    const sessions = [
      session({ endedAt: new Date(2026, 2, 2, 9, 0, 0).getTime() }),
      session({ endedAt: new Date(2026, 2, 1, 21, 0, 0).getTime() }),
      session({ endedAt: new Date(2026, 1, 28, 7, 0, 0).getTime() }),
    ];
    expect(studyStreakDays(sessions, now)).toBe(3);
  });

  it("walks across a leap day", () => {
    const now = new Date(2028, 2, 1, 12, 0, 0).getTime();
    const sessions = [
      session({ endedAt: new Date(2028, 2, 1, 12, 0, 0).getTime() }),
      session({ endedAt: new Date(2028, 1, 29, 12, 0, 0).getTime() }),
      session({ endedAt: new Date(2028, 1, 28, 12, 0, 0).getTime() }),
    ];
    expect(studyStreakDays(sessions, now)).toBe(3);
  });
});

describe("formatDuration", () => {
  it("formats under an hour in minutes", () => {
    expect(formatDuration(7 * 60 * 1000)).toBe("7MIN");
  });

  it("floors partial minutes", () => {
    expect(formatDuration(7.9 * 60 * 1000)).toBe("7MIN");
  });

  it("formats an hour or more as hours and minutes", () => {
    expect(formatDuration(72 * 60 * 1000)).toBe("1H 12M");
  });

  it("formats exactly one hour", () => {
    expect(formatDuration(60 * 60 * 1000)).toBe("1H 0M");
  });

  it("falls back to 0MIN for negative or non-finite input", () => {
    expect(formatDuration(-1)).toBe("0MIN");
    expect(formatDuration(Number.NaN)).toBe("0MIN");
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe("0MIN");
  });
});

describe("estimateRecapMinutes", () => {
  it("is zero for zero or fewer cards", () => {
    expect(estimateRecapMinutes(0)).toBe(0);
    expect(estimateRecapMinutes(-5)).toBe(0);
  });

  it("rounds up to at least one minute for a single card", () => {
    expect(estimateRecapMinutes(1)).toBe(1);
  });

  it("estimates 20 cards at 15 seconds each", () => {
    expect(estimateRecapMinutes(20)).toBe(5);
  });
});
