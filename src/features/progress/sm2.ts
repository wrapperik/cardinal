import type { AnswerResult, RecallQuality } from "@/types/cardinal";

export const DAY_MS = 24 * 60 * 60 * 1000;
const INITIAL_EASE_FACTOR = 2.5;
const MINIMUM_EASE_FACTOR = 1.3;

/** The scheduling fields shared by a local progress record and the SM-2 rule. */
export interface Sm2State {
  easeFactor: number;
  interval: number;
  repetitions: number;
  lapses: number;
}

export interface Sm2Review extends Sm2State {
  dueDate: number;
  lastReviewedAt: number;
  lastQuality: RecallQuality;
}

/** Game verdicts intentionally collapse to the three SM-2 grades Cardinal can observe. */
export function recallQualityFor(result: AnswerResult): RecallQuality {
  switch (result) {
    case "passed":
      return 0;
    case "incorrect":
      return 2;
    case "correct":
      return 5;
  }
}

/**
 * Applies one answer to an SM-2 schedule. A failed review returns the card to
 * a one-day interval; successful reviews use the standard 1-day, 6-day, then
 * ease-factor progression.
 */
export function scheduleReview(
  previous: Sm2State | undefined,
  quality: RecallQuality,
  reviewedAt: number,
): Sm2Review {
  const prior = previous ?? {
    easeFactor: INITIAL_EASE_FACTOR,
    interval: 0,
    repetitions: 0,
    lapses: 0,
  };
  const distance = 5 - quality;
  const easeFactor = Math.max(
    MINIMUM_EASE_FACTOR,
    prior.easeFactor + (0.1 - distance * (0.08 + distance * 0.02)),
  );

  if (quality < 3) {
    return {
      easeFactor,
      interval: 1,
      repetitions: 0,
      lapses: prior.lapses + 1,
      dueDate: reviewedAt + DAY_MS,
      lastReviewedAt: reviewedAt,
      lastQuality: quality,
    };
  }

  const repetitions = prior.repetitions + 1;
  const interval = repetitions === 1
    ? 1
    : repetitions === 2
      ? 6
      : Math.max(1, Math.round(prior.interval * prior.easeFactor));

  return {
    easeFactor,
    interval,
    repetitions,
    lapses: prior.lapses,
    dueDate: reviewedAt + interval * DAY_MS,
    lastReviewedAt: reviewedAt,
    lastQuality: quality,
  };
}
