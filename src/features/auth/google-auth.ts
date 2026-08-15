import type { User } from "firebase/auth";

/** TypeScript fallback. Expo selects google-auth.web/native at runtime. */
export async function startGoogleSignIn(): Promise<User | null> {
  throw { code: "auth/google-not-configured" };
}

export async function finishGoogleRedirect(): Promise<User | null> {
  return null;
}
