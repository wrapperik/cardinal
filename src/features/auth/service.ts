import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

import type { UserDoc } from "@/types/cardinal";

import { auth, db } from "@/lib/firebase";

async function createUserDocument(user: User): Promise<void> {
  const reference = doc(db, "users", user.uid);
  if ((await getDoc(reference)).exists()) return;

  // Typed against UserDoc so the schema is enforced here rather than merely
  // documented. The two timestamp fields are excluded because serverTimestamp()
  // resolves to a FieldValue on write and a Timestamp only on read back.
  const profile: Omit<UserDoc, "createdAt" | "lastStudiedDate"> = {
    userId: user.uid,
    displayName: user.displayName ?? "Student",
    email: user.email ?? "",
    photoURL: user.photoURL,
    currentStreak: 0,
    longestStreak: 0,
    // The document is only ever created after onboarding, since routing sends a
    // first-time user through it before sign-up. The AsyncStorage flag remains
    // the authority on device until streaks are synced.
    onboardingComplete: true,
  };

  await setDoc(reference, {
    ...profile,
    lastStudiedDate: null,
    createdAt: serverTimestamp(),
  });
}

export async function createEmailAccount(
  name: string,
  email: string,
  password: string,
): Promise<User> {
  const result = await createUserWithEmailAndPassword(
    auth,
    email.trim(),
    password,
  );
  await updateProfile(result.user, { displayName: name.trim() });
  await createUserDocument(result.user);
  return result.user;
}

export async function signInWithEmail(
  email: string,
  password: string,
): Promise<User> {
  return (await signInWithEmailAndPassword(auth, email.trim(), password)).user;
}

export async function resetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email.trim());
}

export async function signOutUser(): Promise<void> {
  await signOut(auth);
}
