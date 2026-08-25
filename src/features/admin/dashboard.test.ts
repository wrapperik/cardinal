import { describe, expect, it, vi } from "vitest";

import { EMPTY_DASHBOARD, parseDashboard, type DashboardSnapshot } from "./dashboard";

vi.mock("firebase/functions", () => ({ httpsCallable: vi.fn() }));
vi.mock("@/lib/firebase", () => ({ functions: {} }));

const VALID_PAYLOAD: DashboardSnapshot = {
  generatedAt: 1_700_000_000_000,
  users: { total: 120, newLast7Days: 5, newLast30Days: 18, activeLast7Days: 40, admins: 2, longestStreak: 61 },
  content: { courses: 30, decks: 90, cards: 4200, uploads: 95 },
  study: { sessions: 800, cardsStudied: 15000, correct: 11000, wrong: 4000, accuracy: 0.73, cardsDueToday: 300 },
  uploads: { processing: 3, done: 88, failed: 4, failureRate: 0.04, stuck: 1 },
  alerts: [
    { id: "a1", label: "UPLOAD BACKLOG", detail: "3 UPLOADS STUCK", severity: "warning", count: 3 },
    { id: "a2", label: "FAILURE SPIKE", detail: "FAILURE RATE OVER 20%", severity: "critical", count: 5 },
  ],
  activity: [{ id: "e1", kind: "upload", label: "NEW UPLOAD", at: 1_700_000_000_000 }],
  truncated: false,
};

describe("parseDashboard", () => {
  it("round-trips a full valid payload", () => {
    expect(parseDashboard(VALID_PAYLOAD)).toEqual(VALID_PAYLOAD);
  });

  it("rejects a payload missing a whole top-level section rather than defaulting it to zero", () => {
    const { users, ...withoutUsers } = VALID_PAYLOAD;
    expect(parseDashboard(withoutUsers)).toBeNull();

    const { uploads, ...withoutUploads } = VALID_PAYLOAD;
    expect(parseDashboard(withoutUploads)).toBeNull();
  });

  it("rejects negative, NaN, or out-of-range numbers anywhere in the figures", () => {
    expect(parseDashboard({ ...VALID_PAYLOAD, generatedAt: -1 })).toBeNull();
    expect(
      parseDashboard({ ...VALID_PAYLOAD, users: { ...VALID_PAYLOAD.users, total: NaN } }),
    ).toBeNull();
    expect(
      parseDashboard({ ...VALID_PAYLOAD, study: { ...VALID_PAYLOAD.study, accuracy: 1.5 } }),
    ).toBeNull();
    expect(
      parseDashboard({ ...VALID_PAYLOAD, uploads: { ...VALID_PAYLOAD.uploads, failureRate: -0.1 } }),
    ).toBeNull();
  });

  it("drops malformed alert and activity entries without voiding the rest of the snapshot", () => {
    const result = parseDashboard({
      ...VALID_PAYLOAD,
      alerts: [VALID_PAYLOAD.alerts[0], { id: "bad", severity: "unknown" }, { not: "an alert" }],
      activity: [VALID_PAYLOAD.activity[0], { id: "bad", kind: "unknown", label: "X", at: 1 }, null],
    });
    expect(result).not.toBeNull();
    expect(result?.alerts).toEqual([VALID_PAYLOAD.alerts[0]]);
    expect(result?.activity).toEqual([VALID_PAYLOAD.activity[0]]);
    expect(result?.users).toEqual(VALID_PAYLOAD.users);
  });

  it("rejects non-array alerts/activity and non-object input", () => {
    expect(parseDashboard({ ...VALID_PAYLOAD, alerts: "not an array" })).toBeNull();
    expect(parseDashboard(null)).toBeNull();
    expect(parseDashboard("nope")).toBeNull();
  });
});

describe("EMPTY_DASHBOARD", () => {
  it("is all zeroes with empty lists", () => {
    expect(EMPTY_DASHBOARD).toEqual({
      generatedAt: 0,
      users: { total: 0, newLast7Days: 0, newLast30Days: 0, activeLast7Days: 0, admins: 0, longestStreak: 0 },
      content: { courses: 0, decks: 0, cards: 0, uploads: 0 },
      study: { sessions: 0, cardsStudied: 0, correct: 0, wrong: 0, accuracy: 0, cardsDueToday: 0 },
      uploads: { processing: 0, done: 0, failed: 0, failureRate: 0, stuck: 0 },
      alerts: [],
      activity: [],
      truncated: false,
    });
  });
});
