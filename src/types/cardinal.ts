/**
 * Firestore document shapes.
 *
 * Mirrors the ERD:
 *   users/{userId}
 *   users/{userId}/stats/summary
 *   users/{userId}/preferences/settings
 *   users/{userId}/progress/{cardId}
 *   users/{userId}/sessions/{sessionId}
 *   users/{userId}/checkpoints/{courseId}
 *   users/{userId}/courses/{courseId}
 *   decks/{deckId}
 *   decks/{deckId}/cards/{cardId}
 *   uploads/{uploadId}
 *
 * These are the stored shapes. Anything the extraction pipeline builds before
 * it has been written to Firestore is a `CardContent`, not a `CardDoc` — see
 * the note above CardDoc.
 */

import type { Timestamp } from 'firebase/firestore';

export type GameType =
  | 'compassQuiz'
  | 'trueFalseDuel'
  | 'sequenceSwipe'
  | 'matchRelease';

export type SourceType = 'upload' | 'manual';

export type UploadStatus = 'processing' | 'done' | 'failed';

/** What a single swipe produced. Drives the per-session counters. */
export type AnswerResult = 'correct' | 'incorrect' | 'passed';

/**
 * SM-2 grades recall from 0 to 5. The games only ever produce three outcomes,
 * so the mapping is fixed: a pass is 0, a wrong answer is 2, and a correct one
 * is 5. Storing the grade rather than the outcome is what lets the scheduler
 * stay a faithful SM-2 implementation.
 */
export type RecallQuality = 0 | 1 | 2 | 3 | 4 | 5;

/* -------------------------------------------------------------------------- */
/* users                                                                       */
/* -------------------------------------------------------------------------- */

export interface UserDoc {
  /** Duplicated from the document id, so a snapshot maps to this shape whole. */
  userId: string;
  displayName: string;
  email: string;
  photoURL: string | null;
  currentStreak: number;
  longestStreak: number;
  /** Null until the first session is completed. */
  lastStudiedDate: Timestamp | null;
  onboardingComplete: boolean;
  createdAt: Timestamp;
}

/**
 * Derived entirely from sessions and progress, and kept as its own document so
 * the profile screen is one read rather than an aggregation. Maintained by a
 * Cloud Function trigger, never written by the client.
 */
export interface StatsDoc {
  userId: string;
  totalCardsStudied: number;
  totalSessions: number;
  totalCorrect: number;
  totalWrong: number;
  /** 0 to 1. Stored rather than computed so the client never divides by zero. */
  overallAccuracy: number;
  cardsDueToday: number;
  updatedAt: Timestamp;
}

export interface PreferencesDoc {
  userId: string;
  accessibilityTapZones: boolean;
  hapticsEnabled: boolean;
  dailyReminderEnabled: boolean;
  /** 24-hour local time, "HH:MM". */
  reminderTime: string;
  theme: string;
}

/** SM-2 scheduling state, one document per card per user. */
export interface ProgressDoc {
  cardId: string;
  /** Denormalised so "everything due in this deck" is one query. */
  deckId: string;
  easeFactor: number;
  interval: number;
  repetitions: number;
  lapses: number;
  dueDate: Timestamp;
  lastReviewedAt: Timestamp;
  lastQuality: RecallQuality;
}

export interface SessionDoc {
  sessionId: string;
  courseId: string;
  /** Null when the session spans a course rather than one deck. */
  deckId: string | null;
  startedAt: Timestamp;
  /** Null while the session is still open. */
  endedAt: Timestamp | null;
  correctCount: number;
  wrongCount: number;
  passedCount: number;
  bestStreakInSession: number;
  gameTypesPlayed: GameType[];
}

/** Resume position for one course's generated recap queue. */
export interface CheckpointDoc {
  courseId: string;
  index: number;
  total: number;
  updatedAt: Timestamp;
}

