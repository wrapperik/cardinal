import {
  EmailAuthProvider,
  createUserWithEmailAndPassword,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  updateProfile,
  type User,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

import type { UserDoc } from "@/types/cardinal";

import { auth, db, functions } from "@/lib/firebase";

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
    // firestore.rules pins account creation to this value regardless — set it
    // explicitly anyway so the written document matches UserDoc's shape from
    // its first write instead of relying on the rule's default to fill it in.
    role: "student",
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

/** Calls the Admin-backed erasure routine; clients cannot safely erase seeded data or deck subcollections themselves. */
export async function deleteCurrentAccount(): Promise<void> {
  if (!auth.currentUser) throw new Error("NO_SIGNED_IN_USER");
  const removeAccount = httpsCallable<{ confirmation: "DELETE" }, { deleted: boolean }>(functions, "deleteAccount");
  await removeAccount({ confirmation: "DELETE" });
  // The Admin SDK revokes the identity remotely; signing out locally makes the
  // route change immediate instead of waiting for the next token refresh.
  await signOut(auth).catch(() => {});
}

export async function updateCurrentUserName(name: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("NO_SIGNED_IN_USER");

  const displayName = name.trim();
  await updateProfile(user, { displayName });
  await updateDoc(doc(db, "users", user.uid), { displayName });
}

/** Firebase requires a recent credential before a sensitive password update. */
export async function changeCurrentUserPassword(currentPassword: string, nextPassword: string): Promise<void> {
  const user = auth.currentUser;
  if (!user?.email) throw new Error("NO_PASSWORD_ACCOUNT");

  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, credential);
  await updatePassword(user, nextPassword);
}
