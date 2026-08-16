import type { ExtractionRequest } from "@/features/upload/types";

/**
 * Mirrors the constraints the game screens actually assume — CompassQuestion
 * needs exactly three choices because the compass has three directions plus
 * Pass, TrueFalseStatement wraps ugly past ~60 characters, SequenceRound
 * always has four steps, and MatchRound only has room for three zones. A
 * card that violates one of these gets dropped by parse.ts regardless of
 * what the model does here, but asking for it correctly means fewer cards
 * are wasted.
 */
const TEMPLATE_RULES = `
- compassQuiz: payload = { question, choices, correctIndex }. "choices" has EXACTLY 3 entries. "correctIndex" is 0, 1, or 2, indexing into "choices".
- trueFalseDuel: payload = { statement, isTrue }. "statement" is a single sentence UNDER 60 CHARACTERS — it renders inside a circle and wraps badly past that.
- sequenceSwipe: payload = { prompt, orderedItems }. "orderedItems" has EXACTLY 4 entries, stored in the CORRECT order (earliest/smallest/first to last) — the app shuffles its own copy for play.
- matchRelease: payload = { prompt, pairs }. "pairs" has EXACTLY 3 entries, each { term, definition }. "definition" is a short clause, not a full sentence.
`.trim();

export function buildExtractionPrompt(request: ExtractionRequest): { system: string; user: string } {
  const courseList = request.courses.length
    ? request.courses.map((course) => `- ${course.title}`).join("\n")
    : "(none yet — propose a new one)";

  const templateInstruction =
    request.template === "auto"
      ? "Choose whichever template below fits each fact best — mix templates across the batch."
      : `Every card MUST use the "${request.template}" payload shape below. Do not produce any other shape.`;

  const system = `
You turn study material into flashcards for a quiz app. Respond with JSON ONLY.
No prose, no markdown, no code fences — nothing before the first { or after the last }.

Output shape:
{
  "cards": [ { "gameType": "compassQuiz" | "trueFalseDuel" | "sequenceSwipe" | "matchRelease", "difficulty": 1 | 2 | 3, "payload": { ... } } ],
  "suggestedCourse": "COURSE TITLE",
  "confidence": 0.0
}

Per-template payload rules:
${TEMPLATE_RULES}

${templateInstruction}

Every string of card text (questions, choices, statements, prompts, items,
terms, definitions) MUST be UPPERCASE. The app renders these strings exactly
as given, with no casing applied on the client.

"suggestedCourse" is the course this material belongs under. If one of the
existing courses listed below clearly fits, return that title verbatim;
otherwise propose a short new course title of your own, in the same
uppercase style. "confidence" is 0 to 1 and reflects how sure you are about
that course match, not how sure you are about the cards themselves.
`.trim();

  const user = `
Existing courses:
${courseList}

Extract roughly ${request.cardTarget} cards from the attached material (source file: ${request.file.name}).
`.trim();

  return { system, user };
}
