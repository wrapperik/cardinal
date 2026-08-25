import { logger } from "firebase-functions";
import { getStorage } from "firebase-admin/storage";
import { FieldValue, type DocumentReference, type Firestore } from "firebase-admin/firestore";
import type { Bucket } from "@google-cloud/storage";
import pdfParse from "pdf-parse";

import { findCourseByTitle, makeCourseId, normaliseTitle } from "../../../src/features/upload/course-rules";
import { parseExtractionResponse } from "../../../src/features/upload/extract/parse";
import { buildExtractionPrompt } from "../../../src/features/upload/extract/prompt";
import type { CardContent } from "../../../src/types/cardinal";
import {
  buildGeminiRequest,
  buildUploadCardPayload,
  buildUploadDeckPayload,
  extractGeminiCompletion,
  FALLBACK_GEMINI_MODELS,
  isModelOutageStatus,
  isTemplateChoice,
  majorityGameType,
  makeUploadCardId,
  makeUploadDeckId,
  mapGeminiHttpError,
  mergeExtractedCards,
  splitSourceText,
  normaliseFileType,
  UploadProcessingError,
  type TemplateChoice,
  type UploadFileType,
} from "./helpers";

// Gemini's context window removes Groq's 8000-token request ceiling. Chunks are
// retained only to keep coverage balanced across long material: each piece is
// asked for its share of the final deck, then the results are interleaved.
const MAX_CHUNK_CHARACTERS = 50_000;
const MAX_SOURCE_CHUNKS = 4;
const MAX_TOTAL_CHARACTERS = MAX_CHUNK_CHARACTERS * MAX_SOURCE_CHUNKS;
const RATE_LIMIT_RETRIES = 3;
// A model that is out of capacity stays that way for far longer than the job
// can wait, so the ladder is cut short while another model is still untried.
const RETRIES_BEFORE_FALLBACK = 1;
const REQUEST_TIMEOUT_MS = 90_000;
const PROCESSING_SAFETY_MARGIN_MS = 30_000;
const PERSISTENCE_RESERVE_MS = 10_000;
export const PROCESS_UPLOAD_TIMEOUT_SECONDS = 540;
const PROCESSING_BUDGET_MS = PROCESS_UPLOAD_TIMEOUT_SECONDS * 1_000 - PROCESSING_SAFETY_MARGIN_MS;

/** Leaves room for Gemini's thinking tokens and the full structured card set. */
function outputTokenBudget(cardTarget: number): number {
  return Math.min(Math.max(cardTarget * 400 + 1_000, 4_000), 12_000);
}
const CARD_BATCH_SIZE = 400;

export interface ProcessingUploadJob {
  uploadId: string;
  ownerId: string;
  fileName: string;
  fileType: UploadFileType;
  storagePath: string;
  template: TemplateChoice;
  cardTarget: number;
}

interface CourseCandidate {
  id: string;
  title: string;
}

interface ProcessUploadDependencies {
  db: Firestore;
  bucket: Bucket;
  apiKey: string;
  model: string;
  fallbackModels?: string[];
  fetchImpl?: typeof fetch;
}

/**
 * The client is allowed to create only a pending job. An unexpected shape is
 * ignored rather than turned into a terminal job, since the trigger must not
 * claim ownership of documents that are not this pipeline's contract.
 */
export function parseProcessingUploadJob(data: unknown, expectedUploadId: string): ProcessingUploadJob | null {
  if (!isSafePathSegment(expectedUploadId)) return null;
  if (!data || typeof data !== "object") return null;

  const value = data as Record<string, unknown>;
  const ownerId = value.ownerId;
  const fileName = value.fileName;
  const rawFileType = value.fileType;
  const fileType = normaliseFileType(rawFileType);
  const template = value.template;
  const cardTarget = value.cardTarget;

  if (
    value.uploadId !== expectedUploadId ||
    !isSafePathSegment(ownerId) ||
    typeof fileName !== "string" ||
    fileName.trim().length === 0 ||
    typeof rawFileType !== "string" ||
    rawFileType !== fileType ||
    value.storagePath !== `uploads/${ownerId}/${expectedUploadId}` ||
    value.status !== "processing" ||
    value.errorMessage !== null ||
    value.deckId !== null ||
    value.cardsGenerated !== 0 ||
    !isTemplateChoice(template) ||
    typeof cardTarget !== "number" ||
    !Number.isSafeInteger(cardTarget) ||
    cardTarget <= 0 ||
    cardTarget > 20
  ) {
    return null;
  }

  return {
    uploadId: expectedUploadId,
    ownerId,
    fileName: fileName.trim(),
    fileType,
    storagePath: value.storagePath,
    template,
    cardTarget,
  };
}

