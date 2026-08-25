/**
 * The default provider: no key, no network, never fails. It exists so the
 * whole upload flow — pick, extract, review, save — is demoable from a
 * clean checkout, and so the review screen has something real to render
 * until the server-side Gemini extraction function is connected.
 */

import { findCourseByTitle } from "@/features/upload/course-rules";
import { SAMPLE_ROUNDS as MATCH_ROUNDS } from "@/features/match/rounds";
import { SAMPLE_QUESTIONS } from "@/features/quiz/questions";
import { SAMPLE_ROUNDS as SEQUENCE_ROUNDS } from "@/features/sequence/rounds";
import { SAMPLE_STATEMENTS } from "@/features/true-false/statements";
import type { ExtractionOutcome, ExtractionProvider, ExtractionRequest, ExtractionResult } from "@/features/upload/types";
import type { CardContent, GameType } from "@/types/cardinal";

const ALL_TEMPLATES: readonly GameType[] = [
  "compassQuiz",
  "trueFalseDuel",
  "sequenceSwipe",
  "matchRelease",
];

/**
 * Five steps over roughly 2.5 seconds — long enough that the extracting
 * stage in the UI is actually visible and demoable, short enough that
 * nobody waits around for a fixture.
 */
const PROGRESS_STEPS = 5;
const STEP_DELAY_MS = 500;

/** Loose keyword match against the picked filename so the suggestion feels attached to the file, not fixed. */
const COURSE_KEYWORDS: [RegExp, string][] = [
  [/hist/i, "HISTORY"],
  [/geo/i, "GEOGRAPHY"],
  [/bio/i, "BIOLOGY"],
  [/art|visual|culture|paint/i, "VISUAL CULTURE"],
];

function guessCourseTitle(filename: string): string {
  const hit = COURSE_KEYWORDS.find(([pattern]) => pattern.test(filename));
  return hit ? hit[1] : "NEW MATERIAL";
}

/**
 * Three labels, not one per card, so the fixture path actually exercises
 * grouping — a real extraction clusters cards into a handful of sub-areas,
 * and a demo where every card gets its own topic would never surface a bug
 * in that grouping. Assigned by index rather than drawn at random so the
 * fixture stays deterministic across runs.
 */
const MOCK_TOPICS = ["OVERVIEW", "KEY CONCEPTS", "DETAILS"];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildCard(gameType: GameType, index: number): CardContent {
  const topic = MOCK_TOPICS[index % MOCK_TOPICS.length];
  switch (gameType) {
    case "compassQuiz": {
      const source = SAMPLE_QUESTIONS[index % SAMPLE_QUESTIONS.length];
      return {
        gameType,
        difficulty: 2,
        topic,
        payload: { question: source.prompt, choices: [...source.choices], correctIndex: source.correctIndex },
      };
    }
    case "trueFalseDuel": {
      const source = SAMPLE_STATEMENTS[index % SAMPLE_STATEMENTS.length];
      return { gameType, difficulty: 2, topic, payload: { statement: source.statement, isTrue: source.isTrue } };
    }
    case "sequenceSwipe": {
      const source = SEQUENCE_ROUNDS[index % SEQUENCE_ROUNDS.length];
      return {
        gameType,
        difficulty: 2,
        topic,
        payload: { prompt: source.prompt, orderedItems: [...source.orderedItems] },
      };
    }
    case "matchRelease": {
      const source = MATCH_ROUNDS[index % MATCH_ROUNDS.length];
      return {
        gameType,
        difficulty: 2,
        topic,
        payload: { prompt: source.prompt, pairs: source.pairs.map((pair) => ({ ...pair })) },
      };
    }
  }
}

async function extract(
  request: ExtractionRequest,
  onProgress?: (progress: import("@/features/upload/types").ExtractionProgress) => void,
): Promise<ExtractionOutcome> {
  for (let step = 1; step <= PROGRESS_STEPS; step += 1) {
    await delay(STEP_DELAY_MS);
    if (request.signal?.aborted) return { ok: false, reason: "cancelled", message: "EXTRACTION CANCELLED" };
    const fraction = step / PROGRESS_STEPS;
    onProgress?.({
      fraction,
      phase: fraction <= 0.6 ? "uploading" : fraction <= 0.7 ? "queued" : fraction <= 0.85 ? "extracting" : "parsing",
    });
  }

  const templates = request.template === "auto" ? ALL_TEMPLATES : [request.template];
  const cardCount = Math.max(1, request.cardTarget);
  const cards: CardContent[] = Array.from({ length: cardCount }, (_, index) =>
    buildCard(templates[index % templates.length], index),
  );

  const suggestedTitle = guessCourseTitle(request.file.name);
  const match = findCourseByTitle(request.courses, suggestedTitle);

  const result: ExtractionResult = {
    cards,
    suggestedTitle,
    suggestedCourseId: match?.id ?? null,
    // Higher confidence when the filename actually matched an existing
    // course, so the review screen's "looks right?" nudge is not uniform.
    confidence: match ? 0.9 : 0.5,
    provider: "mock",
  };

  return { ok: true, result };
}

export const mockProvider: ExtractionProvider = {
  id: "mock",
  label: "DEMO (NO API KEY NEEDED)",
  isConfigured: () => true,
  extract,
};
