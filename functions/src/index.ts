import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { onDocumentCreated, onDocumentWritten } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";

import { DEFAULT_GEMINI_MODEL, safeUploadError } from "./upload/helpers";
import {
  defaultBucket,
  parseProcessingUploadJob,
  processUploadJob,
  PROCESS_UPLOAD_TIMEOUT_SECONDS,
} from "./upload/processor";
import { refreshUserStats } from "./stats/refresh";

if (getApps().length === 0) initializeApp();

const geminiApiKey = defineSecret("GEMINI_API_KEY");
const geminiModel = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;

export const processUpload = onDocumentCreated(
  {
    document: "uploads/{uploadId}",
    secrets: [geminiApiKey],
    timeoutSeconds: PROCESS_UPLOAD_TIMEOUT_SECONDS,
    memory: "1GiB",
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const job = parseProcessingUploadJob(snapshot.data(), event.params.uploadId);
    if (!job) {
      logger.warn("Ignoring malformed or non-processing upload job", { uploadId: event.params.uploadId });
      return;
    }

    try {
      await processUploadJob(snapshot.ref, job, {
        db: getFirestore(),
        bucket: defaultBucket(),
        apiKey: geminiApiKey.value(),
        model: geminiModel,
      });
    } catch (error) {
      logger.error("Upload extraction failed", { uploadId: job.uploadId, error });
      await snapshot.ref.update({
        status: "failed",
        errorMessage: safeUploadError(error),
        deckId: null,
        cardsGenerated: 0,
        completedAt: FieldValue.serverTimestamp(),
      });
    }
  },
);

/** Both source collections refresh the same derived summary after every write. */
export const refreshStatsFromSession = onDocumentWritten(
  "users/{userId}/sessions/{sessionId}",
  async (event) => {
    await refreshUserStats(getFirestore(), event.params.userId);
  },
);

export const refreshStatsFromProgress = onDocumentWritten(
  "users/{userId}/progress/{cardId}",
  async (event) => {
    await refreshUserStats(getFirestore(), event.params.userId);
  },
);
