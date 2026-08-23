import { describe, expect, it } from "vitest";

import {
  buildRecapPlan,
  legAt,
  resumeIndex,
  sanitiseCheckpoints,
  type Checkpoint,
  type RecapPlan,
} from "./recap-rules";
import type { LocalDeck } from "@/features/upload/types";
import type { CardContent, GameType } from "@/types/cardinal";

function card(gameType: GameType, topic: string | undefined, tag: string): CardContent {
  switch (gameType) {
    case "compassQuiz":
      return { gameType, difficulty: 2, topic, payload: { question: tag, choices: ["A", "B", "C"], correctIndex: 0 } };
    case "trueFalseDuel":
      return { gameType, difficulty: 2, topic, payload: { statement: tag, isTrue: true } };
    case "sequenceSwipe":
      return { gameType, difficulty: 2, topic, payload: { prompt: tag, orderedItems: ["1", "2", "3", "4"] } };
    case "matchRelease":
      return {
        gameType,
        difficulty: 2,
        topic,
        payload: {
          prompt: tag,
          pairs: [
            { term: "T1", definition: "D1" },
            { term: "T2", definition: "D2" },
            { term: "T3", definition: "D3" },
          ],
        },
      };
  }
}

/** Pulls the distinguishing tag back out of a card, regardless of its gameType's payload shape. */
function tagOf(c: CardContent): string {
  switch (c.gameType) {
    case "compassQuiz":
      return c.payload.question;
    case "trueFalseDuel":
      return c.payload.statement;
    case "sequenceSwipe":
      return c.payload.prompt;
    case "matchRelease":
      return c.payload.prompt;
  }
}

function deck(courseId: string, cards: CardContent[], id = `deck-${courseId}-${cards.length}-${Math.random()}`): LocalDeck {
  return {
    id,
    courseId,
    title: "TITLE",
    sourceName: "file.pdf",
    cards,
    createdAt: 0,
    provider: "mock",
  };
}

