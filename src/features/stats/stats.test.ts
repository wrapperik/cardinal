import { describe, expect, it, vi } from "vitest";

import { EMPTY_STATS, statsFromFirestore } from "./stats";

vi.mock("firebase/auth", () => ({ onAuthStateChanged: vi.fn(() => vi.fn()) }));
vi.mock("firebase/firestore", () => ({ doc: vi.fn(), onSnapshot: vi.fn(() => vi.fn()) }));
vi.mock("@/lib/firebase", () => ({ auth: {}, db: {} }));

describe("statsFromFirestore", () => {
  it("maps the read-only summary and converts its timestamp to millis", () => {
    expect(
      statsFromFirestore({
        totalCardsStudied: 12,
        totalSessions: 3,
        totalCorrect: 9,
        totalWrong: 3,
        overallAccuracy: 0.75,
        cardsDueToday: 2,
        updatedAt: { toMillis: () => 1_000 },
      }),
    ).toEqual({
      totalCardsStudied: 12,
      totalSessions: 3,
      totalCorrect: 9,
      totalWrong: 3,
      overallAccuracy: 0.75,
      cardsDueToday: 2,
      updatedAt: 1_000,
    });
  });

  it("rejects an incomplete derived document instead of showing misleading totals", () => {
    expect(statsFromFirestore({ totalCardsStudied: 12 })).toBeNull();
    expect(EMPTY_STATS.totalCardsStudied).toBe(0);
  });
});
