/**
 * Pure formatting helpers for the admin dashboard. No React or Firebase
 * imports on purpose, same reasoning as score.ts and status-messages.ts —
 * exercised directly by vitest, with no mocks needed. Every function returns
 * UPPERCASE, matching the rest of the app's rendered copy.
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const RELATIVE_CUTOFF_MS = 7 * DAY_MS;

/** 0–1 → a rounded whole-number percent, matching pct() in src/app/progress.tsx. */
export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/** Thousands-separated count, e.g. "1,204". */
export function formatCount(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

/**
 * "JUST NOW" under a minute, then a coarse "5M AGO" / "3H AGO" / "2D AGO"
 * bucket, then an absolute date past a week — a "14D AGO" line stops being
 * more useful than a real date and only invites the reader to do the
 * subtraction themselves. `now` is a parameter rather than read from
 * `Date.now()` internally so every boundary here is testable without faking
 * the system clock.
 */
export function formatRelativeTime(at: number, now: number): string {
  const elapsed = Math.max(0, now - at);

  if (elapsed < MINUTE_MS) return "JUST NOW";
  if (elapsed < HOUR_MS) return `${Math.floor(elapsed / MINUTE_MS)}M AGO`;
  if (elapsed < DAY_MS) return `${Math.floor(elapsed / HOUR_MS)}H AGO`;
  if (elapsed < RELATIVE_CUTOFF_MS) return `${Math.floor(elapsed / DAY_MS)}D AGO`;

  return new Date(at)
    .toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    .toUpperCase();
}

/** The "as of" line under the dashboard heading — same bucketing as formatRelativeTime, worded for a label rather than an activity row. */
export function formatGeneratedAt(at: number, now: number): string {
  return `AS OF ${formatRelativeTime(at, now)}`;
}