export async function processUploadJob(
  uploadRef: DocumentReference,
  job: ProcessingUploadJob,
  dependencies: ProcessUploadDependencies,
): Promise<void> {
  // Every chunk shares one deadline. The margin leaves enough time to persist
  // a completed deck or mark the upload failed before Cloud Functions stops it.
  const deadlineMs = Date.now() + PROCESSING_BUDGET_MS;

  if (!dependencies.apiKey.trim()) {
    throw new UploadProcessingError("THE EXTRACTION SERVICE IS NOT CONFIGURED");
  }

  const sourceText = await extractSourceText(dependencies.bucket, job);
  if (!sourceText.trim()) {
    throw new UploadProcessingError("THE FILE DIDN'T CONTAIN ANY READABLE TEXT");
  }

  const courses = await listCourses(dependencies.db, job.ownerId);
  const chunks = splitSourceText(
    sourceText.slice(0, MAX_TOTAL_CHARACTERS),
    MAX_CHUNK_CHARACTERS,
    MAX_SOURCE_CHUNKS,
  );

  // Reachable when the leading MAX_TOTAL_CHARACTERS are all whitespace even
  // though the document as a whole is not, which would otherwise divide the
  // card target by zero and prompt for Infinity cards across no requests.
  if (chunks.length === 0) {
    throw new UploadProcessingError("THE FILE DIDN'T CONTAIN ANY READABLE TEXT");
  }

  // Each chunk is asked for its own share of the target. Asking every chunk for
  // the full target would return four near-identical opening-topic sets and
  // waste the token budget the document is already fighting for.
  const perChunkTarget = Math.max(1, Math.ceil(job.cardTarget / chunks.length));
  const prompt = buildExtractionPrompt({
    file: {
      uri: job.storagePath,
      name: job.fileName,
      mimeType: job.fileType === "pdf" ? "application/pdf" : "text/plain",
    },
    template: job.template,
    courses,
    cardTarget: perChunkTarget,
  });

  const groups: CardContent[][] = [];
  const failures: string[] = [];
  let suggestion: { title: string; confidence: number } | null = null;

  for (const [index, chunk] of chunks.entries()) {
    try {
      const completion = await requestGeminiCompletion({
        apiKey: dependencies.apiKey,
        model: dependencies.model,
        fallbackModels: dependencies.fallbackModels ?? FALLBACK_GEMINI_MODELS,
        system: prompt.system,
        user: `${prompt.user}\n\nStudy material:\n${chunk}`,
        maxOutputTokens: outputTokenBudget(perChunkTarget),
        fetchImpl: dependencies.fetchImpl ?? fetch,
        deadlineMs,
      });
      const outcome = parseExtractionResponse(completion, {
        courses,
        provider: "gemini",
        template: job.template,
      });

      if (!outcome.ok) {
        failures.push(outcome.message);
        continue;
      }

      groups.push(outcome.result.cards);
      // The course is a property of the document, not of the chunk, so the
      // chunk that was surest about it wins rather than simply the last one.
      if (!suggestion || outcome.result.confidence > suggestion.confidence) {
        suggestion = { title: outcome.result.suggestedTitle, confidence: outcome.result.confidence };
      }
    } catch (error) {
      // One chunk failing is survivable — a deck built from the rest still
      // beats discarding the document — but a non-extraction fault is not ours
      // to swallow, so only the pipeline's own error type is caught here.
      if (!(error instanceof UploadProcessingError)) throw error;
      logger.warn("Skipping a chunk that failed to extract", {
        uploadId: job.uploadId,
        chunk: index + 1,
        of: chunks.length,
        reason: error.message,
      });
      failures.push(error.message);
    }
  }

  if (groups.length === 0) {
    throw new UploadProcessingError(failures[0] ?? "NO USABLE CARDS CAME BACK — TRY A DIFFERENT FILE");
  }
  if (failures.length > 0) {
    logger.warn("Built a deck from a partial extraction", {
      uploadId: job.uploadId,
      succeeded: groups.length,
      failed: failures.length,
    });
  }

  const cards = mergeExtractedCards(groups, job.cardTarget);
  const suggestedTitle = suggestion?.title ?? "NEW MATERIAL";
  // Do not begin a multi-document Firestore write unless there is still time
  // to finish it, plus the outer safety margin for the terminal status update.
  ensurePersistenceBudget(deadlineMs);
  const courseId = await resolveCourse(dependencies.db, job, courses, suggestedTitle, cards);
  const deckId = makeUploadDeckId(job.uploadId);
  const deckRef = dependencies.db.collection("decks").doc(deckId);
  const deckTimestamp = FieldValue.serverTimestamp();

  // Awaiting this parent write before any cards is intentional: cards are
  // valid only beneath an existing deck, and the stable ids make retries safe.
  await deckRef.set(
    buildUploadDeckPayload({
      deckId,
      ownerId: job.ownerId,
      courseId,
      title: suggestedTitle,
      uploadId: job.uploadId,
      cards,
      timestamp: deckTimestamp,
    }),
  );

  await writeCards(dependencies.db, deckId, job.uploadId, cards);
  await uploadRef.update({
    status: "done",
    errorMessage: null,
    deckId,
    cardsGenerated: cards.length,
    completedAt: FieldValue.serverTimestamp(),
  });
}

