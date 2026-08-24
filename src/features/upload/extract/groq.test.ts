import { describe, expect, it, vi } from "vitest";
import { canonicalResultFromDocuments, mapFirebaseFailure } from "./groq";

vi.mock("@/lib/firebase", () => ({ auth: { currentUser: null }, db: {}, storage: {} }));

const timestamp = (millis: number) => ({ toMillis: () => millis });

describe("canonicalResultFromDocuments", () => {
  it("keeps server deck and card identities with upload provenance", () => {
    const outcome = canonicalResultFromDocuments({
      uid: "owner-1",
      uploadId: "upload-1",
      fileName: "cells.pdf",
      job: { cardsGenerated: 1 },
      deckId: "deck-server",
      deck: {
        ownerId: "owner-1",
        courseId: "biology",
        title: "CELL DIVISION",
        sourceType: "upload",
        uploadId: "upload-1",
        cardCount: 1,
        createdAt: timestamp(10),
        updatedAt: timestamp(20),
      },
      cards: [
        {
          id: "card-server",
          data: {
            deckId: "deck-server",
            gameType: "compassQuiz",
            difficulty: 2,
            topic: "mitosis",
            payload: {
              question: "Which phase separates chromatids?",
              choices: ["Anaphase", "Prophase", "Telophase"],
              correctIndex: 0,
            },
          },
        },
      ],
      course: {
        title: "BIOLOGY",
        gameType: "compassQuiz",
        seeded: false,
        createdAt: timestamp(5),
      },
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.canonicalDeck).toMatchObject({
      id: "deck-server",
      courseId: "biology",
      sourceName: "cells.pdf",
      sourceType: "upload",
      uploadId: "upload-1",
    });
    expect(outcome.result.canonicalDeck?.cards[0]).toMatchObject({
      cardId: "card-server",
      topic: "mitosis",
    });
    expect(outcome.result.canonicalCourse).toEqual({
      id: "biology",
      title: "BIOLOGY",
      gameType: "compassQuiz",
      seeded: false,
      createdAt: 5,
    });
  });

  it("rejects a deck whose upload provenance does not match the job", () => {
    const outcome = canonicalResultFromDocuments({
      uid: "owner-1",
      uploadId: "upload-1",
      fileName: "cells.pdf",
      job: { cardsGenerated: 0 },
      deckId: "deck-server",
      deck: {
        ownerId: "owner-1",
        courseId: "biology",
        title: "CELL DIVISION",
        sourceType: "manual",
        uploadId: null,
        cardCount: 0,
        createdAt: timestamp(10),
        updatedAt: timestamp(20),
      },
      cards: [],
      course: {
        title: "BIOLOGY",
        gameType: "compassQuiz",
        seeded: false,
        createdAt: timestamp(5),
      },
    });

    expect(outcome).toMatchObject({ ok: false, reason: "badResponse" });
  });

  it("rejects malformed server cards instead of adopting an unplayable deck", () => {
    const outcome = canonicalResultFromDocuments({
      uid: "owner-1",
      uploadId: "upload-1",
      fileName: "cells.pdf",
      job: { cardsGenerated: 1 },
      deckId: "deck-server",
      deck: {
        ownerId: "owner-1",
        courseId: "biology",
        title: "CELL DIVISION",
        sourceType: "upload",
        uploadId: "upload-1",
        cardCount: 1,
        createdAt: timestamp(10),
        updatedAt: timestamp(20),
      },
      cards: [
        {
          id: "card-server",
          data: {
            deckId: "deck-server",
            gameType: "compassQuiz",
            difficulty: 2,
            payload: { question: "Which phase?", choices: ["Anaphase"], correctIndex: 0 },
          },
        },
      ],
      course: {
        title: "BIOLOGY",
        gameType: "compassQuiz",
        seeded: false,
        createdAt: timestamp(5),
      },
    });

    expect(outcome).toMatchObject({ ok: false, reason: "empty" });
  });
});

describe("mapFirebaseFailure", () => {
  it("maps transient Firebase failures to the existing network outcome", () => {
    expect(mapFirebaseFailure({ code: "storage/retry-limit-exceeded" })).toEqual({
      reason: "network",
      message: expect.any(String),
    });
  });

  it("maps invalid upload data to unsupportedFile", () => {
    expect(mapFirebaseFailure({ code: "storage/invalid-format" })).toEqual({
      reason: "unsupportedFile",
      message: expect.any(String),
    });
  });
});
