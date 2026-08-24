import { getStorage } from "firebase-admin/storage";
import { FieldValue, type DocumentReference, type Firestore } from "firebase-admin/firestore";
import type { Bucket } from "@google-cloud/storage";
import pdfParse from "pdf-parse";

import { findCourseByTitle, makeCourseId, normaliseTitle } from "../../../src/features/upload/course-rules";
import { parseExtractionResponse } from "../../../src/features/upload/extract/parse";
import { buildExtractionPrompt } from "../../../src/features/upload/extract/prompt";
import type { CardContent } from "../../../src/types/cardinal";
import {
  buildUploadCardPayload,
  buildUploadDeckPayload,
  extractGroqCompletion,
  isTemplateChoice,
  majorityGameType,
  makeUploadCardId,
  makeUploadDeckId,
  mapGroqHttpError,
  normaliseFileType,
  UploadProcessingError,
  type TemplateChoice,
  type UploadFileType,
} from "./helpers";

const MAX_SOURCE_CHARACTERS = 100_000;
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
  if (!dependencies.apiKey.trim()) {
    throw new UploadProcessingError("THE EXTRACTION SERVICE IS NOT CONFIGURED");
  }

  const sourceText = await extractSourceText(dependencies.bucket, job);
  if (!sourceText.trim()) {
    throw new UploadProcessingError("THE FILE DIDN'T CONTAIN ANY READABLE TEXT");
  }

  const courses = await listCourses(dependencies.db, job.ownerId);
  const prompt = buildExtractionPrompt({
    file: {
      uri: job.storagePath,
      name: job.fileName,
      mimeType: job.fileType === "pdf" ? "application/pdf" : "text/plain",
    },
    template: job.template,
    courses,
    cardTarget: job.cardTarget,
  });
  const completion = await requestGroqCompletion({
    apiKey: dependencies.apiKey,
    model: dependencies.model,
    system: prompt.system,
    user: `${prompt.user}\n\nStudy material:\n${sourceText.slice(0, MAX_SOURCE_CHARACTERS)}`,
    fetchImpl: dependencies.fetchImpl ?? fetch,
  });
  const outcome = parseExtractionResponse(completion, {
    courses,
    provider: "groq",
    template: job.template,
  });

  if (!outcome.ok) throw new UploadProcessingError(outcome.message);

  const cards = outcome.result.cards;
  const courseId = await resolveCourse(dependencies.db, job, courses, outcome.result.suggestedTitle, cards);
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
      title: outcome.result.suggestedTitle,
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

async function requestGroqCompletion(input: {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  fetchImpl: typeof fetch;
}): Promise<string> {
  let response: Response;
  try {
    response = await input.fetchImpl("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: input.model,
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.user },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
        max_completion_tokens: 6000,
      }),
    });
  } catch {
    throw new UploadProcessingError("THE EXTRACTION SERVICE COULDN'T BE REACHED");
  }

  if (!response.ok) throw new UploadProcessingError(mapGroqHttpError(response.status));

  try {
    return extractGroqCompletion(await response.json());
  } catch (error) {
    if (error instanceof UploadProcessingError) throw error;
    throw new UploadProcessingError("THE EXTRACTION SERVICE RETURNED AN INVALID RESPONSE");
  }
}

function isSafePathSegment(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}