describe("buildRecapPlan", () => {
  it("returns an empty plan for no decks", () => {
    const plan = buildRecapPlan([], "geography");
    expect(plan).toEqual({ courseId: "geography", cards: [], legs: [] });
  });

  it("excludes cards from decks belonging to other courses", () => {
    const decks = [deck("history", [card("compassQuiz", undefined, "h1")])];
    const plan = buildRecapPlan(decks, "geography");
    expect(plan.cards).toEqual([]);
    expect(plan.legs).toEqual([]);
  });

  it("orders topic groups in first-seen order", () => {
    const decks = [
      deck("geography", [
        card("compassQuiz", "MOUNTAINS", "m1"),
        card("compassQuiz", "RIVERS", "r1"),
        card("compassQuiz", "MOUNTAINS", "m2"),
      ]),
    ];
    const plan = buildRecapPlan(decks, "geography");
    expect(plan.legs.map((leg) => leg.topic)).toEqual(["MOUNTAINS", "RIVERS"]);
  });

  it("puts untopiced cards in a single trailing leg with topic undefined", () => {
    const decks = [
      deck("geography", [
        card("compassQuiz", undefined, "u1"),
        card("compassQuiz", "RIVERS", "r1"),
        card("compassQuiz", undefined, "u2"),
      ]),
    ];
    const plan = buildRecapPlan(decks, "geography");
    expect(plan.legs.map((leg) => leg.topic)).toEqual(["RIVERS", undefined]);
    const trailing = plan.legs[plan.legs.length - 1];
    expect(trailing.cards.map(tagOf)).toEqual(["u1", "u2"]);
  });

  it("orders game types canonically within a topic regardless of arrival order", () => {
    const decks = [
      deck("geography", [
        card("matchRelease", "RIVERS", "mr1"),
        card("compassQuiz", "RIVERS", "cq1"),
        card("trueFalseDuel", "RIVERS", "tf1"),
        card("sequenceSwipe", "RIVERS", "sq1"),
      ]),
    ];
    const plan = buildRecapPlan(decks, "geography");
    expect(plan.legs.map((leg) => leg.gameType)).toEqual([
      "compassQuiz",
      "trueFalseDuel",
      "sequenceSwipe",
      "matchRelease",
    ]);
  });

  it("keeps the game-type sort stable — same-type cards keep their input order", () => {
    const decks = [
      deck("geography", [
        card("compassQuiz", "RIVERS", "cq-first"),
        card("trueFalseDuel", "RIVERS", "tf-only"),
        card("compassQuiz", "RIVERS", "cq-second"),
        card("compassQuiz", "RIVERS", "cq-third"),
      ]),
    ];
    const plan = buildRecapPlan(decks, "geography");
    const compassLeg = plan.legs.find((leg) => leg.gameType === "compassQuiz" && leg.topic === "RIVERS");
    expect(compassLeg?.cards.map(tagOf)).toEqual(["cq-first", "cq-second", "cq-third"]);
  });

  it("produces one leg per (topic, gameType) pair with start offsets lining up with plan.cards", () => {
    const decks = [
      deck("geography", [
        card("trueFalseDuel", "RIVERS", "tf-r"),
        card("compassQuiz", "RIVERS", "cq-r1"),
        card("compassQuiz", "RIVERS", "cq-r2"),
        card("compassQuiz", "MOUNTAINS", "cq-m"),
      ]),
    ];
    const plan = buildRecapPlan(decks, "geography");

    // RIVERS: compassQuiz (2 cards), trueFalseDuel (1 card); then MOUNTAINS: compassQuiz (1 card).
    expect(plan.legs).toHaveLength(3);
    expect(plan.legs[0]).toMatchObject({ topic: "RIVERS", gameType: "compassQuiz", start: 0 });
    expect(plan.legs[1]).toMatchObject({ topic: "RIVERS", gameType: "trueFalseDuel", start: 2 });
    expect(plan.legs[2]).toMatchObject({ topic: "MOUNTAINS", gameType: "compassQuiz", start: 3 });

    for (const leg of plan.legs) {
      expect(plan.cards.slice(leg.start, leg.start + leg.cards.length)).toEqual(leg.cards);
    }
  });

  it("preserves deck order then card-within-deck order for cards that tie on topic and gameType", () => {
    const decks = [
      deck("geography", [card("compassQuiz", "RIVERS", "a")], "deck-a"),
      deck("geography", [card("compassQuiz", "RIVERS", "b")], "deck-b"),
    ];
    const plan = buildRecapPlan(decks, "geography");
    expect(plan.cards.map(tagOf)).toEqual(["a", "b"]);
  });
});

describe("legAt", () => {
  const decks = [
    deck("geography", [
      card("compassQuiz", "RIVERS", "cq-r1"),
      card("compassQuiz", "RIVERS", "cq-r2"),
      card("trueFalseDuel", "RIVERS", "tf-r"),
      card("compassQuiz", "MOUNTAINS", "cq-m"),
    ]),
  ];
  const plan = buildRecapPlan(decks, "geography");

  it("returns null for an empty plan", () => {
    const empty = buildRecapPlan([], "geography");
    expect(legAt(empty, 0)).toBeNull();
  });

  it("returns null for a negative index", () => {
    expect(legAt(plan, -1)).toBeNull();
  });

  it("returns null for an index past the end", () => {
    expect(legAt(plan, plan.cards.length)).toBeNull();
    expect(legAt(plan, plan.cards.length + 5)).toBeNull();
  });

  it("resolves index 0 to the first leg at offset 0", () => {
    const result = legAt(plan, 0);
    expect(result?.legIndex).toBe(0);
    expect(result?.offsetInLeg).toBe(0);
  });

  it("resolves a mid-leg index to the right offset", () => {
    const result = legAt(plan, 1);
    expect(result?.legIndex).toBe(0);
    expect(result?.offsetInLeg).toBe(1);
  });

  it("resolves an index exactly on a leg boundary to the next leg at offset 0", () => {
    // Leg 0 (compassQuiz/RIVERS) has 2 cards, so index 2 is the first card of leg 1.
    const result = legAt(plan, 2);
    expect(result?.legIndex).toBe(1);
    expect(result?.offsetInLeg).toBe(0);
  });

  it("resolves the last index to the last leg", () => {
    const result = legAt(plan, plan.cards.length - 1);
    expect(result?.legIndex).toBe(plan.legs.length - 1);
  });
});