export function defaultBucket(): Bucket {
  return getStorage().bucket();
}

async function extractSourceText(bucket: Bucket, job: ProcessingUploadJob): Promise<string> {
  const [buffer] = await bucket.file(job.storagePath).download();
  if (job.fileType === "text") return buffer.toString("utf8");

  const parsed = await pdfParse(buffer);
  return parsed.text;
}

async function listCourses(db: Firestore, ownerId: string): Promise<CourseCandidate[]> {
  const snapshot = await db.collection("users").doc(ownerId).collection("courses").get();
  return snapshot.docs.flatMap((document) => {
    const data = document.data();
    return typeof data.courseId === "string" && typeof data.title === "string"
      ? [{ id: data.courseId, title: data.title }]
      : [];
  });
}

async function resolveCourse(
  db: Firestore,
  job: ProcessingUploadJob,
  courses: CourseCandidate[],
  suggestedTitle: string,
  cards: CardContent[],
): Promise<string> {
  const title = normaliseTitle(suggestedTitle);
  const existing = findCourseByTitle(courses, title);
  if (existing) return existing.id;

  const courseData = {
    ownerId: job.ownerId,
    title,
    gameType: majorityGameType(cards),
    seeded: false,
    createdAt: FieldValue.serverTimestamp(),
  };
  const coursesRef = db.collection("users").doc(job.ownerId).collection("courses");
  const preferredId = makeCourseId(title);
  const preferredRef = coursesRef.doc(preferredId);

  if (await createOrUseCourse(preferredRef, preferredId, courseData, title)) return preferredId;

  // A punctuation-only slug collision must not overwrite another course.
  // Including uploadId makes the fallback stable if this event is retried.
  const fallbackId = `${preferredId}-${job.uploadId}`;
  const fallbackRef = coursesRef.doc(fallbackId);
  if (await createOrUseCourse(fallbackRef, fallbackId, courseData, title)) return fallbackId;

  throw new UploadProcessingError("COULDN'T CREATE A COURSE FOR THIS MATERIAL");
}

async function createOrUseCourse(
  reference: DocumentReference,
  courseId: string,
  courseData: Record<string, unknown>,
  title: string,
): Promise<boolean> {
  try {
    await reference.create({ courseId, ...courseData });
    return true;
  } catch {
    const existing = await reference.get();
    const existingTitle = existing.get("title");
    return typeof existingTitle === "string" && normaliseTitle(existingTitle) === title;
  }
}

async function writeCards(db: Firestore, deckId: string, uploadId: string, cards: CardContent[]): Promise<void> {
  for (let start = 0; start < cards.length; start += CARD_BATCH_SIZE) {
    const batch = db.batch();
    for (let index = start; index < Math.min(start + CARD_BATCH_SIZE, cards.length); index += 1) {
      const card = cards[index];
      batch.set(
        db.collection("decks").doc(deckId).collection("cards").doc(makeUploadCardId(uploadId, index)),
        buildUploadCardPayload({
          deckId,
          uploadId,
          index,
          card,
          timestamp: FieldValue.serverTimestamp(),
        }),
      );
    }
    await batch.commit();
  }
}

/**
 * Runs the extraction against the primary model, then against each fallback in
 * turn while the failure is the model's own unavailability rather than
 * something about the key, the file or this pipeline.
 */
