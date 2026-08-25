import { getIdToken, onIdTokenChanged } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { useSyncExternalStore } from "react";

import { auth, functions } from "@/lib/firebase";

/**
 * The admin flag is read from the signed ID token's custom claims, never
 * from a Firestore document. A `users/{uid}` document is client-readable and
 * therefore client-tamperable on a rooted device or via the RN debugger —
 * trusting a boolean field on it would let a user grant themselves the
 * dashboard by editing local state. The ID token is signed by Firebase and
 * verified server-side on every callable invocation, so a forged claim is
 * not possible without control of the signing key.
 */
export function isAdminClaims(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  return (value as Record<string, unknown>).admin === true;
}

let isAdmin = false;
let hydrated = false;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

/** Uids already asked the server to sync their claim this app session. Prevents calling `syncAdminRole` again on every token refresh for a user who was already checked. */
const syncedUids = new Set<string>();

/**
 * Fire-and-forget: an admin allowlist check that fails (offline, Functions
 * not deployed, cold-start timeout) must not block sign-in or leave the rest
 * of the app unusable. Every caller of this only cares whether the claim
 * eventually shows up on the token — a `.catch()` that swallows the failure
 * and leaves `isAdmin` at its current (non-admin) value is the correct
 * degradation, not a rejected promise the caller must remember to handle.
 */
export async function syncAdminRole(): Promise<boolean> {
  const user = auth.currentUser;
  if (!user) return false;

  const sync = httpsCallable<Record<string, never>, { admin: boolean }>(functions, "syncAdminRole");
  const result = await sync({});
  // Force a refresh rather than waiting for the SDK's own ~1h token
  // rotation — a role granted just now must take effect this session
  // without asking the user to sign out and back in.
  await getIdToken(user, true);
  return result.data.admin === true;
}

/**
 * `onIdTokenChanged` rather than `onAuthStateChanged`: the latter only fires
 * on sign-in/sign-out, but a custom claim can change on an already-signed-in
 * user (the allowlist sync below forces exactly that) and only a token
 * refresh event carries the new claims. Subscribing to auth state instead
 * would leave `isAdmin` stuck at whatever it was when the user first signed
 * in, even after `syncAdminRole` successfully grants the claim.
 */
onIdTokenChanged(auth, (user) => {
  if (!user) {
    isAdmin = false;
    hydrated = true;
    notify();
    return;
  }

  user
    .getIdTokenResult()
    .then((result) => {
      isAdmin = isAdminClaims(result.claims);
      hydrated = true;
      notify();
    })
    .catch(() => {
      // A token read can fail offline; degrade to non-admin rather than
      // leaving the store in a stale or unhydrated state.
      isAdmin = false;
      hydrated = true;
      notify();
    });

  if (!syncedUids.has(user.uid)) {
    syncedUids.add(user.uid);
    syncAdminRole().catch(() => {
      // See syncAdminRole's own comment: offline or undeployed Functions
      // must not block the rest of the app, so this stays non-admin.
    });
  }
});

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useIsAdmin(): boolean {
  return useSyncExternalStore(subscribe, () => isAdmin);
}

export function useAdminRoleHydrated(): boolean {
  return useSyncExternalStore(subscribe, () => hydrated);
}

export function getIsAdmin(): boolean {
  return isAdmin;
}
