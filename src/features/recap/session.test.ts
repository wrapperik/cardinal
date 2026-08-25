import { afterEach, describe, expect, it, vi } from "vitest";

import type { LocalDeck } from "@/features/upload/types";

import { TUTORIAL_COURSE_ID } from "@/features/tutorial/tutorial";

import { beginRecap, endRecap, getActiveRecap, reportRecapAnswer } from "./session";

const progress = vi.hoisted(() => ({
  getProgress: vi.fn(() => []),
  recordProgress: vi.fn(),
}));
const checkpoints = vi.hoisted(() => ({
  clearCheckpoint: vi.fn(),
  getCheckpoint: vi.fn(),
  saveCheckpoint: vi.fn(),
}));
const sessions = vi.hoisted(() => ({
  finishSession: vi.fn(),
  startSession: vi.fn(() => ({ id: "session-1" })),
  getSessions: vi.fn(() => []),
}));
const courses = vi.hoisted(() => ({
  courseById: vi.fn(() => undefined),
}));

vi.mock("@/features/progress/progress", () => progress);
vi.mock("@/features/recap/checkpoints", () => checkpoints);
vi.mock("@/features/sessions/sessions", () => sessions);
vi.mock("@/features/upload/courses", () => courses);

const decks: LocalDeck[] = [
  {
    id: "deck-1",
    courseId: "biology",
    title: "CELLS",
    sourceName: "cells.pdf",
    cards: [
      {
        cardId: "card-1",
        gameType: "compassQuiz",
        difficulty: 2,
        payload: { question: "What is a cell?", choices: ["A", "B", "C"], correctIndex: 0 },
      },
    ],
    createdAt: 0,
    updatedAt: 0,
    provider: "mock",
    sourceType: "manual",
    uploadId: null,
  },
];

afterEach(() => {
  endRecap();
  vi.clearAllMocks();
  progress.getProgress.mockReturnValue([]);
  sessions.startSession.mockReturnValue({ id: "session-1" });
});

describe("reportRecapAnswer", () => {
  it("records the answered card's SM-2 progress before advancing the recap", () => {
    beginRecap(decks, "biology");

    reportRecapAnswer("correct");

    expect(progress.recordProgress).toHaveBeenCalledWith(
      expect.objectContaining({ cardId: "card-1", deckId: "deck-1" }),
      "correct",
    );
    expect(checkpoints.saveCheckpoint).toHaveBeenCalledWith("biology", 1, 1);
  });

  it("starts the fixed tutorial when its seeded course has no stored deck", () => {
    const state = beginRecap([], TUTORIAL_COURSE_ID);

    expect(state?.plan.cards).toHaveLength(15);
    expect(getActiveRecap()?.plan.cards[0]).toMatchObject({ cardId: "tutorial-01", deckId: TUTORIAL_COURSE_ID });
    expect(sessions.startSession).toHaveBeenCalledWith(TUTORIAL_COURSE_ID);
  });
});