export async function requestGeminiCompletion(input: {
  apiKey: string;
  model: string;
  fallbackModels?: string[];
  system: string;
  user: string;
  maxOutputTokens: number;
  fetchImpl: typeof fetch;
  deadlineMs: number;
}): Promise<string> {
  const models = [input.model, ...(input.fallbackModels ?? [])].filter(
    (model, index, all) => model.trim().length > 0 && all.indexOf(model) === index,
  );

  for (const [index, model] of models.entries()) {
    const isLastModel = index === models.length - 1;
    try {
      return await requestModelCompletion({
        ...input,
        model,
        // Waiting out a rate limit only pays off once nothing else is left to
        // try; until then the remaining budget is better spent on a sibling.
        maxRetries: isLastModel ? RATE_LIMIT_RETRIES : RETRIES_BEFORE_FALLBACK,
      });
    } catch (error) {
      if (
        isLastModel ||
        !(error instanceof UploadProcessingError) ||
        !error.modelOutage ||
        Date.now() >= input.deadlineMs
      ) {
        throw error;
      }
      logger.warn("Extraction model unavailable; falling back", {
        from: model,
        to: models[index + 1],
        reason: error.message,
      });
    }
  }

  // Unreachable while `models` is non-empty, which the primary model guarantees
  // unless it was configured as blank — in which case there is nothing to call.
  throw new UploadProcessingError("THE EXTRACTION SERVICE IS NOT CONFIGURED");
}

async function requestModelCompletion(input: {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  maxOutputTokens: number;
  fetchImpl: typeof fetch;
  deadlineMs: number;
  maxRetries: number;
}): Promise<string> {
  const request = buildGeminiRequest({
    apiKey: input.apiKey,
    model: input.model,
    system: input.system,
    user: input.user,
    maxOutputTokens: input.maxOutputTokens,
  });

  // Free-tier quotas can briefly reject otherwise valid calls. Respect the
  // provider's retry delay while staying inside the whole job's deadline.
  for (let attempt = 0; ; attempt += 1) {
    const remainingMs = input.deadlineMs - Date.now();
    if (remainingMs <= 0) {
      throw new UploadProcessingError("THE EXTRACTION SERVICE IS BUSY — TRY AGAIN SOON");
    }

    const abortController = new AbortController();
    const requestTimeout = setTimeout(
      () => abortController.abort(),
      Math.min(REQUEST_TIMEOUT_MS, remainingMs),
    );
    let response: Response;
    try {
      response = await input.fetchImpl(request.url, {
        ...request.init,
        signal: abortController.signal,
      });

      if (response.ok) {
        let responseBody: unknown;
        try {
          // Keep the abort timer alive until the streamed body is fully read.
          responseBody = await response.json();
        } catch {
          if (abortController.signal.aborted) {
            const message = Date.now() >= input.deadlineMs
              ? "THE EXTRACTION SERVICE IS BUSY — TRY AGAIN SOON"
              : "THE EXTRACTION SERVICE COULDN'T BE REACHED";
            throw new UploadProcessingError(message);
          }
          throw new UploadProcessingError("THE EXTRACTION SERVICE RETURNED AN INVALID RESPONSE");
        }
        return extractGeminiCompletion(responseBody);
      }
    } catch (error) {
      if (error instanceof UploadProcessingError) throw error;
      if (Date.now() >= input.deadlineMs) {
        throw new UploadProcessingError("THE EXTRACTION SERVICE IS BUSY — TRY AGAIN SOON");
      }
      throw new UploadProcessingError("THE EXTRACTION SERVICE COULDN'T BE REACHED");
    } finally {
      clearTimeout(requestTimeout);
    }

    const retryable = response.status === 429 || response.status === 408 || response.status >= 500;
    if (!retryable || attempt >= input.maxRetries) {
      logger.error("Gemini rejected the extraction request", {
        status: response.status,
        model: input.model,
        attempts: attempt + 1,
      });
      throw new UploadProcessingError(mapGeminiHttpError(response.status), {
        modelOutage: isModelOutageStatus(response.status),
      });
    }

    const waitSeconds = retryAfterSeconds(response.headers.get("retry-after"), attempt);
    if (waitSeconds * 1_000 >= input.deadlineMs - Date.now()) {
      logger.warn("Gemini retry skipped because the upload deadline is near", {
        status: response.status,
        attempt: attempt + 1,
      });
      throw new UploadProcessingError("THE EXTRACTION SERVICE IS BUSY — TRY AGAIN SOON");
    }
    logger.warn("Gemini rate limited the extraction request; waiting", {
      status: response.status,
      attempt: attempt + 1,
      waitSeconds,
    });
    await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));
  }
}

/** Provider retry hints win; the doubling fallback covers 5xx and 408. */
function retryAfterSeconds(header: string | null, attempt: number): number {
  const advertised = header === null ? Number.NaN : Number.parseFloat(header);
  const seconds = Number.isFinite(advertised) ? advertised : 2 ** attempt * 5;
  return Math.min(Math.max(seconds, 1), 60) + 1;
}

function ensurePersistenceBudget(deadlineMs: number): void {
  if (deadlineMs - Date.now() < PERSISTENCE_RESERVE_MS) {
    throw new UploadProcessingError("THE EXTRACTION SERVICE IS BUSY — TRY AGAIN SOON");
  }
}

function isSafePathSegment(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}
