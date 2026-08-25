import type { Firestore } from "firebase-admin/firestore";

/** Bounds every read below so a growing collection never turns this into an unbounded scan. */
export const READ_LIMIT = 500;

/** processUpload has its own timeout well inside this window, so a job still "processing" past it has died rather than merely being slow. */
export const STUCK_UPLOAD_MINUTES = 15;

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// A bare rate is noise from a handful of unlucky jobs; the sample floor is
// what keeps one failure out of two reading as a crisis.
const FAILURE_RATE_ALERT_THRESHOLD = 0.25;
const FAILURE_RATE_MIN_SAMPLE = 4;

export interface DashboardAlert {
  id: string; // stable key, e.g. "failed-uploads"
  label: string; // UPPERCASE, e.g. "FAILED UPLOADS"
  detail: string; // UPPERCASE short sentence
  severity: "warning" | "critical";
  count: number;
}

export interface DashboardActivity {
  id: string;
  kind: "upload" | "signup";
  label: string; // UPPERCASE, e.g. "UPLOAD FAILED - BIOLOGY NOTES"
  at: number; // epoch millis
}

export interface DashboardSnapshot {
  generatedAt: number;
  users: {
    total: number;
    newLast7Days: number;
    newLast30Days: number;
    activeLast7Days: number; // lastStudiedDate within 7 days
    admins: number; // users whose mirrored role is "admin"
    longestStreak: number; // the highest longestStreak across users
  };
  content: { courses: number; decks: number; cards: number; uploads: number };
  study: {
    sessions: number;
    cardsStudied: number;
    correct: number;
    wrong: number;
    accuracy: number; // 0..1, 0 when there is nothing to divide
    cardsDueToday: number;
  };
  uploads: {
    processing: number;
    done: number;
    failed: number;
    failureRate: number; // 0..1 over done+failed, 0 when neither
    stuck: number; // status "processing" older than STUCK_UPLOAD_MINUTES
  };
  alerts: DashboardAlert[];
  activity: DashboardActivity[]; // newest first, max 8
  truncated: boolean;
}

export interface DashboardInput {
  users: unknown[];
  statsSummaries: unknown[];
  decks: unknown[];
  uploads: unknown[];
  coursesCount: number;
  now: number;
  /** Only ever overridden by tests — readDashboard always leaves this at READ_LIMIT. */
  readLimit?: number;
}

/** Same technique as stats/summary.ts's millis(): accepts Admin Timestamps and plain millis so fixtures don't need the SDK. */
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/* -------------------------------------------------------------------------- */
/* users                                                                       */
/* -------------------------------------------------------------------------- */

interface UserAggregate {
  createdAtMs: number | null;
  lastStudiedMs: number | null;
  longestStreak: number;
  isAdmin: boolean;
}

function readUser(raw: unknown): UserAggregate {
  const user = asRecord(raw);
  return {
    createdAtMs: millis(user?.createdAt),
    lastStudiedMs: millis(user?.lastStudiedDate),
    longestStreak: nonNegativeCount(user?.longestStreak),
    // A missing role predates this feature and means exactly what the
    // create-rule default in firestore.rules already assumes: "student".
    isAdmin: user?.role === "admin",
  };
}

/* -------------------------------------------------------------------------- */
/* stats summaries                                                             */
/* -------------------------------------------------------------------------- */

interface StatsAggregate {
  sessions: number;
  cardsStudied: number;
  correct: number;
  wrong: number;
  cardsDueToday: number;
}

function readStats(raw: unknown): StatsAggregate {
  const stats = asRecord(raw);
  return {
    sessions: nonNegativeCount(stats?.totalSessions),
    cardsStudied: nonNegativeCount(stats?.totalCardsStudied),
    correct: nonNegativeCount(stats?.totalCorrect),
    wrong: nonNegativeCount(stats?.totalWrong),
    cardsDueToday: nonNegativeCount(stats?.cardsDueToday),
  };
}

/* -------------------------------------------------------------------------- */
/* uploads                                                                     */
/* -------------------------------------------------------------------------- */

