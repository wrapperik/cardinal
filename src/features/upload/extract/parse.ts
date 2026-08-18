/**
 * Turns a model's raw text response into cards, or explains why it could
 * not. Pure — no React Native imports — so vitest can hammer it with
 * malformed and adversarial input under node, which is most of the value:
 * the model is the least trustworthy input in the whole pipeline.
 */

// Relative, not "@/features/upload/course-rules": this module is loaded
// directly by vitest, which has no alias resolution configured (only the
// Metro/tsc toolchain understands the "@/" path), so the one runtime
// dependency this pure file has must be resolvable on its own.
import { findCourseByTitle } from "../course-rules";
import type {
  Course,
  ExtractionOutcome,
  ExtractionProviderId,
  ExtractionResult,
  TemplateChoice,
} from "@/features/upload/types";
import type { CardContent, GameType } from "@/types/cardinal";

interface ParseContext {
  courses: Pick<Course, "id" | "title">[];
  provider: ExtractionProviderId;
  template: TemplateChoice;
}

const CARD_TEMPLATES: readonly GameType[] = [
  "compassQuiz",
  "trueFalseDuel",
  "sequenceSwipe",
  "matchRelease",
];

const TRUE_FALSE_MAX_LENGTH = 60;

/**
 * Models routinely wrap JSON in ```json fences or lead with a sentence of
 * preamble despite being told not to. Slicing from the first { to the last }
 * survives both without needing a real parser for the surrounding prose.
 */
function sliceJson(raw: string): string | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  return raw.slice(start, end + 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampFinite(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? clamp(numeric, min, max) : fallback;
}

function upper(value: unknown): string {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseCompass(payload: Record<string, unknown>, difficulty: number): CardContent | null {
  if (!Array.isArray(payload.choices) || payload.choices.length !== 3) return null;
  const choices = payload.choices.map(upper);
  if (choices.some((choice) => choice.length === 0)) return null;

  const question = upper(payload.question);
  const correctIndex = Math.trunc(Number(payload.correctIndex));
  if (!question || !Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 2) return null;

  return { gameType: "compassQuiz", difficulty, payload: { question, choices, correctIndex } };
}

function parseTrueFalse(payload: Record<string, unknown>, difficulty: number): CardContent | null {
  const statement = upper(payload.statement);
  if (!statement || statement.length >= TRUE_FALSE_MAX_LENGTH) return null;
  if (typeof payload.isTrue !== "boolean") return null;

  return { gameType: "trueFalseDuel", difficulty, payload: { statement, isTrue: payload.isTrue } };
}

function parseSequence(payload: Record<string, unknown>, difficulty: number): CardContent | null {
  if (!Array.isArray(payload.orderedItems) || payload.orderedItems.length !== 4) return null;
  const orderedItems = payload.orderedItems.map(upper);
  if (orderedItems.some((item) => item.length === 0)) return null;

  const prompt = upper(payload.prompt);
  if (!prompt) return null;

  return { gameType: "sequenceSwipe", difficulty, payload: { prompt, orderedItems } };
}

function parseMatch(payload: Record<string, unknown>, difficulty: number): CardContent | null {
  if (!Array.isArray(payload.pairs) || payload.pairs.length !== 3) return null;

  const pairs: { term: string; definition: string }[] = [];
  for (const raw of payload.pairs) {
    if (!isRecord(raw)) return null;
    const term = upper(raw.term);
    const definition = upper(raw.definition);
    if (!term || !definition) return null;
    pairs.push({ term, definition });
  }

  const prompt = upper(payload.prompt);
  if (!prompt) return null;

  return { gameType: "matchRelease", difficulty, payload: { prompt, pairs } };
}

function parseCard(raw: unknown, template: TemplateChoice): CardContent | null {
  if (!isRecord(raw)) return null;

  const gameType = raw.gameType;
  if (typeof gameType !== "string" || !CARD_TEMPLATES.includes(gameType as GameType)) return null;
  if (template !== "auto" && gameType !== template) return null;

  if (!isRecord(raw.payload)) return null;
  const difficulty = clampFinite(raw.difficulty, 1, 3, 2);

  switch (gameType as GameType) {
    case "compassQuiz":
      return parseCompass(raw.payload, difficulty);
    case "trueFalseDuel":
      return parseTrueFalse(raw.payload, difficulty);
    case "sequenceSwipe":
      return parseSequence(raw.payload, difficulty);
    case "matchRelease":
      return parseMatch(raw.payload, difficulty);
  }
}

export function parseExtractionResponse(raw: string, ctx: ParseContext): ExtractionOutcome {
  const sliced = sliceJson(raw);
  if (!sliced) {
    return { ok: false, reason: "badResponse", message: "THE MODEL DIDN'T RETURN ANY JSON" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(sliced);
  } catch {
    return { ok: false, reason: "badResponse", message: "COULDN'T READ THE MODEL'S RESPONSE" };
  }

  if (!isRecord(parsed) || !Array.isArray(parsed.cards)) {
    return { ok: false, reason: "badResponse", message: "THE RESPONSE WAS MISSING ITS CARDS" };
  }

  const cards = parsed.cards
    .map((card) => parseCard(card, ctx.template))
    .filter((card): card is CardContent => card !== null);

  if (cards.length === 0) {
    return { ok: false, reason: "empty", message: "NO USABLE CARDS CAME BACK — TRY A DIFFERENT FILE" };
  }

  const suggestedTitle = upper(parsed.suggestedCourse) || "NEW MATERIAL";
  const match = findCourseByTitle(ctx.courses, suggestedTitle);
  const confidence = clampFinite(parsed.confidence, 0, 1, 0);

  const result: ExtractionResult = {
    cards,
    suggestedTitle,
    suggestedCourseId: match?.id ?? null,
    confidence,
    provider: ctx.provider,
  };

  return { ok: true, result };
}
