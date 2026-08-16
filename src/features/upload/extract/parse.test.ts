import { describe, expect, it } from "vitest";

import { parseExtractionResponse } from "./parse";

const courses = [
  { id: "geography", title: "GEOGRAPHY" },
  { id: "history", title: "HISTORY" },
];

const ctx = { courses, provider: "mock" as const, template: "auto" as const };

const compassCard = {
  gameType: "compassQuiz",
  difficulty: 2,
  payload: { question: "capital of france?", choices: ["paris", "rome", "madrid"], correctIndex: 0 },
};

const trueFalseCard = {
  gameType: "trueFalseDuel",
  difficulty: 1,
  payload: { statement: "the nile is a river in africa", isTrue: true },
};

const sequenceCard = {
  gameType: "sequenceSwipe",
  difficulty: 3,
  payload: { prompt: "order these", orderedItems: ["one", "two", "three", "four"] },
};

const matchCard = {
  gameType: "matchRelease",
  difficulty: 2,
  payload: {
    prompt: "match each",
    pairs: [
      { term: "heart", definition: "pumps blood" },
      { term: "lungs", definition: "exchange gas" },
      { term: "kidneys", definition: "filter waste" },
    ],
  },
};

function body(cards: unknown[], extra: Record<string, unknown> = {}) {
  return JSON.stringify({ cards, suggestedCourse: "GEOGRAPHY", confidence: 0.75, ...extra });
}

describe("parseExtractionResponse", () => {
  it("parses a clean response", () => {
    const outcome = parseExtractionResponse(body([compassCard]), ctx);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.cards).toEqual([
      { gameType: "compassQuiz", difficulty: 2, payload: { question: "CAPITAL OF FRANCE?", choices: ["PARIS", "ROME", "MADRID"], correctIndex: 0 } },
    ]);
  });

  it("strips a ```json code fence", () => {
    const fenced = "```json\n" + body([compassCard]) + "\n```";
    const outcome = parseExtractionResponse(fenced, ctx);
    expect(outcome.ok).toBe(true);
  });

  it("strips leading and trailing prose", () => {
    const wrapped = `Sure, here are the cards:\n${body([compassCard])}\nHope that helps!`;
    const outcome = parseExtractionResponse(wrapped, ctx);
    expect(outcome.ok).toBe(true);
  });

  it("rejects unparseable garbage as badResponse", () => {
    const outcome = parseExtractionResponse("not json at all, no braces here", ctx);
    expect(outcome).toEqual({ ok: false, reason: "badResponse", message: expect.any(String) });
  });

  it("rejects a response whose braces do not contain valid JSON", () => {
    const outcome = parseExtractionResponse("here you go: { this is not json }", ctx);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe("badResponse");
  });

  it("returns empty when the cards array is empty", () => {
    const outcome = parseExtractionResponse(body([]), ctx);
    expect(outcome).toEqual({ ok: false, reason: "empty", message: expect.any(String) });
  });

  it("returns empty when every card is malformed", () => {
    const outcome = parseExtractionResponse(body([{ gameType: "compassQuiz", payload: {} }]), ctx);
    expect(outcome).toEqual({ ok: false, reason: "empty", message: expect.any(String) });
  });

  it("drops malformed cards but keeps the valid ones in a mixed batch", () => {
    const malformed = { gameType: "compassQuiz", payload: { choices: ["only one"] } };
    const outcome = parseExtractionResponse(body([compassCard, malformed, trueFalseCard]), ctx);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.cards).toHaveLength(2);
    expect(outcome.result.cards.map((c) => c.gameType)).toEqual(["compassQuiz", "trueFalseDuel"]);
  });

  it("drops a compassQuiz card without exactly 3 choices", () => {
    const bad = { ...compassCard, payload: { ...compassCard.payload, choices: ["paris", "rome"] } };
    const outcome = parseExtractionResponse(body([bad]), ctx);
    expect(outcome).toMatchObject({ ok: false, reason: "empty" });
  });

  it("drops a compassQuiz card with an out-of-range correctIndex", () => {
    const bad = { ...compassCard, payload: { ...compassCard.payload, correctIndex: 3 } };
    const outcome = parseExtractionResponse(body([bad]), ctx);
    expect(outcome).toMatchObject({ ok: false, reason: "empty" });
  });

  it("drops a trueFalseDuel card at or over 60 characters", () => {
    const bad = {
      gameType: "trueFalseDuel",
      payload: { statement: "x".repeat(60), isTrue: true },
    };
    const outcome = parseExtractionResponse(body([bad]), ctx);
    expect(outcome).toMatchObject({ ok: false, reason: "empty" });
  });

  it("keeps a trueFalseDuel card just under 60 characters", () => {
    const ok = {
      gameType: "trueFalseDuel",
      payload: { statement: "x".repeat(59), isTrue: true },
    };
    const outcome = parseExtractionResponse(body([ok]), ctx);
    expect(outcome.ok).toBe(true);
  });

  it("drops a sequenceSwipe card without exactly 4 items", () => {
    const bad = { ...sequenceCard, payload: { ...sequenceCard.payload, orderedItems: ["one", "two"] } };
    const outcome = parseExtractionResponse(body([bad]), ctx);
    expect(outcome).toMatchObject({ ok: false, reason: "empty" });
  });

  it("drops a matchRelease card without exactly 3 pairs", () => {
    const bad = { ...matchCard, payload: { ...matchCard.payload, pairs: matchCard.payload.pairs.slice(0, 2) } };
    const outcome = parseExtractionResponse(body([bad]), ctx);
    expect(outcome).toMatchObject({ ok: false, reason: "empty" });
  });

  it("enforces a non-auto template by dropping cards of other types", () => {
    const strictCtx = { ...ctx, template: "trueFalseDuel" as const };
    const outcome = parseExtractionResponse(body([compassCard, trueFalseCard]), strictCtx);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.cards).toHaveLength(1);
    expect(outcome.result.cards[0].gameType).toBe("trueFalseDuel");
  });

  it("clamps difficulty into 1-3 and defaults a missing one to 2", () => {
    const tooHigh = { ...compassCard, difficulty: 9 };
    const tooLow = { ...trueFalseCard, difficulty: -4 };
    const missing = { ...sequenceCard, difficulty: undefined };
    const outcome = parseExtractionResponse(body([tooHigh, tooLow, missing]), ctx);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.cards.map((c) => c.difficulty)).toEqual([3, 1, 2]);
  });

  it("clamps confidence into 0-1", () => {
    const outcome = parseExtractionResponse(body([compassCard], { confidence: 5 }), ctx);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.confidence).toBe(1);
  });

  it("defaults confidence to 0 when it is missing or not a number", () => {
    const outcome = parseExtractionResponse(body([compassCard], { confidence: "high" }), ctx);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.confidence).toBe(0);
  });

  it("resolves suggestedCourseId on a course title match", () => {
    const outcome = parseExtractionResponse(body([compassCard], { suggestedCourse: "history" }), ctx);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.suggestedCourseId).toBe("history");
    expect(outcome.result.suggestedTitle).toBe("HISTORY");
  });

  it("leaves suggestedCourseId null when nothing matches", () => {
    const outcome = parseExtractionResponse(body([compassCard], { suggestedCourse: "Chemistry" }), ctx);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.suggestedCourseId).toBeNull();
    expect(outcome.result.suggestedTitle).toBe("CHEMISTRY");
  });

  it("carries the provider through onto the result", () => {
    const outcome = parseExtractionResponse(body([compassCard]), { ...ctx, provider: "gemini" });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.provider).toBe("gemini");
  });
});
