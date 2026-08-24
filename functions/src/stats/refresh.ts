import { FieldValue, type Firestore } from "firebase-admin/firestore";

import { buildStatsPayload, summariseStats } from "./summary";

/**
 * Reads both source collections at refresh time. This makes each trigger
 * idempotent and lets a delete correct the summary just as reliably as a
 * create or update.
 */
export async function refreshUserStats(db: Firestore, userId: string, now = Date.now()): Promise<void> {
  const user = db.collection("users").doc(userId);
  const [sessions, progress] = await Promise.all([
    user.collection("sessions").get(),
    user.collection("progress").get(),
  ]);

  await user.collection("stats").doc("summary").set(
    buildStatsPayload(
      userId,
      summariseStats({
        sessions: sessions.docs.map((snapshot) => snapshot.data()),
        progress: progress.docs.map((snapshot) => snapshot.data()),
        now,
      }),
      FieldValue.serverTimestamp(),
    ),
  );
}
