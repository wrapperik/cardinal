import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

export interface DeleteAccountRequest {
  confirmation?: unknown;
}

/** Server-side confirmation stays exact: unlike the input field, callers do not get normalisation for free. */
export function hasDeleteConfirmation(input: DeleteAccountRequest): boolean {
  return input.confirmation === "DELETE";
}

/**
 * Removes every record owned by one account before its Firebase Auth identity
 * is removed. Recursive deletes matter for deck card subcollections; deleting
 * a deck document alone would leave those cards orphaned.
 */
export async function deleteAccountData(userId: string): Promise<void> {
  const db = getFirestore();
  const [decks, uploads] = await Promise.all([
    db.collection("decks").where("ownerId", "==", userId).get(),
    db.collection("uploads").where("ownerId", "==", userId).get(),
  ]);

  for (const deck of decks.docs) {
    await db.recursiveDelete(deck.ref);
  }
  for (const upload of uploads.docs) {
    await db.recursiveDelete(upload.ref);
  }

  // Deletes source PDFs/text alongside upload jobs. An empty prefix is a
  // successful no-op, so a user who never uploaded anything can still delete
  // their account with the same path.
  await getStorage().bucket().deleteFiles({ prefix: `uploads/${userId}/` });
  await db.recursiveDelete(db.doc(`users/${userId}`));
  await getAuth().deleteUser(userId);
}
