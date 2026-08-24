import { describe, expect, it } from "vitest";

import { reconcile } from "@/lib/sync/merge";
import type { MetaMap } from "@/lib/sync/types";

import * as sessionRules from "./session-rules";
import {
  emptyTally,
  isSession,
  recordAnswer,
  sanitiseSessions,
  summariseSessions,
  type LocalSession,
  type SessionTally,
} from "./session-rules";

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

describe("emptyTally", () => {
  it("zeroes every counter and starts with no game types played", () => {
    expect(emptyTally()).toEqual({
      correctCount: 0,
      wrongCount: 0,
      passedCount: 0,
      bestStreakInSession: 0,
      currentStreak: 0,
      gameTypesPlayed: [],
    });
  });
});

describe("recordAnswer", () => {
  it("does not mutate the tally passed in", () => {
    const tally = emptyTally();
    const frozen: SessionTally = { ...tally, gameTypesPlayed: [...tally.gameTypesPlayed] };
    recordAnswer(tally, "correct", "compassQuiz");
    expect(tally).toEqual(frozen);
  });

  it("raises the streak on consecutive correct answers", () => {
    let tally = emptyTally();
    tally = recordAnswer(tally, "correct", "compassQuiz");
    tally = recordAnswer(tally, "correct", "compassQuiz");
    tally = recordAnswer(tally, "correct", "compassQuiz");
    expect(tally.currentStreak).toBe(3);
    expect(tally.bestStreakInSession).toBe(3);
    expect(tally.correctCount).toBe(3);
  });

  it("retains bestStreakInSession after the streak breaks", () => {
    let tally = emptyTally();
    tally = recordAnswer(tally, "correct", "compassQuiz");
    tally = recordAnswer(tally, "correct", "compassQuiz");
    tally = recordAnswer(tally, "incorrect", "compassQuiz");
    tally = recordAnswer(tally, "correct", "compassQuiz");
    expect(tally.currentStreak).toBe(1);
    expect(tally.bestStreakInSession).toBe(2);
  });

  it("resets the streak on an incorrect answer", () => {
    let tally = emptyTally();
    tally = recordAnswer(tally, "correct", "compassQuiz");
    tally = recordAnswer(tally, "incorrect", "compassQuiz");
    expect(tally.currentStreak).toBe(0);
    expect(tally.wrongCount).toBe(1);
  });

  it("resets the streak on a passed answer, same as an incorrect one", () => {
    let tally = emptyTally();
    tally = recordAnswer(tally, "correct", "compassQuiz");
    tally = recordAnswer(tally, "correct", "compassQuiz");
    tally = recordAnswer(tally, "passed", "compassQuiz");
    expect(tally.currentStreak).toBe(0);
    expect(tally.bestStreakInSession).toBe(2);
    expect(tally.passedCount).toBe(1);
  });

  it("accumulates gameTypesPlayed distinct and in canonical order regardless of play order", () => {
    let tally = emptyTally();
    tally = recordAnswer(tally, "correct", "matchRelease");
    tally = recordAnswer(tally, "correct", "compassQuiz");
    tally = recordAnswer(tally, "incorrect", "matchRelease");
    tally = recordAnswer(tally, "passed", "trueFalseDuel");
    expect(tally.gameTypesPlayed).toEqual(["compassQuiz", "trueFalseDuel", "matchRelease"]);
  });
});

