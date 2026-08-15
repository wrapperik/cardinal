import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

import { finishGoogleRedirect, startGoogleSignIn } from "@/features/auth/google-auth";
import { auth, db } from "@/lib/firebase";

const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

async function createUserDocument(user: User): Promise<void> {
  const reference = doc(db, "users", user.uid);
  if ((await getDoc(reference)).exists()) return;

  await setDoc(reference, {
    displayName: user.displayName ?? "Student",
    email: user.email ?? "",
    streak: 0,
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

export async function signInWithGoogle(): Promise<User | null> {
  if (!googleWebClientId) {
    throw { code: "auth/google-not-configured" };
  }

  const user = await startGoogleSignIn();
  if (!user) return null;
  await createUserDocument(user);
  return user;
}

export async function completeGoogleRedirect(): Promise<User | null> {
  const user = await finishGoogleRedirect();
  if (!user) return null;
  await createUserDocument(user);
  return user;
}

export async function resetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email.trim());
}

export async function signOutUser(): Promise<void> {
  await signOut(auth);
}
