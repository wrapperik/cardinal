import { describe, expect, it } from "vitest";

import {
  formatCount,
  formatGeneratedAt,
  formatPercent,
  formatRelativeTime,
} from "./dashboard-format";

describe("formatPercent", () => {
  it("rounds a 0..1 fraction to a whole-number percent", () => {
    expect(formatPercent(0.75)).toBe("75%");
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(1)).toBe("100%");
    expect(formatPercent(0.005)).toBe("1%");
  });
});

describe("formatCount", () => {
  it("thousands-separates a count", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(1204)).toBe("1,204");
    expect(formatCount(1_000_000)).toBe("1,000,000");
  });
});

const NOW = 1_700_000_000_000;

describe("formatRelativeTime", () => {
  it("reads JUST NOW under a minute", () => {
    expect(formatRelativeTime(NOW, NOW)).toBe("JUST NOW");
    expect(formatRelativeTime(NOW - 59_000, NOW)).toBe("JUST NOW");
  });

  it("reads in minutes from a minute up to an hour", () => {
    expect(formatRelativeTime(NOW - 60_000, NOW)).toBe("1M AGO");
    expect(formatRelativeTime(NOW - 5 * 60_000, NOW)).toBe("5M AGO");
    expect(formatRelativeTime(NOW - 59 * 60_000, NOW)).toBe("59M AGO");
  });

  it("reads in hours from an hour up to a day", () => {
    expect(formatRelativeTime(NOW - 60 * 60_000, NOW)).toBe("1H AGO");
    expect(formatRelativeTime(NOW - 3 * 60 * 60_000, NOW)).toBe("3H AGO");
    expect(formatRelativeTime(NOW - 23 * 60 * 60_000, NOW)).toBe("23H AGO");
  });

  it("reads in days from a day up to a week", () => {
    expect(formatRelativeTime(NOW - 24 * 60 * 60_000, NOW)).toBe("1D AGO");
    expect(formatRelativeTime(NOW - 2 * 24 * 60 * 60_000, NOW)).toBe("2D AGO");
    expect(formatRelativeTime(NOW - 6 * 24 * 60 * 60_000, NOW)).toBe("6D AGO");
  });

  it("falls back to an absolute date at a week and beyond", () => {
    const eightDaysAgo = NOW - 8 * 24 * 60 * 60_000;
    const result = formatRelativeTime(eightDaysAgo, NOW);
    expect(result).not.toMatch(/AGO$/);
    expect(result).toBe(result.toUpperCase());
  });

  it("treats a timestamp in the future as JUST NOW rather than negative", () => {
    expect(formatRelativeTime(NOW + 60_000, NOW)).toBe("JUST NOW");
  });
});

describe("formatGeneratedAt", () => {
  it("prefixes the relative time with AS OF", () => {
    expect(formatGeneratedAt(NOW, NOW)).toBe("AS OF JUST NOW");
    expect(formatGeneratedAt(NOW - 5 * 60_000, NOW)).toBe("AS OF 5M AGO");
  });
});
