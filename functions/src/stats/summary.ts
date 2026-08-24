/** The fields clients may read from users/{uid}/stats/summary. */
export interface StatsSummary {
  totalCardsStudied: number;
  totalSessions: number;
  totalCorrect: number;
  totalWrong: number;
  overallAccuracy: number;
  cardsDueToday: number;
}

interface StatsInput {
  sessions: unknown[];
  progress: unknown[];
  now: number;
}

/** Accepts both Admin SDK Timestamps and plain millis for unit-test fixtures. */
function millis(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (
    value &&
    typeof value === "object" &&
    "toMillis" in value &&
    typeof value.toMillis === "function"
  ) {
    const result = value.toMillis();
    return typeof result === "number" && Number.isFinite(result) ? result : null;
  }
  return null;
}

function nonNegativeCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function completedSession(value: unknown): { correctCount: number; wrongCount: number } | null {
  if (!value || typeof value !== "object") return null;
  const session = value as Record<string, unknown>;
  if (millis(session.endedAt) === null) return null;
  return {
    correctCount: nonNegativeCount(session.correctCount),
    wrongCount: nonNegativeCount(session.wrongCount),
  };
}

function endOfUtcDay(now: number): number {
  const date = new Date(now);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1) - 1;
}

/**
 * Rebuilds stats from the two source collections instead of incrementing a
 * counter. Trigger delivery is at-least-once, so recomputation is the only
 * way retries and document deletes remain correct.
 */
export function summariseStats({ sessions, progress, now }: StatsInput): StatsSummary {
  const completed = sessions.map(completedSession).filter((session) => session !== null);
  const totalCorrect = completed.reduce((sum, session) => sum + session.correctCount, 0);
  const totalWrong = completed.reduce((sum, session) => sum + session.wrongCount, 0);
  const dueBy = endOfUtcDay(now);
  const dueDates = progress.map((record) =>
    record && typeof record === "object" ? millis((record as Record<string, unknown>).dueDate) : null,
  );

  return {
    totalCardsStudied: dueDates.filter((dueDate) => dueDate !== null).length,
    totalSessions: completed.length,
    totalCorrect,
    totalWrong,
    overallAccuracy: totalCorrect + totalWrong === 0 ? 0 : totalCorrect / (totalCorrect + totalWrong),
    cardsDueToday: dueDates.filter((dueDate) => dueDate !== null && dueDate <= dueBy).length,
  };
}

/** Makes the Admin write shape explicit while leaving its timestamp injectable for tests. */
export function buildStatsPayload<TimestampValue>(
  userId: string,
  summary: StatsSummary,
  updatedAt: TimestampValue,
) {
  return { userId, ...summary, updatedAt };
}
