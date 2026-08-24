import { describe, expect, it } from "vitest";

import {
  buildUploadCardPayload,
  buildUploadDeckPayload,
  extractGroqCompletion,
  mapGroqHttpError,
  normaliseFileType,
} from "./helpers";

describe("normaliseFileType", () => {
  it("normalises accepted PDF and text labels", () => {
    expect(normaliseFileType("application/pdf")).toBe("pdf");
    expect(normaliseFileType("PDF")).toBe("pdf");
    expect(normaliseFileType("text/markdown")).toBe("text");
    expect(normaliseFileType("md")).toBe("text");
  });

  it("rejects unsupported file labels", () => {
    expect(normaliseFileType("image/png")).toBeNull();
    expect(normaliseFileType(undefined)).toBeNull();
  });
});

describe("extractGroqCompletion", () => {
  it("returns the first chat completion content", () => {
    expect(
      extractGroqCompletion({
        choices: [{ message: { content: '{"cards":[]}' } }],
      }),
    ).toBe('{"cards":[]}');
  });

  it("rejects a response without usable message content", () => {
    expect(() => extractGroqCompletion({ choices: [{ message: { content: null } }] })).toThrow(
      "THE EXTRACTION SERVICE RETURNED NO USABLE RESPONSE",
    );
  });
});

describe("mapGroqHttpError", () => {
  it("does not expose Groq error bodies to the upload job", () => {
    expect(mapGroqHttpError(401)).toBe("THE EXTRACTION SERVICE IS NOT CONFIGURED");
    expect(mapGroqHttpError(429)).toBe("THE EXTRACTION SERVICE IS BUSY — TRY AGAIN SOON");
    expect(mapGroqHttpError(503)).toBe("THE EXTRACTION SERVICE IS TEMPORARILY UNAVAILABLE");
  });
});

describe("upload payload builders", () => {
  const cards = [
    {
      gameType: "compassQuiz" as const,
      difficulty: 2,
      topic: "CAPITALS",
      payload: { question: "CAPITAL OF FRANCE?", choices: ["PARIS", "ROME", "MADRID"], correctIndex: 0 },
    },
  ];

  it("builds a canonical upload deck with server-owned provenance", () => {
    expect(
      buildUploadDeckPayload({
        deckId: "upload-abc",
        ownerId: "user-1",
        courseId: "geography",
        title: " geography ",
        uploadId: "abc",
        cards,
        timestamp: "SERVER_TIME",
      }),
    ).toEqual({
      deckId: "upload-abc",
      ownerId: "user-1",
      courseId: "geography",
      title: "GEOGRAPHY",
      sourceType: "upload",
      uploadId: "abc",
      cardCount: 1,
      createdAt: "SERVER_TIME",
      updatedAt: "SERVER_TIME",
    });
  });

  it("writes cards without local-only fields and with stable ids", () => {
    expect(
      buildUploadCardPayload({
        deckId: "upload-abc",
        uploadId: "abc",
        index: 0,
        card: cards[0],
        timestamp: "SERVER_TIME",
      }),
    ).toEqual({
      cardId: "upload-abc-card-1",
      deckId: "upload-abc",
      gameType: "compassQuiz",
      difficulty: 2,
      topic: "CAPITALS",
      payload: { question: "CAPITAL OF FRANCE?", choices: ["PARIS", "ROME", "MADRID"], correctIndex: 0 },
      createdAt: "SERVER_TIME",
    });
  });
});
