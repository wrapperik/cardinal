import { normaliseTitle } from "../../../src/features/upload/course-rules";
import type { CardContent, GameType } from "../../../src/types/cardinal";

export const DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile";

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
  constructor(message: string) {
    super(message);
    this.name = "UploadProcessingError";
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

/** Pulls only the string the parser accepts from a Groq chat-completions response. */
export function extractGroqCompletion(value: unknown): string {
  const response = asRecord(value);
  const firstChoice = Array.isArray(response?.choices) ? asRecord(response.choices[0]) : null;
  const message = asRecord(firstChoice?.message);
  const content = message?.content;

  if (typeof content !== "string" || content.trim().length === 0) {
    throw new UploadProcessingError("THE EXTRACTION SERVICE RETURNED NO USABLE RESPONSE");
  }

  return content;
}

/** API errors are deliberately mapped to stable user-facing text, never provider response bodies. */
export function mapGroqHttpError(status: number): string {
  if (status === 401 || status === 403) return "THE EXTRACTION SERVICE IS NOT CONFIGURED";
  if (status === 408 || status === 429) return "THE EXTRACTION SERVICE IS BUSY — TRY AGAIN SOON";
  if (status === 400 || status === 413 || status === 422) {
    return "THE FILE COULDN'T BE PROCESSED BY THE EXTRACTION SERVICE";
  }
  if (status >= 500) return "THE EXTRACTION SERVICE IS TEMPORARILY UNAVAILABLE";
  return "THE EXTRACTION SERVICE REJECTED THE REQUEST";
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