/* -------------------------------------------------------------------------- */
/* courses, decks, cards                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The subject heading a deck is filed under, and what the home screen's pills
 * actually are. Four are seeded with the app; the rest arrive with uploads.
 *
 * Stored at `users/{userId}/courses/{courseId}` rather than root-level: seed
 * ids are the bare slug (see `seedCourses`), so every account's starter
 * courses share the same id, and only a per-user path keeps two accounts'
 * `biology` from colliding. `ownerId` is kept anyway, matching every other
 * owned document and letting rules assert it without a second lookup.
 */
export interface CourseDoc {
  courseId: string;
  ownerId: string;
  /** Uppercase, normalised. Titles are what de-duplicate a course, not ids. */
  title: string;
  /**
   * ONLY an extraction default — the template new material defaults to when
   * the model has no opinion. It does not determine what the course plays:
   * a course's playable games are derived from the game types its cards
   * actually carry.
   */
  gameType: GameType;
  seeded: boolean;
  createdAt: Timestamp;
}

export interface DeckDoc {
  deckId: string;
  ownerId: string;
  courseId: string;
  title: string;
  sourceType: SourceType;
  /** Provenance. Null for a manually created deck. */
  uploadId: string | null;
  cardCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Card payloads stay loosely typed in Firestore on purpose — the shape varies
 * by gameType. The discriminated union below is what the client narrows to.
 */
export interface CompassQuizPayload {
  question: string;
  /** Exactly three answers; down is always Pass. */
  choices: string[];
  correctIndex: number;
}

export interface TrueFalsePayload {
  statement: string;
  /** Right for true, left for false. Down is Pass, as it is in every template. */
  isTrue: boolean;
}

export interface SequencePayload {
  prompt: string;
  /** Stored in correct order; shuffled client-side for play. */
  orderedItems: string[];
}

export interface MatchReleasePayload {
  prompt: string;
  pairs: { term: string; definition: string }[];
}

/**
 * A card's teachable content, with no identity and no provenance.
 *
 * This is what the extraction pipeline produces and what the game screens
 * play, both of which happen before anything has been written to Firestore and
 * therefore before a cardId or deckId exists. Keeping it separate from CardDoc
 * is what stops those ids having to be invented early or typed as optional
 * everywhere they are read.
 *
 * `topic` is the sub-area of the course a card covers — uppercase, like every
 * other card string. It is optional because older cards and hand-written
 * fixtures predate it and have none, and it exists so a course's material can
 * be grouped for study (e.g. by chapter or theme) rather than treated as one
 * flat pile. Repeated per-member rather than factored out, matching how
 * `difficulty` is already repeated across all four.
 */
export type CardContent =
  | { gameType: 'compassQuiz'; difficulty: number; topic?: string; payload: CompassQuizPayload }
  | { gameType: 'trueFalseDuel'; difficulty: number; topic?: string; payload: TrueFalsePayload }
  | { gameType: 'sequenceSwipe'; difficulty: number; topic?: string; payload: SequencePayload }
  | { gameType: 'matchRelease'; difficulty: number; topic?: string; payload: MatchReleasePayload };

/**
 * A stored card: its content, plus where it lives and where it came from.
 *
 * `uploadId` is deliberately absent. It would be a third copy of the same fact,
 * and the deck this card belongs to already carries it.
 */
export type CardDoc = CardContent & {
  cardId: string;
  deckId: string;
  /** Shown after a wrong answer. Optional: not every card earns one. */
  explanation?: string;
  createdAt: Timestamp;
};

/* -------------------------------------------------------------------------- */
/* uploads                                                                     */
/* -------------------------------------------------------------------------- */

export interface UploadDoc {
  uploadId: string;
  ownerId: string;
  fileName: string;
  fileType: 'pdf' | 'text';
  /** Path within the Storage bucket, not a download URL. */
  storagePath: string;
  /** The requested template; `auto` lets extraction choose per card. */
  template: GameType | 'auto';
  /** Bounded card target supplied with the extraction job. */
  cardTarget: number;
  status: UploadStatus;
  /** Set only when status is 'failed'. */
  errorMessage: string | null;
  /** Null until extraction finishes and the deck is written. */
  deckId: string | null;
  cardsGenerated: number;
  createdAt: Timestamp;
  completedAt: Timestamp | null;
}
