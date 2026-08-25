import { httpsCallable } from "firebase/functions";

import { functions } from "@/lib/firebase";

/**
 * These interfaces are deliberately duplicated from the Functions codebase
 * rather than imported: `functions/` is a separate TypeScript project with
 * its own tsconfig, and the client bundler cannot reach across that
 * boundary. `StatsSummary` already lives this way, duplicated between
 * `functions/src/stats/summary.ts` and `src/features/stats/stats.ts` — this
 * is the same tradeoff (two shapes to keep in sync by hand) accepted there
 * for the same reason.
 */
export interface DashboardAlert {
  id: string;
  label: string;
  detail: string;
  severity: "warning" | "critical";
  count: number;
}

export interface DashboardActivity {
  id: string;
  kind: "upload" | "signup";
  label: string;
  at: number;
}

export interface DashboardSnapshot {
  generatedAt: number;
  users: {
    total: number;
    newLast7Days: number;
    newLast30Days: number;
    activeLast7Days: number;
    admins: number;
    longestStreak: number;
  };
  content: { courses: number; decks: number; cards: number; uploads: number };
  study: {
    sessions: number;
    cardsStudied: number;
    correct: number;
    wrong: number;
    accuracy: number;
    cardsDueToday: number;
  };
  uploads: { processing: number; done: number; failed: number; failureRate: number; stuck: number };
  alerts: DashboardAlert[];
  activity: DashboardActivity[];
  truncated: boolean;
}

export const EMPTY_DASHBOARD: DashboardSnapshot = {
  generatedAt: 0,
  users: { total: 0, newLast7Days: 0, newLast30Days: 0, activeLast7Days: 0, admins: 0, longestStreak: 0 },
  content: { courses: 0, decks: 0, cards: 0, uploads: 0 },
  study: { sessions: 0, cardsStudied: 0, correct: 0, wrong: 0, accuracy: 0, cardsDueToday: 0 },
  uploads: { processing: 0, done: 0, failed: 0, failureRate: 0, stuck: 0 },
  alerts: [],
  activity: [],
  truncated: false,
};

function nonNegativeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

/** Like nonNegativeNumber, additionally bounded to a 0..1 fraction (accuracy, failureRate). */
function unitFraction(value: unknown): number | null {
  const n = nonNegativeNumber(value);
  return n === null || n > 1 ? null : n;
}

function parseUsers(value: unknown): DashboardSnapshot["users"] | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const total = nonNegativeNumber(data.total);
  const newLast7Days = nonNegativeNumber(data.newLast7Days);
  const newLast30Days = nonNegativeNumber(data.newLast30Days);
  const activeLast7Days = nonNegativeNumber(data.activeLast7Days);
  const admins = nonNegativeNumber(data.admins);
  const longestStreak = nonNegativeNumber(data.longestStreak);
  if (
    total === null ||
    newLast7Days === null ||
    newLast30Days === null ||
    activeLast7Days === null ||
    admins === null ||
    longestStreak === null
  ) {
    return null;
  }
  return { total, newLast7Days, newLast30Days, activeLast7Days, admins, longestStreak };
}

function parseContent(value: unknown): DashboardSnapshot["content"] | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const courses = nonNegativeNumber(data.courses);
  const decks = nonNegativeNumber(data.decks);
  const cards = nonNegativeNumber(data.cards);
  const uploads = nonNegativeNumber(data.uploads);
  if (courses === null || decks === null || cards === null || uploads === null) return null;
  return { courses, decks, cards, uploads };
}

function parseStudy(value: unknown): DashboardSnapshot["study"] | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const sessions = nonNegativeNumber(data.sessions);
  const cardsStudied = nonNegativeNumber(data.cardsStudied);
  const correct = nonNegativeNumber(data.correct);
  const wrong = nonNegativeNumber(data.wrong);
  const accuracy = unitFraction(data.accuracy);
  const cardsDueToday = nonNegativeNumber(data.cardsDueToday);
  if (
    sessions === null ||
    cardsStudied === null ||
    correct === null ||
    wrong === null ||
    accuracy === null ||
    cardsDueToday === null
  ) {
    return null;
  }
  return { sessions, cardsStudied, correct, wrong, accuracy, cardsDueToday };
}

