import { describe, expect, it } from "vitest";

import { TUTORIAL_COURSE_ID, tutorialCards, tutorialPlan, tutorialTipFor } from "./tutorial";

describe("tutorialCards", () => {
  it("provides a fixed 15-card introduction across all four game types", () => {
    const cards = tutorialCards();

    expect(cards).toHaveLength(15);
    expect(cards.filter((card) => card.gameType === "compassQuiz")).toHaveLength(4);
    expect(cards.filter((card) => card.gameType === "trueFalseDuel")).toHaveLength(4);
    expect(cards.filter((card) => card.gameType === "sequenceSwipe")).toHaveLength(4);
    expect(cards.filter((card) => card.gameType === "matchRelease")).toHaveLength(3);
  });

  it("assigns stable card ids under one tutorial deck", () => {
    expect(tutorialCards().map((card) => [card.cardId, card.deckId])).toEqual([
      ["tutorial-01", TUTORIAL_COURSE_ID],
      ["tutorial-02", TUTORIAL_COURSE_ID],
      ["tutorial-03", TUTORIAL_COURSE_ID],
      ["tutorial-04", TUTORIAL_COURSE_ID],
      ["tutorial-05", TUTORIAL_COURSE_ID],
      ["tutorial-06", TUTORIAL_COURSE_ID],
      ["tutorial-07", TUTORIAL_COURSE_ID],
      ["tutorial-08", TUTORIAL_COURSE_ID],
      ["tutorial-09", TUTORIAL_COURSE_ID],
      ["tutorial-10", TUTORIAL_COURSE_ID],
      ["tutorial-11", TUTORIAL_COURSE_ID],
      ["tutorial-12", TUTORIAL_COURSE_ID],
      ["tutorial-13", TUTORIAL_COURSE_ID],
      ["tutorial-14", TUTORIAL_COURSE_ID],
      ["tutorial-15", TUTORIAL_COURSE_ID],
    ]);
  });

  it("has a concise, game-specific tip for each tutorial leg", () => {
    expect(tutorialTipFor("compassQuiz")?.body).toContain("A, B OR C");
    expect(tutorialTipFor("trueFalseDuel")?.body).toContain("LEFT FOR FALSE");
    expect(tutorialTipFor("sequenceSwipe")?.body).toContain("DRAG A CARD");
    expect(tutorialTipFor("matchRelease")?.body).toContain("MATCHING DEFINITION");
  });

  it("keeps each game together in a four-leg recap plan", () => {
    expect(tutorialPlan().legs.map((leg) => [leg.gameType, leg.start, leg.cards.length])).toEqual([
      ["compassQuiz", 0, 4],
      ["trueFalseDuel", 4, 4],
      ["sequenceSwipe", 8, 4],
      ["matchRelease", 12, 3],
    ]);
  });
});
