import { collection, doc, getDoc, getDocs, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { ref, uploadBytesResumable, uploadString } from "firebase/storage";

import { isGameType } from "@/features/upload/course-rules";
import { auth, db, storage } from "@/lib/firebase";
import type {
  Course,
  ExtractionFailure,
  ExtractionOutcome,
  ExtractionProvider,
  ExtractionRequest,
  LocalCard,
  LocalDeck,
} from "@/features/upload/types";
import type { CardContent } from "@/types/cardinal";

const JOB_TIMEOUT_MS = 600_000;

type Failure = { reason: ExtractionFailure; message: string };

type DataMap = Record<string, unknown>;

export interface CanonicalDocuments {
  uid: string;
  uploadId: string;
  fileName: string;
  job: unknown;
  deckId: string;
  deck: unknown;
  cards: { id: string; data: unknown }[];
  course: unknown;
}

function asMap(value: unknown): DataMap | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as DataMap)
    : null;
}

function timestampMillis(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof value === "object" && "toMillis" in value) {
    const toMillis = (value as { toMillis?: unknown }).toMillis;
    if (typeof toMillis === "function") {
      const millis = toMillis();
      return typeof millis === "number" && Number.isFinite(millis) ? millis : null;
    }
  }
  return null;
}

function badResponse(message = "THE EXTRACTION RESULT COULDN'T BE READ"): ExtractionOutcome {
  return { ok: false, reason: "badResponse", message };
}

function emptyResult(): ExtractionOutcome {
  return { ok: false, reason: "empty", message: "NO STUDY CARDS WERE CREATED" };
}

function topicFrom(data: DataMap): { topic?: string } {
  return typeof data.topic === "string" ? { topic: data.topic } : {};
}

function cardFromDocument(id: string, value: unknown, expectedDeckId: string): LocalCard | null {
  const data = asMap(value);
  if (!data || data.deckId !== expectedDeckId || !isGameType(data.gameType)) return null;
  if (typeof data.difficulty !== "number" || !Number.isInteger(data.difficulty)) return null;
  if (data.difficulty < 1 || data.difficulty > 3) return null;
  const payload = asMap(data.payload);
  if (!payload) return null;

  const base = { cardId: id, difficulty: data.difficulty, ...topicFrom(data) };
  switch (data.gameType) {
    case "compassQuiz":
      return typeof payload.question === "string" &&
        Array.isArray(payload.choices) &&
        payload.choices.length === 3 &&
        payload.choices.every((choice) => typeof choice === "string") &&
        typeof payload.correctIndex === "number" &&
        Number.isInteger(payload.correctIndex) &&
        payload.correctIndex >= 0 &&
        payload.correctIndex < payload.choices.length
        ? {
            ...base,
            gameType: data.gameType,
            payload: {
              question: payload.question,
              choices: payload.choices,
              correctIndex: payload.correctIndex,
            },
          }
        : null;
    case "trueFalseDuel":
      return typeof payload.statement === "string" && typeof payload.isTrue === "boolean"
        ? {
            ...base,
            gameType: data.gameType,
            payload: { statement: payload.statement, isTrue: payload.isTrue },
          }
        : null;
    case "sequenceSwipe":
      return typeof payload.prompt === "string" &&
        Array.isArray(payload.orderedItems) &&
        payload.orderedItems.length === 4 &&
        payload.orderedItems.every((item) => typeof item === "string")
        ? {
            ...base,
            gameType: data.gameType,
            payload: { prompt: payload.prompt, orderedItems: payload.orderedItems },
          }
        : null;
    case "matchRelease":
      return typeof payload.prompt === "string" &&
        Array.isArray(payload.pairs) &&
        payload.pairs.length === 3 &&
        payload.pairs.every((pair) => {
          const value = asMap(pair);
          return !!value && typeof value.term === "string" && typeof value.definition === "string";
        })
        ? {
            ...base,
            gameType: data.gameType,
            payload: {
              prompt: payload.prompt,
              pairs: payload.pairs.map((pair) => {
                const value = pair as { term: string; definition: string };
                return { term: value.term, definition: value.definition };
              }),
            },
          }
        : null;
  }
}

function courseFromDocument(courseId: string, value: unknown): Course | null {
  const data = asMap(value);
  const createdAt = data ? timestampMillis(data.createdAt) : null;
  if (
    !data ||
    typeof data.title !== "string" ||
    !isGameType(data.gameType) ||
    typeof data.seeded !== "boolean" ||
    createdAt === null
  ) {
    return null;
  }

  return { id: courseId, title: data.title, gameType: data.gameType, seeded: data.seeded, createdAt };
}

