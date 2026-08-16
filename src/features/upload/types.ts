/**
 * Contracts for the upload pipeline: pick a document, have a model turn it
 * into cards, then file those cards under a course.
 *
 * These shapes are deliberately independent of Firestore. Everything the
 * pipeline produces is plain JSON that either persists locally today or gets
 * written straight to `decks/` and `uploads/` once the backend lands — the
 * card payloads are already the ones declared in @/types/cardinal.
 */

import type { CardDoc, GameType } from '@/types/cardinal';

/* -------------------------------------------------------------------------- */
/* Picking                                                                     */
/* -------------------------------------------------------------------------- */

/** What the system picker hands back, normalised across web and native. */
export interface PickedFile {
  uri: string;
  name: string;
  /** Bytes. Undefined when the platform declines to report a size. */
  size?: number;
  mimeType: string;
  /**
   * Web hands base64 back from the picker itself. Always the bare payload —
   * the picker strips the `data:` URL prefix the web implementation wraps it
   * in. This will be uploaded to Firebase Storage by the backend client.
   */
  base64?: string;
}

export type PickFailure =
  | 'cancelled'
  | 'unsupportedType'
  | 'tooLarge'
  | 'failed';

export type PickOutcome =
  | { ok: true; file: PickedFile }
  | { ok: false; reason: PickFailure; message: string };

/** PDFs are the headline case; plain text and markdown ride along free. */
export const ACCEPTED_MIME_TYPES = [
  'application/pdf',
  'text/plain',
  'text/markdown',
] as const;

/**
 * 20 MB. Keeps uploads small enough for a revision-note workflow and bounds
 * the storage, transfer, and extraction work a single request can create.
 */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

/* -------------------------------------------------------------------------- */
/* Courses                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A subject heading. The four that ship with the app are seeded rather than
 * created, so they can never be renamed out from under the demo decks — but
 * they are otherwise ordinary courses and take uploads like any other.
 */
export interface Course {
  id: string;
  /** Display form: uppercase, since every surface renders it that way. */
  title: string;
  /** The template new material defaults to when the model has no opinion. */
  gameType: GameType;
  seeded: boolean;
  createdAt: number;
}

/* -------------------------------------------------------------------------- */
/* Extraction                                                                  */
/* -------------------------------------------------------------------------- */

/** 'auto' hands the choice of template to the model, per card. */
export type TemplateChoice = GameType | 'auto';

export type ExtractionProviderId = 'mock' | 'groq';

export interface ExtractionRequest {
  file: PickedFile;
  template: TemplateChoice;
  /** Existing courses the model may file the material under. */
  courses: Pick<Course, 'id' | 'title'>[];
  /** Roughly how many cards to aim for. Providers treat this as a target. */
  cardTarget: number;
}

export interface ExtractionResult {
  cards: CardDoc[];
  /** A course title the model would give this material, uppercased. */
  suggestedTitle: string;
  /** An existing course id when the material clearly belongs to one. */
  suggestedCourseId: string | null;
  /** 0–1. Drives how strongly the review screen pushes the suggestion. */
  confidence: number;
  provider: ExtractionProviderId;
}

export type ExtractionFailure =
  | 'noKey'
  | 'network'
  | 'badResponse'
  | 'unsupportedFile'
  | 'empty';

export type ExtractionOutcome =
  | { ok: true; result: ExtractionResult }
  | { ok: false; reason: ExtractionFailure; message: string };

/**
 * One extraction boundary behind one call. The temporary mock and the future
 * Groq Cloud Function share this contract, so the UI does not know where card
 * generation runs.
 */
export interface ExtractionProvider {
  id: ExtractionProviderId;
  /** Shown on the review screen so it is always clear what produced the cards. */
  label: string;
  /** Whether this provider can currently accept an extraction request. */
  isConfigured: () => boolean;
  extract: (
    request: ExtractionRequest,
    onProgress?: (fraction: number) => void,
  ) => Promise<ExtractionOutcome>;
}

/* -------------------------------------------------------------------------- */
/* Decks                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * A finished upload. Mirrors `decks/{deckId}` plus its cards subcollection,
 * flattened into one record because there is nothing to paginate locally.
 */
export interface LocalDeck {
  id: string;
  courseId: string;
  title: string;
  /** The original filename, kept so the review screen can show provenance. */
  sourceName: string;
  cards: CardDoc[];
  createdAt: number;
  provider: ExtractionProviderId;
}

/* -------------------------------------------------------------------------- */
/* Sheet state                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Where the upload sheet is in its run. `review` is the only stage that can be
 * reached twice — re-extracting after a bad result returns to it.
 */
export type UploadStage =
  | 'idle'
  | 'picked'
  | 'extracting'
  | 'review'
  | 'saving'
  | 'saved'
  | 'failed';
