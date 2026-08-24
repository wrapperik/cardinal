import { describe, expect, it } from "vitest";

import * as helpers from "./helpers";

import {
  buildUploadCardPayload,
  buildUploadDeckPayload,
  mergeExtractedCards,
  normaliseFileType,
  splitSourceText,
} from "./helpers";

type GeminiHelpers = {
  DEFAULT_GEMINI_MODEL?: string;
  buildGeminiRequest?: (input: {
    apiKey: string;
    model: string;
    system: string;
    user: string;
    maxOutputTokens: number;
  }) => { url: string; init: RequestInit };
  extractGeminiCompletion?: (value: unknown) => string;
  mapGeminiHttpError?: (status: number) => string;
};

const gemini = helpers as GeminiHelpers;

describe("Gemini request contract", () => {
  it("builds an authenticated structured-output request for the free-tier model", () => {
    expect(typeof gemini.buildGeminiRequest).toBe("function");

    const request = gemini.buildGeminiRequest!({
      apiKey: "server-key",
      model: gemini.DEFAULT_GEMINI_MODEL!,
      system: "system rules",
      user: "source text",
      maxOutputTokens: 9_000,
    });
    const body = JSON.parse(request.init.body as string);

    expect(request.url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent",
    );
    expect(request.init).toMatchObject({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": "server-key",
      },
    });
    expect(body).toMatchObject({
      systemInstruction: { parts: [{ text: "system rules" }] },
      contents: [{ role: "user", parts: [{ text: "source text" }] }],
      generationConfig: {
        maxOutputTokens: 9_000,
        thinkingConfig: { thinkingLevel: "MINIMAL" },
        responseFormat: {
          text: {
            mimeType: "APPLICATION_JSON",
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["cards", "suggestedCourse", "confidence"],
            },
          },
        },
      },
    });
  });

  it("extracts and joins Gemini text parts", () => {
    expect(typeof gemini.extractGeminiCompletion).toBe("function");
    expect(
      gemini.extractGeminiCompletion!({
        candidates: [{ content: { parts: [{ text: '{"cards":' }, { text: "[]}" }] } }],
      }),
    ).toBe('{"cards":[]}');
  });

  it("rejects a response without usable candidate text", () => {
    expect(typeof gemini.extractGeminiCompletion).toBe("function");
    expect(() =>
      gemini.extractGeminiCompletion!({
        candidates: [{ finishReason: "SAFETY", content: { parts: [] } }],
      }),
    ).toThrow("THE EXTRACTION SERVICE RETURNED NO USABLE RESPONSE");
  });

  it("maps provider failures without leaking response bodies", () => {
    expect(typeof gemini.mapGeminiHttpError).toBe("function");
    expect(gemini.mapGeminiHttpError!(400)).toBe(
      "THE FILE COULDN'T BE PROCESSED BY THE EXTRACTION SERVICE",
    );
    expect(gemini.mapGeminiHttpError!(401)).toBe("THE EXTRACTION SERVICE IS NOT CONFIGURED");
    expect(gemini.mapGeminiHttpError!(404)).toBe("THE EXTRACTION MODEL ISN'T AVAILABLE");
    expect(gemini.mapGeminiHttpError!(429)).toBe("THE EXTRACTION SERVICE IS BUSY — TRY AGAIN SOON");
    expect(gemini.mapGeminiHttpError!(503)).toBe(
      "THE EXTRACTION SERVICE IS TEMPORARILY UNAVAILABLE",
    );
  });

  it("constrains fixed-size card payloads before they reach the parser", () => {
    expect(typeof gemini.buildGeminiRequest).toBe("function");
    const request = gemini.buildGeminiRequest!({
      apiKey: "server-key",
      model: "gemini-3.5-flash",
      system: "rules",
      user: "material",
      maxOutputTokens: 4_000,
    });
    const body = JSON.parse(request.init.body as string);
    const cardSchemas = body.generationConfig.responseFormat.text.schema.properties.cards.items.anyOf;

    expect(cardSchemas[0].properties.payload.properties.choices).toMatchObject({
      minItems: 3,
      maxItems: 3,
    });
    expect(cardSchemas[2].properties.payload.properties.orderedItems).toMatchObject({
      minItems: 4,
      maxItems: 4,
    });
    expect(cardSchemas[3].properties.payload.properties.pairs).toMatchObject({
      minItems: 3,
      maxItems: 3,
    });
  });
});

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

describe("splitSourceText", () => {
  it("keeps a document that already fits as a single chunk", () => {
    expect(splitSourceText("short material", 100, 4)).toEqual(["short material"]);
  });

  it("breaks on a paragraph boundary rather than mid-sentence", () => {
    const text = `${"a".repeat(60)}\n\n${"b".repeat(60)}`;
    expect(splitSourceText(text, 80, 4)).toEqual(["a".repeat(60), "b".repeat(60)]);
  });

  it("still advances when the text has no boundary to break on", () => {
    const chunks = splitSourceText("x".repeat(250), 100, 4);

    expect(chunks).toHaveLength(3);
    expect(chunks.join("")).toHaveLength(250);
  });

  it("stops at the chunk ceiling instead of splitting forever", () => {
    expect(splitSourceText("y".repeat(10_000), 100, 4)).toHaveLength(4);
  });

  it("treats blank source as nothing to extract", () => {
    expect(splitSourceText("   \n  ", 100, 4)).toEqual([]);
  });
});

describe("mergeExtractedCards", () => {
  const quiz = (question: string) => ({
    gameType: "compassQuiz" as const,
    difficulty: 1,
    payload: { question, choices: ["A", "B", "C"], correctIndex: 0 as const },
  });

  it("interleaves chunks so a trim keeps the whole document represented", () => {
    const merged = mergeExtractedCards(
      [[quiz("A1"), quiz("A2")], [quiz("B1"), quiz("B2")]],
      3,
    );

    expect(merged.map((card) => card.payload.question)).toEqual(["A1", "B1", "A2"]);
  });

  it("drops the same fact recovered from two overlapping chunks", () => {
    const merged = mergeExtractedCards([[quiz("SAME")], [quiz("same")]], 10);

    expect(merged).toHaveLength(1);
  });

  it("returns everything when the pile is under the target", () => {
    expect(mergeExtractedCards([[quiz("A")], [quiz("B")]], 10)).toHaveLength(2);
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