describe("resumeIndex", () => {
  const decks = [
    deck("geography", [
      card("compassQuiz", "RIVERS", "cq-r1"),
      card("compassQuiz", "RIVERS", "cq-r2"),
      card("trueFalseDuel", "RIVERS", "tf-r"),
    ]),
  ];
  const plan: RecapPlan = buildRecapPlan(decks, "geography");

  it("returns 0 when the checkpoint is missing", () => {
    expect(resumeIndex(undefined, plan)).toBe(0);
  });

  it("returns 0 when total does not match the plan's card count", () => {
    const checkpoint: Checkpoint = { index: 1, total: plan.cards.length + 1, updatedAt: 0 };
    expect(resumeIndex(checkpoint, plan)).toBe(0);
  });

  it("returns 0 when the index is out of range even if total matches", () => {
    const checkpoint: Checkpoint = { index: plan.cards.length, total: plan.cards.length, updatedAt: 0 };
    expect(resumeIndex(checkpoint, plan)).toBe(0);
  });

  it("returns 0 when the index is negative", () => {
    const checkpoint: Checkpoint = { index: -1, total: plan.cards.length, updatedAt: 0 };
    expect(resumeIndex(checkpoint, plan)).toBe(0);
  });

  it("returns the stored index when it is valid", () => {
    const checkpoint: Checkpoint = { index: 2, total: plan.cards.length, updatedAt: 0 };
    expect(resumeIndex(checkpoint, plan)).toBe(2);
  });
});

describe("sanitiseCheckpoints", () => {
  it("drops malformed entries and keeps the good ones", () => {
    const raw = {
      geography: { index: 1, total: 3, updatedAt: 100 },
      history: { index: "1", total: 3, updatedAt: 100 },
      science: { index: 1, total: 3 },
      art: null,
      music: "not an object",
    };
    expect(sanitiseCheckpoints(raw)).toEqual({
      geography: { index: 1, total: 3, updatedAt: 100 },
    });
  });

  it("returns an empty object for non-object input", () => {
    expect(sanitiseCheckpoints(null)).toEqual({});
    expect(sanitiseCheckpoints(undefined)).toEqual({});
    expect(sanitiseCheckpoints("garbage")).toEqual({});
    expect(sanitiseCheckpoints(42)).toEqual({});
  });

  it("drops non-integer positions, which would index a leg's cards to undefined", () => {
    const raw = {
      geography: { index: 1.5, total: 3, updatedAt: 100 },
      history: { index: 1, total: 3.5, updatedAt: 100 },
      science: { index: Number.NaN, total: 3, updatedAt: 100 },
      art: { index: 1, total: 3, updatedAt: Number.NaN },
    };
    expect(sanitiseCheckpoints(raw)).toEqual({});
  });
});

describe("buildRecapPlan topic edge cases", () => {
  it("treats an empty-string topic as no topic rather than a group of its own", () => {
    const decks = [
      deck("geography", [
        card("compassQuiz", "", "blank"),
        card("compassQuiz", "RIVERS", "rivers"),
      ]),
    ];
    const plan = buildRecapPlan(decks, "geography");

    // RIVERS is the only real topic, so it leads; the blank-topic card falls
    // to the trailing untopiced leg instead of sorting ahead of it.
    expect(plan.legs.map((leg) => leg.topic)).toEqual(["RIVERS", undefined]);
    expect(plan.cards.map(tagOf)).toEqual(["rivers", "blank"]);
  });
});