/**
 * Converts the deck and cards written by the Function into the local shapes
 * consumed by the game screens. It intentionally accepts only matching
 * owner/deck/upload provenance so a completed job cannot be mistaken for an
 * unrelated deck.
 */
export function canonicalResultFromDocuments(input: CanonicalDocuments): ExtractionOutcome {
  const job = asMap(input.job);
  const deck = asMap(input.deck);
  if (!job || !deck) return badResponse();
  if (
    deck.ownerId !== input.uid ||
    typeof deck.courseId !== "string" ||
    typeof deck.title !== "string" ||
    deck.sourceType !== "upload" ||
    deck.uploadId !== input.uploadId ||
    typeof deck.cardCount !== "number"
  ) {
    return badResponse();
  }

  const createdAt = timestampMillis(deck.createdAt);
  const updatedAt = timestampMillis(deck.updatedAt);
  if (createdAt === null || updatedAt === null) return badResponse();

  const cards = input.cards
    .map(({ id, data }) => cardFromDocument(id, data, input.deckId))
    .filter((card): card is LocalCard => card !== null);

  if (cards.length === 0) return emptyResult();
  if (
    cards.length !== input.cards.length ||
    !Number.isInteger(deck.cardCount) ||
    deck.cardCount !== cards.length ||
    !Number.isInteger(job.cardsGenerated) ||
    job.cardsGenerated !== cards.length
  ) {
    return badResponse();
  }

  const course = courseFromDocument(deck.courseId, input.course);
  if (!course) return badResponse();

  const canonicalDeck: LocalDeck = {
    id: input.deckId,
    courseId: deck.courseId,
    title: deck.title,
    sourceName: input.fileName,
    cards,
    createdAt,
    updatedAt,
    provider: "groq",
    sourceType: "upload",
    uploadId: input.uploadId,
  };

  return {
    ok: true,
    result: {
      cards: cards as CardContent[],
      suggestedTitle: course.title,
      suggestedCourseId: course.id,
      confidence: 1,
      provider: "groq",
      canonicalDeck,
      canonicalCourse: course,
    },
  };
}

/** Maps Firebase's platform-specific errors onto the upload UI's stable messages. */
export function mapFirebaseFailure(error: unknown): Failure {
  const value = asMap(error);
  const code = typeof value?.code === "string" ? value.code.toLowerCase() : "";

  if (/network|unavailable|deadline|retry-limit/.test(code)) {
    return { reason: "network", message: "CHECK YOUR CONNECTION AND TRY AGAIN" };
  }
  if (/invalid|format|size|quota/.test(code)) {
    return { reason: "unsupportedFile", message: "THAT FILE COULDN'T BE UPLOADED" };
  }
  if (/auth|permission|unauthenticated/.test(code)) {
    return { reason: "noKey", message: "CLOUD EXTRACTION ISN'T AVAILABLE RIGHT NOW" };
  }
  return { reason: "badResponse", message: "THE EXTRACTION SERVICE COULDN'T FINISH" };
}

function firebaseIsConfigured(): boolean {
  return Boolean(
    process.env.EXPO_PUBLIC_ENABLE_GROQ_EXTRACTION === "1" &&
      process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID &&
      process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET &&
      auth.currentUser,
  );
}

async function uploadPickedFile(request: ExtractionRequest, storagePath: string, onProgress?: (fraction: number) => void) {
  const objectRef = ref(storage, storagePath);
  const metadata = { contentType: request.file.mimeType };

  if (request.file.base64) {
    await uploadString(objectRef, request.file.base64, "base64", metadata);
    onProgress?.(0.6);
    return;
  }

  const response = await fetch(request.file.uri);
  if (!response.ok) throw new Error("file-read-failed");
  const blob = await response.blob();
  const task = uploadBytesResumable(objectRef, blob, metadata);
  await new Promise<void>((resolve, reject) => {
    task.on(
      "state_changed",
      (snapshot) => {
        const fraction = snapshot.totalBytes > 0 ? snapshot.bytesTransferred / snapshot.totalBytes : 1;
        onProgress?.(0.05 + fraction * 0.55);
      },
      reject,
      resolve,
    );
  });
}

