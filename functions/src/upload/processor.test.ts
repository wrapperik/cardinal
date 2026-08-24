import { beforeEach, describe, expect, it, vi } from "vitest";

const firebaseLog = vi.hoisted(() => ({
  error: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("firebase-functions", () => ({ logger: firebaseLog }));

import * as processor from "./processor";

type RequestGeminiCompletion = (input: {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  maxOutputTokens: number;
  fetchImpl: typeof fetch;
  deadlineMs?: number;
}) => Promise<string>;

const requestGeminiCompletion = (processor as {
  requestGeminiCompletion?: RequestGeminiCompletion;
}).requestGeminiCompletion;

describe("requestGeminiCompletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not write provider response bodies to logs", async () => {
    expect(typeof requestGeminiCompletion).toBe("function");
    const sensitiveBody = "rejected prompt contains private study material";
    const fetchImpl = vi.fn(async () => new Response(sensitiveBody, { status: 400 })) as unknown as typeof fetch;

    await expect(
      requestGeminiCompletion!({
        apiKey: "server-key",
        model: "gemini-3.5-flash",
        system: "rules",
        user: "study material",
        maxOutputTokens: 4_000,
        fetchImpl,
        deadlineMs: Date.now() + 5_000,
      }),
    ).rejects.toThrow("THE FILE COULDN'T BE PROCESSED BY THE EXTRACTION SERVICE");

    expect(firebaseLog.error).toHaveBeenCalledWith(
      "Gemini rejected the extraction request",
      expect.objectContaining({ status: 400, model: "gemini-3.5-flash", attempts: 1 }),
    );
    expect(JSON.stringify(firebaseLog.error.mock.calls)).not.toContain(sensitiveBody);
  });

  it("stops retrying when Gemini's delay would outlive the job deadline", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn(async () =>
        new Response("quota exceeded", {
          status: 429,
          headers: { "retry-after": "60" },
        })) as unknown as typeof fetch;
      let outcome = "pending";

      void requestGeminiCompletion!({
        apiKey: "server-key",
        model: "gemini-3.5-flash",
        system: "rules",
        user: "study material",
        maxOutputTokens: 4_000,
        fetchImpl,
        deadlineMs: Date.now() + 500,
      }).then(
        () => { outcome = "resolved"; },
        (error: unknown) => { outcome = error instanceof Error ? error.message : "unknown error"; },
      );

      await vi.advanceTimersByTimeAsync(1_000);

      expect(outcome).toBe("THE EXTRACTION SERVICE IS BUSY — TRY AGAIN SOON");
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the timeout active while consuming Gemini's response body", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => ({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: () => new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("body aborted")));
        }),
      }) as Response) as unknown as typeof fetch;
      let outcome = "pending";

      void requestGeminiCompletion!({
        apiKey: "server-key",
        model: "gemini-3.5-flash",
        system: "rules",
        user: "study material",
        maxOutputTokens: 4_000,
        fetchImpl,
        deadlineMs: Date.now() + 500,
      }).then(
        () => { outcome = "resolved"; },
        (error: unknown) => { outcome = error instanceof Error ? error.message : "unknown error"; },
      );

      await vi.advanceTimersByTimeAsync(1_000);

      expect(outcome).toBe("THE EXTRACTION SERVICE IS BUSY — TRY AGAIN SOON");
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("processUploadJob deadline", () => {
  it("does not begin Firestore persistence after extraction exhausts the job budget", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-24T20:00:00Z"));
    try {
      const createCourse = vi.fn(async () => undefined);
      const setDeck = vi.fn(async () => undefined);
      const updateUpload = vi.fn(async () => undefined);
      const courseCollection = {
        get: vi.fn(async () => ({ docs: [] })),
        doc: vi.fn(() => ({
          create: createCourse,
          get: vi.fn(async () => ({ get: vi.fn(() => undefined) })),
        })),
      };
      const deckDocument = {
        set: setDeck,
        collection: vi.fn(() => ({ doc: vi.fn(() => ({})) })),
      };
      const db = {
        collection: vi.fn((name: string) => {
          if (name === "users") {
            return { doc: vi.fn(() => ({ collection: vi.fn(() => courseCollection) })) };
          }
          if (name === "decks") return { doc: vi.fn(() => deckDocument) };
          throw new Error(`Unexpected collection: ${name}`);
        }),
        batch: vi.fn(() => ({ set: vi.fn(), commit: vi.fn(async () => undefined) })),
      };
      const bucket = {
        file: vi.fn(() => ({
          download: vi.fn(async () => [Buffer.from("Water freezes at zero degrees Celsius.")]),
        })),
      };
      const modelPayload = JSON.stringify({
        cards: [{
          gameType: "trueFalseDuel",
          difficulty: 1,
          topic: "WATER",
          payload: { statement: "Water freezes at zero degrees Celsius.", isTrue: true },
        }],
        suggestedCourse: "Physics",
        confidence: 0.9,
      });
      const fetchImpl = vi.fn(async () => {
        vi.setSystemTime(Date.now() + 600_000);
        return new Response(JSON.stringify({
          candidates: [{ content: { parts: [{ text: modelPayload }] } }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }) as unknown as typeof fetch;

      await expect(
        processor.processUploadJob(
          { update: updateUpload } as never,
          {
            uploadId: "upload-1",
            ownerId: "owner-1",
            fileName: "short.txt",
            fileType: "text",
            storagePath: "uploads/owner-1/upload-1",
            template: "auto",
            cardTarget: 1,
          },
          {
            db: db as never,
            bucket: bucket as never,
            apiKey: "server-key",
            model: "gemini-3.5-flash",
            fetchImpl,
          },
        ),
      ).rejects.toThrow("THE EXTRACTION SERVICE IS BUSY — TRY AGAIN SOON");

      expect(createCourse).not.toHaveBeenCalled();
      expect(setDeck).not.toHaveBeenCalled();
      expect(updateUpload).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
