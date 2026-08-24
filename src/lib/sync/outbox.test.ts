import { describe, expect, it } from "vitest";

import { applyFailure, backoffMs, classifyFailure, dropChildrenOf, enqueue, nextToDrain } from "./outbox";
import type { OutboxOp } from "./types";

function setOp(docId: string, payload: Record<string, unknown>, createdAt = 0): Extract<OutboxOp, { kind: "set" }> {
  return {
    opId: `op-${docId}-${createdAt}`,
    collection: "courses",
    docId,
    kind: "set",
    payload,
    attempts: 0,
    nextAttemptAt: createdAt,
    createdAt,
  };
}

function deleteOp(docId: string, createdAt = 0): Extract<OutboxOp, { kind: "delete" }> {
  return {
    opId: `op-${docId}-${createdAt}-delete`,
    collection: "courses",
    docId,
    kind: "delete",
    payload: null,
    attempts: 0,
    nextAttemptAt: createdAt,
    createdAt,
  };
}

describe("enqueue", () => {
  it("appends an op for a doc that has nothing pending yet", () => {
    const queue = enqueue([], setOp("geography", { title: "GEOGRAPHY" }));
    expect(queue).toHaveLength(1);
    expect(queue[0].docId).toBe("geography");
  });

  it("collapses repeated set ops on the same doc to just the latest payload", () => {
    let queue = enqueue([], setOp("geography", { title: "GEOGRAPHY" }, 0));
    queue = enqueue(queue, setOp("geography", { title: "GEOGRAPHY 2" }, 1));
    expect(queue).toHaveLength(1);
    expect(queue[0].payload).toEqual({ title: "GEOGRAPHY 2" });
  });

  it("collapses any op followed by a delete on the same doc to just the delete", () => {
    let queue = enqueue([], setOp("geography", { title: "GEOGRAPHY" }, 0));
    queue = enqueue(queue, deleteOp("geography", 1));
    expect(queue).toHaveLength(1);
    expect(queue[0].kind).toBe("delete");
  });

  it("does not collapse a set that follows a delete — it stays as its own set, a resurrection", () => {
    let queue = enqueue([], deleteOp("geography", 0));
    queue = enqueue(queue, setOp("geography", { title: "GEOGRAPHY" }, 1));
    expect(queue).toHaveLength(2);
    expect(queue[0].kind).toBe("delete");
    expect(queue[1].kind).toBe("set");
  });

  it("drops a second delete queued behind an already-pending delete for the same doc", () => {
    let queue = enqueue([], deleteOp("geography", 0));
    queue = enqueue(queue, deleteOp("geography", 1));
    expect(queue).toHaveLength(1);
  });

  it("keeps a collapsed doc's original queue position relative to another doc's op", () => {
    let queue = enqueue([], setOp("geography", { title: "GEOGRAPHY" }, 0));
    queue = enqueue(queue, setOp("history", { title: "HISTORY" }, 1));
    queue = enqueue(queue, setOp("geography", { title: "GEOGRAPHY 2" }, 2));
    expect(queue.map((op) => op.docId)).toEqual(["geography", "history"]);
  });
});

describe("dropChildrenOf", () => {
  it("removes every op naming the given id as its parent", () => {
    const parent = setOp("deck-1", { title: "DECK" });
    const child1 = { ...setOp("card-1", { gameType: "compassQuiz" }), parentOpId: parent.opId };
    const child2 = { ...setOp("card-2", { gameType: "compassQuiz" }), parentOpId: parent.opId };
    const queue = [parent, child1, child2];

    expect(dropChildrenOf(queue, parent.opId)).toEqual([parent]);
  });

  it("leaves an unrelated op's siblings alone — only ops naming THIS parent are dropped", () => {
    const deckA = setOp("deck-a", {});
    const deckB = setOp("deck-b", {});
    const cardOfA = { ...setOp("card-a1", {}), parentOpId: deckA.opId };
    const cardOfB = { ...setOp("card-b1", {}), parentOpId: deckB.opId };
    const queue = [deckA, deckB, cardOfA, cardOfB];

    expect(dropChildrenOf(queue, deckA.opId)).toEqual([deckA, deckB, cardOfB]);
  });

  it("is a no-op when nothing in the queue names the given parent", () => {
    const queue = [setOp("geography", {})];
    expect(dropChildrenOf(queue, "op-does-not-exist")).toEqual(queue);
  });
});

describe("classifyFailure", () => {
  it("treats permission-denied as terminal — retrying a rules rejection never helps", () => {
    expect(classifyFailure({ code: "permission-denied" })).toBe("terminal");
  });

  it("treats unavailable as retryable", () => {
    expect(classifyFailure({ code: "unavailable" })).toBe("retryable");
  });

  it("treats unauthenticated as retryable — an expired token is worth another attempt once the user is signed back in, unlike a rules rejection where retrying reproduces the exact same denial", () => {
    expect(classifyFailure({ code: "unauthenticated" })).toBe("retryable");
  });

  it("treats deadline-exceeded as retryable", () => {
    expect(classifyFailure({ code: "deadline-exceeded" })).toBe("retryable");
  });

  it("defaults an unrecognised or missing code to retryable rather than silently dropping the op", () => {
    expect(classifyFailure({ code: "some-future-code" })).toBe("retryable");
    expect(classifyFailure(new Error("boom"))).toBe("retryable");
    expect(classifyFailure(null)).toBe("retryable");
  });
});

describe("backoffMs", () => {
  it("waits 1s, 2s, 4s, doubling each attempt", () => {
    expect(backoffMs(1)).toBe(1000);
    expect(backoffMs(2)).toBe(2000);
    expect(backoffMs(3)).toBe(4000);
  });

  it("caps at 60s", () => {
    expect(backoffMs(10)).toBe(60000);
    expect(backoffMs(100)).toBe(60000);
  });
});

describe("applyFailure", () => {
  it("drops a terminal failure rather than returning a requeued op", () => {
    const outcome = applyFailure(setOp("geography", {}), { code: "permission-denied" }, 0);
    expect(outcome.class).toBe("terminal");
    expect(outcome.op).toBeUndefined();
  });

  it("bumps attempts and schedules the next try on a retryable failure", () => {
    const op = setOp("geography", {});
    const outcome = applyFailure(op, { code: "unavailable" }, 1000);
    expect(outcome.class).toBe("retryable");
    expect(outcome.op?.attempts).toBe(1);
    expect(outcome.op?.nextAttemptAt).toBe(1000 + backoffMs(1));
  });

  it("does not change the op's position or payload, only its retry state", () => {
    const op = setOp("geography", { title: "GEOGRAPHY" });
    const outcome = applyFailure(op, { code: "unavailable" }, 1000);
    expect(outcome.op?.payload).toEqual({ title: "GEOGRAPHY" });
    expect(outcome.op?.docId).toBe("geography");
  });
});

describe("nextToDrain", () => {
  it("returns null for an empty queue", () => {
    expect(nextToDrain([], 0)).toBeNull();
  });

  it("returns the head when it is due", () => {
    const op = setOp("geography", {}, 0);
    expect(nextToDrain([op], 1000)).toBe(op);
  });

  it("returns null when the head is still backing off, even though the queue is non-empty", () => {
    const op = { ...setOp("geography", {}, 0), nextAttemptAt: 5000 };
    expect(nextToDrain([op], 1000)).toBeNull();
  });
});
