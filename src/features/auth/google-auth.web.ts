import {
  GoogleAuthProvider,
  getRedirectResult,
  signInWithRedirect,
  type User,
} from "firebase/auth";

import { auth } from "@/lib/firebase";

export async function startGoogleSignIn(): Promise<User | null> {
  await signInWithRedirect(auth, new GoogleAuthProvider());
  return null;
}

/** Completes a browser redirect after Google returns the user to Cardinal. */
export async function finishGoogleRedirect(): Promise<User | null> {
  return (await getRedirectResult(auth))?.user ?? null;
}
