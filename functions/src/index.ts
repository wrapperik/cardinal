import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { onDocumentCreated, onDocumentWritten } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";

import { DEFAULT_GROQ_MODEL, safeUploadError } from "./upload/helpers";
import { defaultBucket, parseProcessingUploadJob, processUploadJob } from "./upload/processor";
import { refreshUserStats } from "./stats/refresh";

if (getApps().length === 0) initializeApp();

const groqApiKey = defineSecret("GROQ_API_KEY");
const groqModel = process.env.GROQ_MODEL?.trim() || DEFAULT_GROQ_MODEL;

export const processUpload = onDocumentCreated(
  {
    document: "uploads/{uploadId}",
    secrets: [groqApiKey],
    timeoutSeconds: 540,
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
        apiKey: groqApiKey.value(),
        model: groqModel,
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
