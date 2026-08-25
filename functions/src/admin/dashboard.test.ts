import { describe, expect, it } from "vitest";

import { READ_LIMIT, STUCK_UPLOAD_MINUTES, summariseDashboard, type DashboardInput } from "./dashboard";

const NOW = Date.UTC(2026, 7, 25, 12);
const DAY = 24 * 60 * 60 * 1000;
const STUCK_THRESHOLD_MS = STUCK_UPLOAD_MINUTES * 60 * 1000;

function baseInput(overrides: Partial<DashboardInput> = {}): DashboardInput {
  return {
    users: [],
    statsSummaries: [],
    decks: [],
    uploads: [],
    coursesCount: 0,
    now: NOW,
    ...overrides,
  };
}

function user(overrides: Record<string, unknown> = {}) {
  return {
    userId: "user-1",
    displayName: "Riku",
    createdAt: NOW,
    lastStudiedDate: null,
    longestStreak: 0,
    role: "student",
    ...overrides,
  };
}

function upload(overrides: Record<string, unknown> = {}) {
  return {
    uploadId: "u1",
    fileName: "notes.pdf",
    status: "processing",
    createdAt: NOW,
    completedAt: null,
    ...overrides,
  };
}

describe("summariseDashboard", () => {
  it("produces an all-zero snapshot with no alerts from empty inputs", () => {
    expect(summariseDashboard(baseInput())).toEqual({
      generatedAt: NOW,
      users: { total: 0, newLast7Days: 0, newLast30Days: 0, activeLast7Days: 0, admins: 0, longestStreak: 0 },
      content: { courses: 0, decks: 0, cards: 0, uploads: 0 },
      study: { sessions: 0, cardsStudied: 0, correct: 0, wrong: 0, accuracy: 0, cardsDueToday: 0 },
      uploads: { processing: 0, done: 0, failed: 0, failureRate: 0, stuck: 0 },
      alerts: [],
      activity: [],
      truncated: false,
    });
  });

  it("returns zero accuracy and zero failure rate instead of dividing by zero", () => {
    const snapshot = summariseDashboard(
      baseInput({
        statsSummaries: [{ totalSessions: 0, totalCardsStudied: 0, totalCorrect: 0, totalWrong: 0, cardsDueToday: 0 }],
        uploads: [upload({ status: "processing" })],
      }),
    );
    expect(snapshot.study.accuracy).toBe(0);
    expect(snapshot.uploads.failureRate).toBe(0);
  });

  it("sums study totals across per-user stats/summary documents", () => {
    const snapshot = summariseDashboard(
      baseInput({
        statsSummaries: [
          { totalSessions: 2, totalCardsStudied: 10, totalCorrect: 8, totalWrong: 2, cardsDueToday: 3 },
          { totalSessions: 1, totalCardsStudied: 5, totalCorrect: 2, totalWrong: 3, cardsDueToday: 1 },
        ],
      }),
    );
    expect(snapshot.study).toEqual({
      sessions: 3,
      cardsStudied: 15,
      correct: 10,
      wrong: 5,
      accuracy: 10 / 15,
      cardsDueToday: 4,
    });
  });

  it("sums deck cardCount for the content total instead of touching the cards subcollection", () => {
    const snapshot = summariseDashboard(
      baseInput({ decks: [{ cardCount: 12 }, { cardCount: 8 }] }),
    );
    expect(snapshot.content).toEqual({ courses: 0, decks: 2, cards: 20, uploads: 0 });
  });

  it("passes the aggregated course count straight through", () => {
    expect(summariseDashboard(baseInput({ coursesCount: 42 })).content.courses).toBe(42);
  });

  describe("signup and activity windows", () => {
    it("counts a signup exactly 7 days old as new, and one millisecond older as not", () => {
      const atBoundary = summariseDashboard(baseInput({ users: [user({ createdAt: NOW - 7 * DAY })] }));
      expect(atBoundary.users.newLast7Days).toBe(1);

      const pastBoundary = summariseDashboard(baseInput({ users: [user({ createdAt: NOW - 7 * DAY - 1 })] }));
      expect(pastBoundary.users.newLast7Days).toBe(0);
    });

    it("counts a signup exactly 30 days old as new, and one millisecond older as not", () => {
      const atBoundary = summariseDashboard(baseInput({ users: [user({ createdAt: NOW - 30 * DAY })] }));
      expect(atBoundary.users.newLast30Days).toBe(1);

      const pastBoundary = summariseDashboard(baseInput({ users: [user({ createdAt: NOW - 30 * DAY - 1 })] }));
      expect(pastBoundary.users.newLast30Days).toBe(0);
    });

    it("counts a user who last studied exactly 7 days ago as active, and one millisecond earlier as not", () => {
      const atBoundary = summariseDashboard(baseInput({ users: [user({ lastStudiedDate: NOW - 7 * DAY })] }));
      expect(atBoundary.users.activeLast7Days).toBe(1);

      const pastBoundary = summariseDashboard(
        baseInput({ users: [user({ lastStudiedDate: NOW - 7 * DAY - 1 })] }),
      );
      expect(pastBoundary.users.activeLast7Days).toBe(0);
    });

    it("never counts a user who has never studied as active", () => {
      expect(summariseDashboard(baseInput({ users: [user({ lastStudiedDate: null })] })).users.activeLast7Days).toBe(
        0,
      );
    });

    it("counts mirrored admins and the highest streak across users", () => {
      const snapshot = summariseDashboard(
        baseInput({
          users: [
            user({ userId: "a", role: "admin", longestStreak: 4 }),
            user({ userId: "b", role: "student", longestStreak: 12 }),
            user({ userId: "c", role: "admin", longestStreak: 1 }),
          ],
        }),
      );
      expect(snapshot.users.admins).toBe(2);
      expect(snapshot.users.longestStreak).toBe(12);
    });
  });

  describe("uploads", () => {
    it("flags a job still processing past the stuck threshold, but not one that just reaches it", () => {
      const stuck = summariseDashboard(baseInput({ uploads: [upload({ createdAt: NOW - STUCK_THRESHOLD_MS - 1 })] }));
      expect(stuck.uploads.stuck).toBe(1);

      const notYetStuck = summariseDashboard(baseInput({ uploads: [upload({ createdAt: NOW - STUCK_THRESHOLD_MS })] }));
      expect(notYetStuck.uploads.stuck).toBe(0);
    });

    it("never marks a done or failed job as stuck regardless of age", () => {
      const snapshot = summariseDashboard(
        baseInput({
          uploads: [
            upload({ status: "done", createdAt: NOW - STUCK_THRESHOLD_MS * 10 }),
            upload({ status: "failed", createdAt: NOW - STUCK_THRESHOLD_MS * 10 }),
          ],
        }),
      );
      expect(snapshot.uploads.stuck).toBe(0);
    });

    it("computes a failure rate over finished jobs only, excluding what is still processing", () => {
      const snapshot = summariseDashboard(
        baseInput({
          uploads: [
            upload({ uploadId: "u1", status: "done" }),
            upload({ uploadId: "u2", status: "done" }),
            upload({ uploadId: "u3", status: "failed" }),
            upload({ uploadId: "u4", status: "processing" }),
          ],
        }),
      );
      expect(snapshot.uploads).toEqual({ processing: 1, done: 2, failed: 1, failureRate: 1 / 3, stuck: 0 });
    });
  });

  describe("alerts", () => {
    it("suppresses every alert when nothing is wrong", () => {
      expect(summariseDashboard(baseInput({ uploads: [upload({ status: "done" })] })).alerts).toEqual([]);
    });

    it("emits a critical alert once a job is stuck, and nothing when none is", () => {
      const stuck = summariseDashboard(baseInput({ uploads: [upload({ createdAt: NOW - STUCK_THRESHOLD_MS - 1 })] }));
      expect(stuck.alerts).toContainEqual(
        expect.objectContaining({ id: "stuck-uploads", severity: "critical", count: 1 }),
      );

      const notStuck = summariseDashboard(baseInput({ uploads: [upload({ createdAt: NOW })] }));
      expect(notStuck.alerts.some((alert) => alert.id === "stuck-uploads")).toBe(false);
    });

    it("emits a warning alert for any failed upload, and nothing when there are none", () => {
      const withFailure = summariseDashboard(baseInput({ uploads: [upload({ status: "failed" })] }));
      expect(withFailure.alerts).toContainEqual(
        expect.objectContaining({ id: "failed-uploads", severity: "warning", count: 1 }),
      );

      const withoutFailure = summariseDashboard(baseInput({ uploads: [upload({ status: "done" })] }));
      expect(withoutFailure.alerts.some((alert) => alert.id === "failed-uploads")).toBe(false);
    });

    it("only emits the high-failure-rate alert once both the rate and sample-size floors are cleared", () => {
      const tooFewFinished = summariseDashboard(
        baseInput({
          uploads: [upload({ uploadId: "u1", status: "failed" }), upload({ uploadId: "u2", status: "done" })],
        }),
      );
      expect(tooFewFinished.alerts.some((alert) => alert.id === "high-failure-rate")).toBe(false);

      const exactlyAtThreshold = summariseDashboard(
        baseInput({
          uploads: [
            upload({ uploadId: "u1", status: "failed" }),
            upload({ uploadId: "u2", status: "done" }),
            upload({ uploadId: "u3", status: "done" }),
            upload({ uploadId: "u4", status: "done" }),
          ],
        }),
      );
      expect(exactlyAtThreshold.uploads.failureRate).toBe(0.25);
      expect(exactlyAtThreshold.alerts.some((alert) => alert.id === "high-failure-rate")).toBe(false);

      const overThreshold = summariseDashboard(
        baseInput({
          uploads: [
            upload({ uploadId: "u1", status: "failed" }),
            upload({ uploadId: "u2", status: "failed" }),
            upload({ uploadId: "u3", status: "done" }),
            upload({ uploadId: "u4", status: "done" }),
          ],
        }),
      );
      expect(overThreshold.alerts).toContainEqual(
        expect.objectContaining({ id: "high-failure-rate", severity: "warning" }),
      );
    });
  });

  describe("activity", () => {
    it("mixes uploads and signups newest-first and caps the list at 8", () => {
      const uploads = Array.from({ length: 5 }, (_, i) =>
        upload({ uploadId: `u${i}`, fileName: `file-${i}.pdf`, status: "done", createdAt: NOW - i * 1000, completedAt: NOW - i * 1000 }),
      );
      const users = Array.from({ length: 5 }, (_, i) =>
        user({ userId: `user-${i}`, displayName: `Student ${i}`, createdAt: NOW - i * 1000 - 500 }),
      );

      const snapshot = summariseDashboard(baseInput({ uploads, users }));
      expect(snapshot.activity).toHaveLength(8);
      const timestamps = snapshot.activity.map((item) => item.at);
      expect(timestamps).toEqual([...timestamps].sort((a, b) => b - a));
    });

    it("labels upload activity with the outcome and the uppercased file name", () => {
      const snapshot = summariseDashboard(
        baseInput({ uploads: [upload({ fileName: "biology notes", status: "failed" })] }),
      );
      expect(snapshot.activity[0]).toMatchObject({ kind: "upload", label: "UPLOAD FAILED - BIOLOGY NOTES" });
    });

    it("labels signup activity with the display name", () => {
      const snapshot = summariseDashboard(baseInput({ users: [user({ displayName: "Riku" })] }));
      expect(snapshot.activity[0]).toMatchObject({ kind: "signup", label: "NEW SIGNUP - RIKU" });
    });

    it("never includes an email address anywhere in an activity label", () => {
      const snapshot = summariseDashboard(
        baseInput({ users: [user({ displayName: "Riku", email: "riku@example.com" })] }),
      );
      expect(JSON.stringify(snapshot.activity)).not.toContain("example.com");
    });
  });

  describe("truncated", () => {
    it("stays false while every bounded read comes back under its limit", () => {
      const snapshot = summariseDashboard(baseInput({ users: [user()], readLimit: 2 }));
      expect(snapshot.truncated).toBe(false);
    });

    it("flips true the moment any bounded read comes back at the limit", () => {
      const snapshot = summariseDashboard(
        baseInput({ users: [user({ userId: "a" }), user({ userId: "b" })], readLimit: 2 }),
      );
      expect(snapshot.truncated).toBe(true);
    });

    it("ignores coursesCount, since the aggregation query is never bounded by the read limit", () => {
      const snapshot = summariseDashboard(baseInput({ coursesCount: 999_999, readLimit: 2 }));
      expect(snapshot.truncated).toBe(false);
    });

    it("defaults to the real READ_LIMIT constant when the test override is absent", () => {
      const notTruncated = Array.from({ length: READ_LIMIT - 1 }, (_, i) => user({ userId: `u${i}` }));
      expect(summariseDashboard(baseInput({ users: notTruncated })).truncated).toBe(false);

      const truncated = Array.from({ length: READ_LIMIT }, (_, i) => user({ userId: `u${i}` }));
      expect(summariseDashboard(baseInput({ users: truncated })).truncated).toBe(true);
    });
  });

  describe("malformed documents", () => {
    it("degrades malformed counts and timestamps to zero instead of producing NaN", () => {
      const snapshot = summariseDashboard(
        baseInput({
          users: [{ userId: "a", createdAt: "not-a-date", longestStreak: "lots", role: 42 }],
          statsSummaries: [{ totalSessions: "two", totalCorrect: null, totalWrong: undefined }],
          decks: [{ cardCount: -5 }, { cardCount: "twelve" }],
          uploads: [{ uploadId: "u1", status: "unknown-status", createdAt: {} }],
        }),
      );

      expect(Number.isNaN(snapshot.study.accuracy)).toBe(false);
      expect(snapshot.content.cards).toBe(0);
      expect(snapshot.study.sessions).toBe(0);
      expect(snapshot.users.newLast7Days).toBe(0);
      expect(snapshot.users.admins).toBe(0);
      expect(snapshot.uploads).toEqual({ processing: 0, done: 0, failed: 0, failureRate: 0, stuck: 0 });
    });

    it("tolerates entirely non-object documents without throwing", () => {
      const snapshot = summariseDashboard(
        baseInput({ users: [null, "garbage", 42], decks: [null], uploads: [undefined] }),
      );
      expect(snapshot.users.total).toBe(3);
      expect(snapshot.content.cards).toBe(0);
      expect(snapshot.content.uploads).toBe(1);
    });
  });
});
