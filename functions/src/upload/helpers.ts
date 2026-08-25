import { normaliseTitle } from "../../../src/features/upload/course-rules";
import type { CardContent, GameType } from "../../../src/types/cardinal";

export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash";

/**
 * Tried in order when the primary model cannot serve the request. Google
 * capacity-throttles an individual model with 503s for minutes at a time while
 * its siblings answer normally, so a second model buys far more than a longer
 * retry ladder against the first one does.
 */
export const FALLBACK_GEMINI_MODELS = ["gemini-3.6-flash", "gemini-3.5-flash-lite"];

function buildGeminiResponseSchema() {
  const card = (
    gameType: GameType,
    payload: Record<string, unknown>,
    payloadRequired: string[],
  ) => ({
    type: "object",
    properties: {
      gameType: { type: "string", enum: [gameType] },
      difficulty: { type: "integer", minimum: 1, maximum: 3 },
      topic: { type: ["string", "null"] },
      payload: {
        type: "object",
        properties: payload,
        required: payloadRequired,
        additionalProperties: false,
      },
    },
    required: ["gameType", "difficulty", "topic", "payload"],
    additionalProperties: false,
  });

  return {
    type: "object",
    properties: {
      cards: {
        type: "array",
        items: {
          anyOf: [
            card(
              "compassQuiz",
              {
                question: { type: "string" },
                choices: {
                  type: "array",
                  items: { type: "string" },
                  minItems: 3,
                  maxItems: 3,
                },
                correctIndex: { type: "integer", enum: [0, 1, 2] },
              },
              ["question", "choices", "correctIndex"],
            ),
            card(
              "trueFalseDuel",
              {
                statement: { type: "string" },
                isTrue: { type: "boolean" },
              },
              ["statement", "isTrue"],
            ),
            card(
              "sequenceSwipe",
              {
                prompt: { type: "string" },
                orderedItems: {
                  type: "array",
                  items: { type: "string" },
                  minItems: 4,
                  maxItems: 4,
                },
              },
              ["prompt", "orderedItems"],
            ),
            card(
              "matchRelease",
              {
                prompt: { type: "string" },
                pairs: {
                  type: "array",
                  minItems: 3,
                  maxItems: 3,
                  items: {
                    type: "object",
                    properties: {
                      term: { type: "string" },
                      definition: { type: "string" },
                    },
                    required: ["term", "definition"],
                    additionalProperties: false,
                  },
                },
              },
              ["prompt", "pairs"],
            ),
          ],
        },
      },
      suggestedCourse: { type: "string" },
      confidence: { type: "number", minimum: 0, maximum: 1 },
    },
    required: ["cards", "suggestedCourse", "confidence"],
    additionalProperties: false,
  };
}

