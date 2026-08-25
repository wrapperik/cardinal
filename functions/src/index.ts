import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { onDocumentCreated, onDocumentWritten } from "firebase-functions/v2/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";

import { DEFAULT_GEMINI_MODEL, safeUploadError } from "./upload/helpers";
import {
  defaultBucket,
  parseProcessingUploadJob,
  processUploadJob,
  PROCESS_UPLOAD_TIMEOUT_SECONDS,
} from "./upload/processor";
import { refreshUserStats } from "./stats/refresh";
import { deleteAccountData, hasDeleteConfirmation, type DeleteAccountRequest } from "./account/delete-account";
import { assertAdmin, parseAdminEmails, syncAdminRole as applyAdminRole } from "./admin/roles";
import { readDashboard } from "./admin/dashboard";

if (getApps().length === 0) initializeApp();

const geminiApiKey = defineSecret("GEMINI_API_KEY");
const geminiModel = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;

// Config, not a credential — the same reasoning that keeps GEMINI_MODEL a
// plain env var rather than a secret. An email allowlist has nothing to keep
// confidential; it only needs to not be client-writable, which is what the
// callable boundary below provides.
const adminAllowlist = parseAdminEmails(process.env.ADMIN_EMAILS);

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

/** An authenticated user can irreversibly remove their own account only. */
export const deleteAccount = onCall<DeleteAccountRequest>(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "SIGN IN TO DELETE YOUR ACCOUNT.");
  }
  if (!hasDeleteConfirmation(request.data ?? {})) {
    throw new HttpsError("invalid-argument", "TYPE DELETE TO CONFIRM ACCOUNT DELETION.");
  }

  await deleteAccountData(request.auth.uid);
  return { deleted: true };
});

/** Any signed-in user may call this — it only ever grants what ADMIN_EMAILS already lists. */
export const syncAdminRole = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "SIGN IN TO CONTINUE.");
  }

  const admin = await applyAdminRole(request.auth.uid, adminAllowlist);
  return { admin };
});

/**
 * The Admin SDK bypasses Firestore rules entirely, which is exactly why this
 * is a callable gated by assertAdmin() rather than a set of cross-user read
 * grants in firestore.rules: a rule that let an admin's account read every
 * user's data would also let that same admin's client read it directly,
 * which is a far larger blast radius than one server-side aggregation.
 */
export const adminDashboard = onCall(async (request) => {
  assertAdmin(request.auth);
  return readDashboard(getFirestore());
});