type UploadStatusValue = "processing" | "done" | "failed" | null;

function readUploadStatus(value: unknown): UploadStatusValue {
  return value === "processing" || value === "done" || value === "failed" ? value : null;
}

function uploadActivityLabel(status: UploadStatusValue, fileName: string): string {
  const outcome = status === "failed" ? "UPLOAD FAILED" : status === "done" ? "UPLOAD COMPLETE" : "UPLOAD STARTED";
  return `${outcome} - ${fileName}`.toUpperCase();
}

/* -------------------------------------------------------------------------- */

/**
 * Pure aggregation over plain document data, split from readDashboard the
 * same way summariseStats is split from refreshUserStats. Every count
 * degrades to 0 (and every timestamp to "absent") rather than propagating a
 * malformed field into NaN, because these collections predate this feature
 * and were never validated against it.
 */
export function summariseDashboard(input: DashboardInput): DashboardSnapshot {
  const { now } = input;
  const readLimit = input.readLimit ?? READ_LIMIT;

  const truncated =
    input.users.length >= readLimit ||
    input.statsSummaries.length >= readLimit ||
    input.decks.length >= readLimit ||
    input.uploads.length >= readLimit;

  /* users ------------------------------------------------------------------ */

  let newLast7Days = 0;
  let newLast30Days = 0;
  let activeLast7Days = 0;
  let admins = 0;
  let longestStreak = 0;

  for (const raw of input.users) {
    const user = readUser(raw);
    if (user.createdAtMs !== null) {
      const age = now - user.createdAtMs;
      if (age <= SEVEN_DAYS_MS) newLast7Days += 1;
      if (age <= THIRTY_DAYS_MS) newLast30Days += 1;
    }
    if (user.lastStudiedMs !== null && now - user.lastStudiedMs <= SEVEN_DAYS_MS) {
      activeLast7Days += 1;
    }
    if (user.isAdmin) admins += 1;
    if (user.longestStreak > longestStreak) longestStreak = user.longestStreak;
  }

  /* content + study ---------------------------------------------------------- */

  const cards = input.decks.reduce((sum: number, raw) => sum + nonNegativeCount(asRecord(raw)?.cardCount), 0);

  const study = input.statsSummaries.map(readStats).reduce(
    (totals, entry) => ({
      sessions: totals.sessions + entry.sessions,
      cardsStudied: totals.cardsStudied + entry.cardsStudied,
      correct: totals.correct + entry.correct,
      wrong: totals.wrong + entry.wrong,
      cardsDueToday: totals.cardsDueToday + entry.cardsDueToday,
    }),
    { sessions: 0, cardsStudied: 0, correct: 0, wrong: 0, cardsDueToday: 0 },
  );
  const accuracy = study.correct + study.wrong === 0 ? 0 : study.correct / (study.correct + study.wrong);

  /* uploads ------------------------------------------------------------------ */

  let processing = 0;
  let done = 0;
  let failed = 0;
  let stuck = 0;
  const stuckThresholdMs = STUCK_UPLOAD_MINUTES * 60 * 1000;

  for (const raw of input.uploads) {
    const upload = asRecord(raw);
    const status = readUploadStatus(upload?.status);
    if (status === "processing") {
      processing += 1;
      const createdAtMs = millis(upload?.createdAt);
      // A missing or malformed createdAt cannot be aged, so it is left out of
      // the stuck count rather than guessed at either way.
      if (createdAtMs !== null && now - createdAtMs > stuckThresholdMs) stuck += 1;
    } else if (status === "done") {
      done += 1;
    } else if (status === "failed") {
      failed += 1;
    }
  }

  const finished = done + failed;
  const failureRate = finished === 0 ? 0 : failed / finished;

  /* alerts ------------------------------------------------------------------- */

  const alerts: DashboardAlert[] = [];
  if (stuck > 0) {
    alerts.push({
      id: "stuck-uploads",
      label: "STUCK UPLOADS",
      detail: `${stuck} UPLOAD${stuck === 1 ? "" : "S"} STUCK IN PROCESSING FOR OVER ${STUCK_UPLOAD_MINUTES} MINUTES.`,
      severity: "critical",
      count: stuck,
    });
  }
  if (failed > 0) {
    alerts.push({
      id: "failed-uploads",
      label: "FAILED UPLOADS",
      detail: `${failed} UPLOAD${failed === 1 ? "" : "S"} FAILED TO PROCESS.`,
      severity: "warning",
      count: failed,
    });
  }
  if (failureRate > FAILURE_RATE_ALERT_THRESHOLD && finished >= FAILURE_RATE_MIN_SAMPLE) {
    alerts.push({
      id: "high-failure-rate",
      label: "HIGH UPLOAD FAILURE RATE",
      detail: `${Math.round(failureRate * 100)}% OF RECENT UPLOADS ARE FAILING.`,
      severity: "warning",
      count: failed,
    });
  }

  /* activity ------------------------------------------------------------------ */

  // Emails are never read here, let alone put in a label: an admin does not
  // need one to skim recent activity, and leaving them out means this
  // payload leaks nothing if it is ever logged.
  const uploadActivity: DashboardActivity[] = input.uploads.map((raw, index) => {
    const upload = asRecord(raw);
    const status = readUploadStatus(upload?.status);
    const fileName = asString(upload?.fileName) ?? "UNTITLED UPLOAD";
    const id = asString(upload?.uploadId) ?? `upload-${index}`;
    const at = millis(upload?.completedAt) ?? millis(upload?.createdAt) ?? 0;
    return { id: `upload-${id}`, kind: "upload", label: uploadActivityLabel(status, fileName), at };
  });

  const signupActivity: DashboardActivity[] = input.users.map((raw, index) => {
    const user = asRecord(raw);
    const displayName = asString(user?.displayName) ?? "STUDENT";
    const id = asString(user?.userId) ?? `user-${index}`;
    const at = millis(user?.createdAt) ?? 0;
    return { id: `signup-${id}`, kind: "signup", label: `NEW SIGNUP - ${displayName}`.toUpperCase(), at };
  });

  const activity = [...uploadActivity, ...signupActivity].sort((a, b) => b.at - a.at).slice(0, 8);

  return {
    generatedAt: now,
    users: { total: input.users.length, newLast7Days, newLast30Days, activeLast7Days, admins, longestStreak },
    content: { courses: input.coursesCount, decks: input.decks.length, cards, uploads: input.uploads.length },
    study: { ...study, accuracy },
    uploads: { processing, done, failed, failureRate, stuck },
    alerts,
    activity,
    truncated,
  };
}