async function loadCanonicalResult(
  uid: string,
  uploadId: string,
  fileName: string,
  job: DataMap,
): Promise<ExtractionOutcome> {
  if (typeof job.deckId !== "string") return badResponse();
  const deckRef = doc(db, "decks", job.deckId);
  const deckSnap = await getDoc(deckRef);
  if (!deckSnap.exists()) return badResponse("THE GENERATED DECK WASN'T FOUND");
  const deck = deckSnap.data();
  const deckData = asMap(deck);
  if (!deckData || typeof deckData.courseId !== "string") return badResponse();

  const [cardsSnap, courseSnap] = await Promise.all([
    getDocs(collection(db, "decks", job.deckId, "cards")),
    getDoc(doc(db, "users", uid, "courses", deckData.courseId)),
  ]);
  if (!courseSnap.exists()) return badResponse("THE GENERATED COURSE WASN'T FOUND");

  return canonicalResultFromDocuments({
    uid,
    uploadId,
    fileName,
    job,
    deckId: job.deckId,
    deck,
    cards: cardsSnap.docs.map((card) => ({ id: card.id, data: card.data() })),
    course: courseSnap.data(),
  });
}

function waitForCompletion(
  uid: string,
  uploadId: string,
  fileName: string,
  onProgress?: (fraction: number) => void,
): Promise<ExtractionOutcome> {
  const uploadRef = doc(db, "uploads", uploadId);

  return new Promise((resolve) => {
    let settled = false;
    let loadingResult = false;
    let unsubscribe: (() => void) | undefined;

    const finish = (outcome: ExtractionOutcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      unsubscribe?.();
      resolve(outcome);
    };

    const timeout = setTimeout(() => {
      finish({ ok: false, reason: "network", message: "THE EXTRACTION TOOK TOO LONG — TRY AGAIN" });
    }, JOB_TIMEOUT_MS);

    const listener = onSnapshot(
      uploadRef,
      (snapshot) => {
        const job = snapshot.exists() ? asMap(snapshot.data()) : null;
        if (!job || settled) return;
        if (job.status === "processing") {
          onProgress?.(0.75);
          return;
        }
        if (job.status === "failed") {
          const message = typeof job.errorMessage === "string" ? job.errorMessage : "THE EXTRACTION FAILED";
          finish({ ok: false, reason: "badResponse", message });
          return;
        }
        if (job.status !== "done" || loadingResult) return;

        loadingResult = true;
        onProgress?.(0.85);
        void loadCanonicalResult(uid, uploadId, fileName, job)
          .then((outcome) => {
            if (outcome.ok) onProgress?.(1);
            finish(outcome);
          })
          .catch((error) => finish({ ok: false, ...mapFirebaseFailure(error) }));
      },
      (error) => finish({ ok: false, ...mapFirebaseFailure(error) }),
    );
    unsubscribe = listener;
    // Firebase normally invokes the observer asynchronously. This guard also
    // cleans up correctly if a mocked or future implementation reports an
    // error synchronously before `onSnapshot` returns its unsubscribe handle.
    if (settled) listener();
  });
}

async function extract(
  request: ExtractionRequest,
  onProgress?: (fraction: number) => void,
): Promise<ExtractionOutcome> {
  const user = auth.currentUser;
  if (!user) {
    return { ok: false, reason: "noKey", message: "SIGN IN TO USE CLOUD EXTRACTION" };
  }
  if (!firebaseIsConfigured()) {
    return { ok: false, reason: "noKey", message: "CLOUD EXTRACTION ISN'T CONFIGURED" };
  }

  const uploadId = doc(collection(db, "uploads")).id;
  const storagePath = `uploads/${user.uid}/${uploadId}`;
  onProgress?.(0.05);

  try {
    await uploadPickedFile(request, storagePath, onProgress);
    onProgress?.(0.65);
    await setDoc(doc(db, "uploads", uploadId), {
      uploadId,
      ownerId: user.uid,
      fileName: request.file.name,
      fileType: request.file.mimeType === "application/pdf" ? "pdf" : "text",
      storagePath,
      template: request.template,
      cardTarget: request.cardTarget,
      status: "processing",
      errorMessage: null,
      deckId: null,
      cardsGenerated: 0,
      createdAt: serverTimestamp(),
      completedAt: null,
    });
    onProgress?.(0.7);
    return waitForCompletion(user.uid, uploadId, request.file.name, onProgress);
  } catch (error) {
    return { ok: false, ...mapFirebaseFailure(error) };
  }
}

export const groqProvider: ExtractionProvider = {
  id: "groq",
  label: "CLOUD EXTRACTOR",
  isConfigured: firebaseIsConfigured,
  extract,
};
