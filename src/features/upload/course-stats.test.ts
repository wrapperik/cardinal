import { describe, expect, it } from "vitest";

import { courseStats } from "./course-stats";
import type { LocalDeck } from "@/features/upload/types";
import type { CardContent, GameType } from "@/types/cardinal";

function card(gameType: GameType, topic?: string): CardContent {
  switch (gameType) {
    case "compassQuiz":
      return { gameType, difficulty: 2, topic, payload: { question: "Q", choices: ["A", "B", "C"], correctIndex: 0 } };
    case "trueFalseDuel":
      return { gameType, difficulty: 2, topic, payload: { statement: "S", isTrue: true } };
    case "sequenceSwipe":
      return { gameType, difficulty: 2, topic, payload: { prompt: "P", orderedItems: ["1", "2", "3", "4"] } };
    case "matchRelease":
      return {
        gameType,
        difficulty: 2,
        topic,
        payload: {
          prompt: "P",
          pairs: [
            { term: "T1", definition: "D1" },
            { term: "T2", definition: "D2" },
            { term: "T3", definition: "D3" },
          ],
        },
      };
  }
}

function deck(courseId: string, cards: CardContent[], id = `deck-${courseId}-${cards.length}`): LocalDeck {
  return {
    id,
    courseId,
    title: "TITLE",
    sourceName: "file.pdf",
    cards: cards.map((card, index) => ({ ...card, cardId: `${id}-card-${index}` })),
    createdAt: 0,
    updatedAt: 0,
    provider: "mock",
    sourceType: "manual",
    uploadId: null,
  };
}

describe("courseStats", () => {
  it("returns zero stats for an empty deck list", () => {
    expect(courseStats([], "geography")).toEqual({ cardCount: 0, gameTypes: [], topics: [] });
  });

  it("returns zero stats when no deck matches the course", () => {
    const decks = [deck("history", [card("compassQuiz")])];
    expect(courseStats(decks, "geography")).toEqual({ cardCount: 0, gameTypes: [], topics: [] });
  });

  it("sums cards across multiple decks belonging to the same course", () => {
    const decks = [
      deck("geography", [card("compassQuiz"), card("trueFalseDuel")], "deck-a"),
      deck("geography", [card("sequenceSwipe")], "deck-b"),
    ];
    expect(courseStats(decks, "geography").cardCount).toBe(3);
  });

  it("excludes decks belonging to other courses from the count", () => {
    const decks = [
      deck("geography", [card("compassQuiz")], "deck-a"),
      deck("history", [card("compassQuiz"), card("compassQuiz")], "deck-b"),
    ];
    expect(courseStats(decks, "geography").cardCount).toBe(1);
  });

  it("orders gameTypes canonically regardless of the order cards arrive in", () => {
    const decks = [
      deck("geography", [card("matchRelease"), card("compassQuiz"), card("trueFalseDuel")]),
    ];
    expect(courseStats(decks, "geography").gameTypes).toEqual(["compassQuiz", "trueFalseDuel", "matchRelease"]);
  });

  it("de-duplicates gameTypes", () => {
    const decks = [deck("geography", [card("compassQuiz"), card("compassQuiz"), card("trueFalseDuel")])];
    expect(courseStats(decks, "geography").gameTypes).toEqual(["compassQuiz", "trueFalseDuel"]);
  });

  it("lists topics distinct and in first-seen order", () => {
    const decks = [
      deck("geography", [
        card("compassQuiz", "RIVERS"),
        card("trueFalseDuel", "MOUNTAINS"),
        card("sequenceSwipe", "RIVERS"),
        card("matchRelease", "CAPITALS"),
      ]),
    ];
    expect(courseStats(decks, "geography").topics).toEqual(["RIVERS", "MOUNTAINS", "CAPITALS"]);
  });

  it("excludes topic-less cards from topics but still counts them", () => {
    const decks = [
      deck("geography", [card("compassQuiz", "RIVERS"), card("trueFalseDuel"), card("sequenceSwipe")]),
    ];
    const stats = courseStats(decks, "geography");
    expect(stats.cardCount).toBe(3);
    expect(stats.topics).toEqual(["RIVERS"]);
  });
});