function parseUploads(value: unknown): DashboardSnapshot["uploads"] | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const processing = nonNegativeNumber(data.processing);
  const done = nonNegativeNumber(data.done);
  const failed = nonNegativeNumber(data.failed);
  const failureRate = unitFraction(data.failureRate);
  const stuck = nonNegativeNumber(data.stuck);
  if (processing === null || done === null || failed === null || failureRate === null || stuck === null) {
    return null;
  }
  return { processing, done, failed, failureRate, stuck };
}

const ALERT_SEVERITIES = new Set(["warning", "critical"]);

function parseAlert(value: unknown): DashboardAlert | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const count = nonNegativeNumber(data.count);
  if (
    typeof data.id !== "string" ||
    typeof data.label !== "string" ||
    typeof data.detail !== "string" ||
    typeof data.severity !== "string" ||
    !ALERT_SEVERITIES.has(data.severity) ||
    count === null
  ) {
    return null;
  }
  return {
    id: data.id,
    label: data.label,
    detail: data.detail,
    severity: data.severity as DashboardAlert["severity"],
    count,
  };
}

const ACTIVITY_KINDS = new Set(["upload", "signup"]);

function parseActivity(value: unknown): DashboardActivity | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const at = nonNegativeNumber(data.at);
  if (
    typeof data.id !== "string" ||
    typeof data.kind !== "string" ||
    !ACTIVITY_KINDS.has(data.kind) ||
    typeof data.label !== "string" ||
    at === null
  ) {
    return null;
  }
  return { id: data.id, kind: data.kind as DashboardActivity["kind"], label: data.label, at };
}

/**
 * Defensive parse of the callable's response, in the spirit of
 * `statsFromFirestore`. The two array fields get different treatment than
 * everything else on purpose: a whole top-level section being absent
 * (`users`, `content`, `study`, `uploads`, or a malformed `generatedAt`)
 * fails the entire parse, because rendering zeroes in its place would be a
 * lie about the state of the system. But one bad row inside `alerts` or
 * `activity` is dropped rather than voiding the snapshot — those are lists
 * built by summing many independent records server-side, so one malformed
 * entry says nothing about the trustworthiness of the aggregate numbers
 * sitting next to it, and discarding the whole dashboard over a single bad
 * activity row would make the important figures unavailable for no reason.
 */
export function parseDashboard(value: unknown): DashboardSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;

  const generatedAt = nonNegativeNumber(data.generatedAt);
  const users = parseUsers(data.users);
  const content = parseContent(data.content);
  const study = parseStudy(data.study);
  const uploads = parseUploads(data.uploads);

  if (
    generatedAt === null ||
    users === null ||
    content === null ||
    study === null ||
    uploads === null ||
    typeof data.truncated !== "boolean" ||
    !Array.isArray(data.alerts) ||
    !Array.isArray(data.activity)
  ) {
    return null;
  }

  const alerts = data.alerts.map(parseAlert).filter((alert): alert is DashboardAlert => alert !== null);
  const activity = data.activity
    .map(parseActivity)
    .filter((entry): entry is DashboardActivity => entry !== null);

  return { generatedAt, users, content, study, uploads, alerts, activity, truncated: data.truncated };
}

/**
 * Throws rather than returning null on a bad parse: every caller of a
 * fetch-style function expects either a usable snapshot or an error to
 * handle, not a third "silently half-rendered" state that a screen could
 * forget to check for. `use-dashboard.ts` turns this into the "ready" vs.
 * "error" status the screen actually branches on.
 */
export async function fetchDashboard(): Promise<DashboardSnapshot> {
  const getDashboard = httpsCallable<Record<string, never>, unknown>(functions, "adminDashboard");
  const result = await getDashboard({});
  const snapshot = parseDashboard(result.data);
  if (!snapshot) throw new Error("DASHBOARD_UNAVAILABLE");
  return snapshot;
}
