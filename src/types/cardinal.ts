/**
 * Firestore document shapes.
 *
 * Mirrors the schema in the pitch:
 *   users/{userId}
 *   decks/{deckId}
 *   decks/{deckId}/cards/{cardId}
 *   users/{userId}/progress/{cardId}
 *   uploads/{uploadId}
 */

import type { Timestamp } from 'firebase/firestore';

export type GameType =
  | 'compassQuiz'
  | 'trueFalseDuel'
  | 'sequenceSwipe'
  | 'matchRelease';

export type SourceType = 'upload' | 'manual';

export type UploadStatus = 'processing' | 'done' | 'failed';

export type AnswerResult = 'correct' | 'incorrect' | 'passed';

export interface UserDoc {
  displayName: string;
  email: string;
  streak: number;
  createdAt: Timestamp;
}

export interface DeckDoc {
  title: string;
  ownerId: string;
  sourceType: SourceType;
}

export interface UploadDoc {
  ownerId: string;
  fileType: 'pdf' | 'text';
  status: UploadStatus;
  deckId: string | null;
}

/**
 * Card payloads stay loosely typed in Firestore on purpose — the shape varies
 * by gameType. The discriminated union below is what the client narrows to.
 */
export interface CompassQuizPayload {
  question: string;
  /** Up to three answers; down is always Pass. */
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

export type CardDoc =
  | { gameType: 'compassQuiz'; difficulty: number; payload: CompassQuizPayload }
  | { gameType: 'trueFalseDuel'; difficulty: number; payload: TrueFalsePayload }
  | { gameType: 'sequenceSwipe'; difficulty: number; payload: SequencePayload }
  | { gameType: 'matchRelease'; difficulty: number; payload: MatchReleasePayload };

/** SM-2 scheduling state, one document per card per user. */
export interface ProgressDoc {
  easeFactor: number;
  interval: number;
  dueDate: Timestamp;
  lastResult: AnswerResult;
}
