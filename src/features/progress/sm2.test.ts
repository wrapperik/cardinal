import { describe, expect, it } from "vitest";

import { DAY_MS, recallQualityFor, scheduleReview } from "./sm2";

describe("recallQualityFor", () => {
  it("maps every game result to its fixed SM-2 grade", () => {
    expect(recallQualityFor("passed")).toBe(0);
    expect(recallQualityFor("incorrect")).toBe(2);
    expect(recallQualityFor("correct")).toBe(5);
  });
});

describe("scheduleReview", () => {
  it("starts a correctly recalled card at the one-day interval", () => {
    expect(scheduleReview(undefined, 5, 1_000)).toEqual({
      easeFactor: 2.6,
      interval: 1,
      repetitions: 1,
      lapses: 0,
      dueDate: 1_000 + DAY_MS,
      lastReviewedAt: 1_000,
      lastQuality: 5,
    });
  });

  it("uses the six-day second successful interval before applying ease", () => {
    const first = scheduleReview(undefined, 5, 0);
    const second = scheduleReview(first, 5, DAY_MS);

    expect(second).toMatchObject({ interval: 6, repetitions: 2, lapses: 0, lastQuality: 5 });
    expect(second.dueDate).toBe(7 * DAY_MS);
  });

  it("uses the prior ease factor for later intervals", () => {
    const third = scheduleReview(
      { easeFactor: 2.7, interval: 6, repetitions: 2, lapses: 0 },
      5,
      0,
    );

    expect(third.interval).toBe(16);
    expect(third.easeFactor).toBeCloseTo(2.8);
  });

  it("resets repetitions and increments lapses after an unsuccessful review", () => {
    const failed = scheduleReview(
      { easeFactor: 2.5, interval: 12, repetitions: 4, lapses: 2 },
      2,
      500,
    );

    expect(failed).toMatchObject({
      interval: 1,
      repetitions: 0,
      lapses: 3,
      dueDate: 500 + DAY_MS,
      lastReviewedAt: 500,
      lastQuality: 2,
    });
    expect(failed.easeFactor).toBeCloseTo(2.18);
  });

  it("never lets the ease factor fall below SM-2's floor", () => {
    const failed = scheduleReview(
      { easeFactor: 1.3, interval: 1, repetitions: 0, lapses: 0 },
      0,
      0,
    );

    expect(failed.easeFactor).toBe(1.3);
  });
});