export function buildGeminiRequest(input: {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  maxOutputTokens: number;
}): { url: string; init: RequestInit } {
  return {
    url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.model)}:generateContent`,
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": input.apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: input.system }] },
        contents: [{ role: "user", parts: [{ text: input.user }] }],
        generationConfig: {
          maxOutputTokens: input.maxOutputTokens,
          thinkingConfig: { thinkingLevel: "MINIMAL" },
          responseFormat: {
            text: {
              mimeType: "APPLICATION_JSON",
              schema: buildGeminiResponseSchema(),
            },
          },
        },
      }),
    },
  };
}

export type UploadFileType = "pdf" | "text";
export type TemplateChoice = GameType | "auto";

const GAME_TYPES = new Set<GameType>([
  "compassQuiz",
  "trueFalseDuel",
  "sequenceSwipe",
  "matchRelease",
]);

const FILE_TYPE_ALIASES: Record<string, UploadFileType> = {
  pdf: "pdf",
  "application/pdf": "pdf",
  text: "text",
  txt: "text",
  markdown: "text",
  md: "text",
  "text/plain": "text",
  "text/markdown": "text",
};

export class UploadProcessingError extends Error {
  /** True when a different model is worth trying, rather than this same one again. */
  readonly modelOutage: boolean;

  constructor(message: string, options?: { modelOutage?: boolean }) {
    super(message);
    this.name = "UploadProcessingError";
    this.modelOutage = options?.modelOutage ?? false;
  }
}

/** Converts picker and MIME labels to the two file types persisted on upload jobs. */
export function normaliseFileType(value: unknown): UploadFileType | null {
  if (typeof value !== "string") return null;
  return FILE_TYPE_ALIASES[value.trim().toLowerCase()] ?? null;
}

export function isGameType(value: unknown): value is GameType {
  return typeof value === "string" && GAME_TYPES.has(value as GameType);
}

export function isTemplateChoice(value: unknown): value is TemplateChoice {
  return value === "auto" || isGameType(value);
}

/** Pulls only the model text the extraction parser accepts from a Gemini response. */
export function extractGeminiCompletion(value: unknown): string {
  const response = asRecord(value);
  const firstCandidate = Array.isArray(response?.candidates) ? asRecord(response.candidates[0]) : null;
  const content = asRecord(firstCandidate?.content);
  const parts = Array.isArray(content?.parts) ? content.parts : [];
  const text = parts
    .map(asRecord)
    .filter((part) => part?.thought !== true)
    .map((part) => part?.text)
    .filter((part): part is string => typeof part === "string")
    .join("");

  if (!text.trim()) {
    throw new UploadProcessingError("THE EXTRACTION SERVICE RETURNED NO USABLE RESPONSE");
  }

  return text;
}

/**
 * Whether the status describes the chosen model being unable to serve rather
 * than the request being wrong. A retired model (404), a busy one (408/429)
 * and an overloaded one (5xx) all fail identically on a retry but can succeed
 * immediately on a sibling; a rejected key or file fails the same way anywhere.
 */
export function isModelOutageStatus(status: number): boolean {
  return status === 404 || status === 408 || status === 429 || status >= 500;
}

/** API errors are deliberately mapped to stable user-facing text, never provider response bodies. */
export function mapGeminiHttpError(status: number): string {
  if (status === 401 || status === 403) return "THE EXTRACTION SERVICE IS NOT CONFIGURED";
  if (status === 404) return "THE EXTRACTION MODEL ISN'T AVAILABLE";
  if (status === 408 || status === 429) return "THE EXTRACTION SERVICE IS BUSY — TRY AGAIN SOON";
  if (status === 400 || status === 413 || status === 422) {
    return "THE FILE COULDN'T BE PROCESSED BY THE EXTRACTION SERVICE";
  }
  if (status >= 500) return "THE EXTRACTION SERVICE IS TEMPORARILY UNAVAILABLE";
  return "THE EXTRACTION SERVICE REJECTED THE REQUEST";
}

/**
 * Splits source text into pieces that each fit the per-request token budget.
 * Breaks on the largest natural boundary available inside the window — a
 * paragraph, then a line, then a sentence, then a space — because a card cut
 * from a sentence severed mid-clause is a card the parser throws away. Falls
 * back to a hard cut so a pathological input (no whitespace at all) still
 * makes forward progress rather than looping.
 */
export function splitSourceText(text: string, maxChars: number, maxChunks: number): string[] {
  const trimmed = text.trim();
  if (!trimmed || maxChars <= 0 || maxChunks <= 0) return [];

  const chunks: string[] = [];
  let cursor = 0;

  while (cursor < trimmed.length && chunks.length < maxChunks) {
    const remaining = trimmed.length - cursor;
    if (remaining <= maxChars) {
      chunks.push(trimmed.slice(cursor).trim());
      break;
    }

    const window = trimmed.slice(cursor, cursor + maxChars);
    // Only boundaries past the halfway mark are worth taking; an earlier one
    // wastes so much of the budget that the chunk count climbs and every extra
    // chunk costs another minute of rate-limit waiting.
    const floor = Math.floor(maxChars / 2);
    let cut = -1;
    for (const separator of ["\n\n", "\n", ". ", " "]) {
      const found = window.lastIndexOf(separator);
      if (found > floor) {
        cut = found + separator.length;
        break;
      }
    }

    const width = cut > 0 ? cut : maxChars;
    const piece = trimmed.slice(cursor, cursor + width).trim();
    if (piece) chunks.push(piece);
    cursor += width;
  }

  return chunks.filter((chunk) => chunk.length > 0);
}

/** The text a card is really "about", used to spot the same fact twice. */
function cardIdentity(card: CardContent): string {
  // Switching on the discriminant rather than indexing keeps this honest if a
  // payload ever gains or renames its prompt field: the compiler objects here
  // instead of dedupe silently degrading to "every card is unique".
  let primary: string;
  switch (card.gameType) {
    case "compassQuiz":
      primary = card.payload.question;
      break;
    case "trueFalseDuel":
      primary = card.payload.statement;
      break;
    case "sequenceSwipe":
    case "matchRelease":
      primary = card.payload.prompt;
      break;
  }
  return `${card.gameType}:${primary.toLowerCase().replace(/\s+/g, " ").trim()}`;
}

/**
 * Chunks are extracted independently, so overlapping passages can yield the
 * same fact twice. Takes one card from each chunk in turn rather than draining
 * the first: when the merged pile exceeds the target, round-robin keeps the
 * surviving cards spread across the whole document instead of concentrating
 * them in its opening pages.
 */
export function mergeExtractedCards(groups: CardContent[][], limit: number): CardContent[] {
  const merged: CardContent[] = [];
  const seen = new Set<string>();
  const depth = Math.max(0, ...groups.map((group) => group.length));

  for (let index = 0; index < depth && merged.length < limit; index += 1) {
    for (const group of groups) {
      if (merged.length >= limit) break;
      const card = group[index];
      if (!card) continue;
      const identity = cardIdentity(card);
      if (seen.has(identity)) continue;
      seen.add(identity);
      merged.push(card);
    }
  }

  return merged;
}

export function makeUploadDeckId(uploadId: string): string {
  return `upload-${uploadId}`;
}

export function makeUploadCardId(uploadId: string, index: number): string {
  return `upload-${uploadId}-card-${index + 1}`;
}

export function majorityGameType(cards: CardContent[]): GameType {
  const counts = new Map<GameType, number>();
  for (const card of cards) counts.set(card.gameType, (counts.get(card.gameType) ?? 0) + 1);

  let winner: GameType = "compassQuiz";
  let winnerCount = 0;
  for (const [gameType, count] of counts) {
    if (count > winnerCount) {
      winner = gameType;
      winnerCount = count;
    }
  }
  return winner;
}

export function buildUploadDeckPayload<TimestampValue>(input: {
  deckId: string;
  ownerId: string;
  courseId: string;
  title: string;
  uploadId: string;
  cards: CardContent[];
  timestamp: TimestampValue;
}) {
  return {
    deckId: input.deckId,
    ownerId: input.ownerId,
    courseId: input.courseId,
    title: normaliseTitle(input.title),
    sourceType: "upload" as const,
    uploadId: input.uploadId,
    cardCount: input.cards.length,
    createdAt: input.timestamp,
    updatedAt: input.timestamp,
  };
}

export function buildUploadCardPayload<TimestampValue>(input: {
  deckId: string;
  uploadId: string;
  index: number;
  card: CardContent;
  timestamp: TimestampValue;
}) {
  const { gameType, difficulty, payload, topic } = input.card;
  return {
    cardId: makeUploadCardId(input.uploadId, input.index),
    deckId: input.deckId,
    gameType,
    difficulty,
    ...(topic ? { topic } : {}),
    payload,
    createdAt: input.timestamp,
  };
}

/** Keeps unexpected exceptions out of the Firestore job record and bounds all expected messages. */
export function safeUploadError(error: unknown, maxLength = 240): string {
  const message =
    error instanceof UploadProcessingError
      ? error.message
      : "THE EXTRACTION COULDN'T BE COMPLETED — PLEASE TRY AGAIN";
  return message.slice(0, maxLength);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}