/**
 * Thin Admin SDK reader. Every query is either unfiltered or ordered by one
 * field, which Firestore's automatic per-field indexes already cover — none
 * of this needs an entry in firestore.indexes.json.
 */
export async function readDashboard(db: Firestore, now = Date.now()): Promise<DashboardSnapshot> {
  const [usersSnap, statsSnap, decksSnap, uploadsSnap, coursesCount] = await Promise.all([
    db.collection("users").orderBy("createdAt", "desc").limit(READ_LIMIT).get(),
    // The per-user stats/summary docs the refreshStatsFrom* triggers already
    // maintain — global study totals are a sum of documents that already
    // exist, not a re-scan of every session and progress record.
    db.collectionGroup("stats").limit(READ_LIMIT).get(),
    // cardCount is summed off the deck, not the (unbounded) cards subcollection.
    db.collection("decks").limit(READ_LIMIT).get(),
    db.collection("uploads").orderBy("createdAt", "desc").limit(READ_LIMIT).get(),
    // Only the count is needed, so an aggregation query avoids paying to read
    // every course document just to add them up.
    db.collectionGroup("courses").count().get(),
  ]);

  return summariseDashboard({
    users: usersSnap.docs.map((doc) => doc.data()),
    statsSummaries: statsSnap.docs.map((doc) => doc.data()),
    decks: decksSnap.docs.map((doc) => doc.data()),
    uploads: uploadsSnap.docs.map((doc) => doc.data()),
    coursesCount: coursesCount.data().count,
    now,
  });
}