describe("summariseSessions", () => {
  it("ignores unfinished sessions", () => {
    const sessions = [session({ endedAt: null, correctCount: 5 })];
    expect(summariseSessions(sessions, "geography").sessionCount).toBe(0);
  });

  it("ignores sessions belonging to other courses", () => {
    const sessions = [session({ courseId: "history", correctCount: 5 })];
    expect(summariseSessions(sessions, "geography").sessionCount).toBe(0);
  });

  it("returns accuracy 0, not NaN, when nothing has been answered", () => {
    const sessions = [session({ correctCount: 0, wrongCount: 0, passedCount: 0 })];
    const summary = summariseSessions(sessions, "geography");
    expect(summary.accuracy).toBe(0);
    expect(Number.isNaN(summary.accuracy)).toBe(false);
  });

  it("excludes passes from the accuracy denominator", () => {
    const sessions = [session({ correctCount: 3, wrongCount: 1, passedCount: 10 })];
    const summary = summariseSessions(sessions, "geography");
    expect(summary.accuracy).toBe(3 / 4);
  });

  it("reports lastStudiedAt as the most recent finished session", () => {
    const sessions = [
      session({ id: "s1", endedAt: 100 }),
      session({ id: "s2", endedAt: 500 }),
      session({ id: "s3", endedAt: 300 }),
    ];
    expect(summariseSessions(sessions, "geography").lastStudiedAt).toBe(500);
  });

  it("reports the max bestStreak across sessions", () => {
    const sessions = [
      session({ id: "s1", bestStreakInSession: 4 }),
      session({ id: "s2", bestStreakInSession: 9 }),
      session({ id: "s3", bestStreakInSession: 2 }),
    ];
    expect(summariseSessions(sessions, "geography").bestStreak).toBe(9);
  });

  it("sums counters across every finished session for the course", () => {
    const sessions = [
      session({ id: "s1", correctCount: 3, wrongCount: 1, passedCount: 2 }),
      session({ id: "s2", correctCount: 2, wrongCount: 0, passedCount: 1 }),
      session({ id: "s3", courseId: "history", correctCount: 100 }),
      session({ id: "s4", endedAt: null, correctCount: 100 }),
    ];
    const summary = summariseSessions(sessions, "geography");
    expect(summary.sessionCount).toBe(2);
    expect(summary.totalCorrect).toBe(5);
    expect(summary.totalWrong).toBe(1);
    expect(summary.totalPassed).toBe(3);
  });
});

describe("sanitiseSessions", () => {
  it("adopts a remotely finished session when its completion revision is newer", () => {
    const open = session({ startedAt: 100, endedAt: null });
    const finished = session({ startedAt: 100, endedAt: 200, correctCount: 1 });
    // Until the selector exists, this reproduces store.ts's old startedAt
    // fallback; that ties the open local record and leaves it stale.
    const remoteRevision =
      typeof sessionRules.sessionRemoteRevision === "function"
        ? sessionRules.sessionRemoteRevision(finished)
        : finished.startedAt;
    const localMeta: MetaMap = {
      [open.id]: { updatedAt: 100, dirty: false, remoteConfirmed: true },
    };

    const result = reconcile([open], localMeta, [{ record: finished, updatedAt: remoteRevision }]);

    expect(result.records).toEqual([finished]);
    expect(result.meta[open.id]).toEqual({ updatedAt: 200, dirty: false, remoteConfirmed: true });
  });

  it("requires deckId to be null or a string", () => {
    const complete = session();
    const { deckId: _deckId, ...legacy } = complete;

    expect(isSession(complete)).toBe(true);
    expect(isSession({ ...legacy, deckId: "deck-1" })).toBe(true);
    expect(isSession({ ...legacy, deckId: 1 })).toBe(false);
    expect(isSession(legacy)).toBe(false);
  });

  it("backfills a legacy session without deckId instead of dropping it", () => {
    const { deckId: _deckId, ...legacy } = session();

    expect(sanitiseSessions([legacy])).toEqual([{ ...legacy, deckId: null }]);
  });

  it("drops sessions whose counters are not integers, so accuracy can never go NaN", () => {
    const raw = [
      session({ id: "ok" }),
      { ...session({ id: "nan" }), correctCount: Number.NaN },
      { ...session({ id: "float" }), wrongCount: 1.5 },
      { ...session({ id: "started" }), startedAt: Number.NaN },
    ];
    expect(sanitiseSessions(raw).map((s) => s.id)).toEqual(["ok"]);
  });

  it("returns an empty list for non-array input", () => {
    expect(sanitiseSessions(null)).toEqual([]);
    expect(sanitiseSessions({ nope: true })).toEqual([]);
  });
});
