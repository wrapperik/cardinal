import { describe, expect, it } from "vitest";

import {
  advanceRecap,
  buildRecapPlan,
  decodeCheckpointRecords,
  isCheckpoint,
  isRecapComplete,
  legAt,
  resumeIndex,
  runAt,
  sanitiseCheckpoints,
  shouldShowCheckpoint,
  type Checkpoint,
  type RecapPlan,
  type RecapState,
} from "./recap-rules";
import { emptyTally } from "../sessions/session-rules";
import type { ProgressRecord } from "@/features/progress/progress";
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

  it("puts due cards first while retaining topic and game grouping within each priority section", () => {
    const decks = [
      deck("geography", [
        card("matchRelease", "RIVERS", "future"),
        card("trueFalseDuel", "MOUNTAINS", "due-mountain"),
        card("compassQuiz", "RIVERS", "due-river"),
        card("compassQuiz", "RIVERS", "new"),
      ]),
    ];
    const [deckRecord] = decks;
    const progress: ProgressRecord[] = [
      {
        id: deckRecord.cards[0].cardId,
        deckId: deckRecord.id,
        easeFactor: 2.5,
        interval: 3,
        repetitions: 2,
        lapses: 0,
        dueDate: 2_001,
        lastReviewedAt: 0,
        lastQuality: 5,
      },
      {
        id: deckRecord.cards[1].cardId,
        deckId: deckRecord.id,
        easeFactor: 2.5,
        interval: 1,
        repetitions: 1,
        lapses: 0,
        dueDate: 2_000,
        lastReviewedAt: 0,
        lastQuality: 5,
      },
      {
        id: deckRecord.cards[2].cardId,
        deckId: deckRecord.id,
        easeFactor: 2.5,
        interval: 1,
        repetitions: 1,
        lapses: 0,
        dueDate: 1_999,
        lastReviewedAt: 0,
        lastQuality: 5,
      },
    ];

    const plan = buildRecapPlan(decks, "geography", progress, 2_000);

    expect(plan.cards.map(tagOf)).toEqual(["due-mountain", "due-river", "new", "future"]);
    expect(plan.cards.every((card) => card.deckId === deckRecord.id)).toBe(true);
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

describe("runAt", () => {
  it("returns null for an empty plan", () => {
    expect(runAt(buildRecapPlan([], "geography"), 0)).toBeNull();
  });

  it("returns null for a negative index", () => {
    const decks = [deck("geography", [card("compassQuiz", "RIVERS", "r1")])];
    const plan = buildRecapPlan(decks, "geography");
    expect(runAt(plan, -1)).toBeNull();
  });

  it("returns null for an index at or past the end", () => {
    const decks = [deck("geography", [card("compassQuiz", "RIVERS", "r1")])];
    const plan = buildRecapPlan(decks, "geography");
    expect(runAt(plan, plan.cards.length)).toBeNull();
    expect(runAt(plan, plan.cards.length + 5)).toBeNull();
  });

  it("returns the remaining cards of the run starting at index, not the whole run", () => {
    const decks = [
      deck("geography", [
        card("compassQuiz", "RIVERS", "cq1"),
        card("compassQuiz", "RIVERS", "cq2"),
        card("compassQuiz", "RIVERS", "cq3"),
      ]),
    ];
    const plan = buildRecapPlan(decks, "geography");
    const run = runAt(plan, 1);
    expect(run?.cards.map(tagOf)).toEqual(["cq2", "cq3"]);
  });

  it("sets start to the index passed in, not the run's own beginning", () => {
    const decks = [
      deck("geography", [
        card("compassQuiz", "RIVERS", "cq1"),
        card("compassQuiz", "RIVERS", "cq2"),
      ]),
    ];
    const plan = buildRecapPlan(decks, "geography");
    expect(runAt(plan, 1)?.start).toBe(1);
  });

  it("stops at the first gameType change", () => {
    const decks = [
      deck("geography", [
        card("compassQuiz", "RIVERS", "cq1"),
        card("trueFalseDuel", "RIVERS", "tf1"),
      ]),
    ];
    const plan = buildRecapPlan(decks, "geography");
    const run = runAt(plan, 0);
    expect(run?.gameType).toBe("compassQuiz");
    expect(run?.cards.map(tagOf)).toEqual(["cq1"]);
  });

  it("merges two consecutive same-gameType legs that straddle a topic boundary into one run", () => {
    const decks = [
      deck("geography", [
        // RIVERS carries only matchRelease, MOUNTAINS carries only
        // matchRelease too, so the two legs sit back to back in plan.cards
        // with nothing of a different gameType between them.
        card("matchRelease", "RIVERS", "mr-r"),
        card("matchRelease", "MOUNTAINS", "mr-m"),
      ]),
    ];
    const plan = buildRecapPlan(decks, "geography");
    expect(plan.legs).toHaveLength(2);

    const run = runAt(plan, 0);
    expect(run?.cards.map(tagOf)).toEqual(["mr-r", "mr-m"]);
  });
});

describe("advanceRecap", () => {
  const decks = [
    deck("geography", [
      card("compassQuiz", "RIVERS", "cq1"),
      card("trueFalseDuel", "RIVERS", "tf1"),
    ]),
  ];
  const plan = buildRecapPlan(decks, "geography");

  function state(index: number): RecapState {
    return {
      courseId: "geography",
      plan,
      index,
      sessionId: "session-1",
      tally: emptyTally(),
    };
  }

  it("does not mutate the state passed in", () => {
    const before = state(0);
    const snapshot = { ...before, tally: { ...before.tally } };
    advanceRecap(before, "correct");
    expect(before).toEqual(snapshot);
  });

  it("tallies against the card just answered, not the one the index moves to", () => {
    const next = advanceRecap(state(0), "correct");
    // Index 0 is the compassQuiz card — a tally against trueFalseDuel would
    // mean the wrong card got credited.
    expect(next.tally.gameTypesPlayed).toEqual(["compassQuiz"]);
    expect(next.tally.correctCount).toBe(1);
  });

  it("steps the index by one", () => {
    expect(advanceRecap(state(0), "correct").index).toBe(1);
  });

  it("a passed result still steps the index", () => {
    const next = advanceRecap(state(0), "passed");
    expect(next.index).toBe(1);
    expect(next.tally.passedCount).toBe(1);
  });

  it("returns the state unchanged when already complete", () => {
    const complete = state(plan.cards.length);
    expect(advanceRecap(complete, "correct")).toBe(complete);
  });
});

describe("isRecapComplete", () => {
  const decks = [
    deck("geography", [
      card("compassQuiz", "RIVERS", "cq1"),
      card("compassQuiz", "RIVERS", "cq2"),
    ]),
  ];
  const plan = buildRecapPlan(decks, "geography");

  it("is false mid-plan", () => {
    const state: RecapState = { courseId: "geography", plan, index: 1, sessionId: "s", tally: emptyTally() };
    expect(isRecapComplete(state)).toBe(false);
  });

  it("is true once the index reaches the end", () => {
    const state: RecapState = {
      courseId: "geography",
      plan,
      index: plan.cards.length,
      sessionId: "s",
      tally: emptyTally(),
    };
    expect(isRecapComplete(state)).toBe(true);
  });
});

describe("shouldShowCheckpoint", () => {
  it("pauses after every ten answered cards, but never after the final card", () => {
    expect(shouldShowCheckpoint(0, 40)).toBe(false);
    expect(shouldShowCheckpoint(9, 40)).toBe(false);
    expect(shouldShowCheckpoint(10, 40)).toBe(true);
    expect(shouldShowCheckpoint(20, 40)).toBe(true);
    expect(shouldShowCheckpoint(40, 40)).toBe(false);
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

  it("drops positions outside a non-empty queue", () => {
    const raw = {
      negativeIndex: { index: -1, total: 3, updatedAt: 100 },
      emptyQueue: { index: 0, total: 0, updatedAt: 100 },
      terminalIndex: { index: 3, total: 3, updatedAt: 100 },
      valid: { index: 2, total: 3, updatedAt: 100 },
    };

    expect(sanitiseCheckpoints(raw)).toEqual({
      valid: { index: 2, total: 3, updatedAt: 100 },
    });
    expect(isCheckpoint(raw.valid)).toBe(true);
  });
});

describe("decodeCheckpointRecords", () => {
  it("converts a legacy checkpoint map into valid id-bearing records", () => {
    expect(
      decodeCheckpointRecords({
        geography: { index: 1, total: 3, updatedAt: 100 },
        history: { index: 3, total: 3, updatedAt: 100 },
        art: { index: 1, total: "3", updatedAt: 100 },
      }),
    ).toEqual([
      { id: "geography", index: 1, total: 3, updatedAt: 100 },
    ]);
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
