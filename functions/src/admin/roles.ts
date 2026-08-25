import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";

/**
 * Splits a comma- and/or whitespace-separated allowlist (functions/.env
 * values wrap across lines easily, so both separators have to work), trims
 * each entry, lowercases for a case-insensitive match, and drops anything
 * that normalises to empty.
 */
export function parseAdminEmails(raw: string | undefined): string[] {
  if (!raw) return [];
  const emails = raw
    .split(/[,\s]+/)
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0);
  return [...new Set(emails)];
}

/** Case-insensitive membership check. A missing email or an empty allowlist is never an admin. */
export function isAllowlistedAdmin(email: string | null | undefined, allowlist: string[]): boolean {
  if (!email) return false;
  const normalised = email.trim().toLowerCase();
  if (!normalised) return false;
  return allowlist.includes(normalised);
}

/**
 * The custom claim on the caller's ID token is the only thing firestore.rules
 * and assertAdmin() ever trust. `role` on users/{uid} is a mirror kept only
 * for querying and audit (e.g. "list every admin" without an Auth call per
 * user); it is never itself a grant, which is exactly what the create/update
 * conditions in firestore.rules exist to guarantee stays true.
 *
 * Skips the write entirely when the claim already matches, so a routine
 * sign-in costs one Auth read and nothing else — the common case by far.
 *
 * Removing someone from ADMIN_EMAILS does not by itself invalidate a token
 * they are already holding: Firebase ID tokens are valid for up to an hour
 * after mint, and this function only ever runs when something calls it, not
 * on every request. That leaves an accepted window of at most an hour
 * between an allowlist edit and it taking effect for a session already in
 * progress. getAuth().revokeRefreshTokens(uid) closes that window
 * immediately if it ever needs to, which is why a demotion below calls it:
 * unlike a promotion (where a few extra minutes of *not yet* being an admin
 * costs nothing), a stale admin claim is the case where the staleness
 * actually matters.
 */
export async function syncAdminRole(uid: string, allowlist: string[]): Promise<boolean> {
  const auth = getAuth();
  const user = await auth.getUser(uid);
  const shouldBeAdmin = isAllowlistedAdmin(user.email, allowlist);
  const wasAdmin = user.customClaims?.admin === true;

  if (shouldBeAdmin === wasAdmin) return shouldBeAdmin;

  // Merge rather than overwrite: other custom claims (there are none of ours
  // yet, but a future feature's) must survive a role sync untouched.
  const claims = { ...(user.customClaims ?? {}) };
  if (shouldBeAdmin) {
    claims.admin = true;
  } else {
    delete claims.admin;
  }
  await auth.setCustomUserClaims(uid, claims);

  if (wasAdmin && !shouldBeAdmin) {
    await auth.revokeRefreshTokens(uid);
  }

  // A merge set rather than update(): syncAdminRole can run before
  // createUserDocument has written anything (e.g. a claim resync ahead of
  // onboarding), and a plain update() would fail on a document that does
  // not exist yet.
  await getFirestore()
    .doc(`users/${uid}`)
    .set({ role: shouldBeAdmin ? "admin" : "student" }, { merge: true });

  return shouldBeAdmin;
}

/**
 * Guards every admin-only callable. Unauthenticated and merely-not-admin are
 * distinct failures so the client can tell "sign in" from "you don't have
 * access" apart.
 */
export function assertAdmin(auth: { token?: Record<string, unknown> } | null | undefined): void {
  if (!auth) {
    throw new HttpsError("unauthenticated", "SIGN IN TO CONTINUE.");
  }
  if (auth.token?.admin !== true) {
    throw new HttpsError("permission-denied", "ADMIN ACCESS REQUIRED.");
  }
}
