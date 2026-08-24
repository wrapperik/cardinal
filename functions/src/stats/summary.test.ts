import { describe, expect, it } from "vitest";

import { buildStatsPayload, summariseStats } from "./summary";

const NOW = Date.UTC(2026, 7, 24, 12);

describe("summariseStats", () => {
  it("counts completed sessions, reviewed cards, and every card due by today", () => {
    expect(
      summariseStats({
        sessions: [
          { endedAt: NOW - 1, correctCount: 4, wrongCount: 1 },
          { endedAt: null, correctCount: 8, wrongCount: 2 },
        ],
        progress: [
          { dueDate: Date.UTC(2026, 7, 23, 12) },
          { dueDate: Date.UTC(2026, 7, 24, 23, 59, 59) },
          { dueDate: Date.UTC(2026, 7, 25) },
        ],
        now: NOW,
      }),
    ).toEqual({
      totalCardsStudied: 3,
      totalSessions: 1,
      totalCorrect: 4,
      totalWrong: 1,
      overallAccuracy: 0.8,
      cardsDueToday: 2,
    });
  });

  it("returns a zero accuracy instead of dividing an unanswered history", () => {
    expect(
      summariseStats({
        sessions: [{ endedAt: NOW, correctCount: 0, wrongCount: 0 }],
        progress: [],
        now: NOW,
      }).overallAccuracy,
    ).toBe(0);
  });
});

describe("buildStatsPayload", () => {
  it("keeps the summary server-owned and stamps the refresh", () => {
    expect(
      buildStatsPayload(
        "user-1",
        {
          totalCardsStudied: 2,
          totalSessions: 1,
          totalCorrect: 1,
          totalWrong: 1,
          overallAccuracy: 0.5,
          cardsDueToday: 1,
        },
        "SERVER_TIME",
      ),
    ).toEqual({
      userId: "user-1",
      totalCardsStudied: 2,
      totalSessions: 1,
      totalCorrect: 1,
      totalWrong: 1,
      overallAccuracy: 0.5,
      cardsDueToday: 1,
      updatedAt: "SERVER_TIME",
    });
  });
});
