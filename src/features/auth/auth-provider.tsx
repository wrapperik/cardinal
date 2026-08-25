import { onAuthStateChanged, type User } from "firebase/auth";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

import { auth } from "@/lib/firebase";
import {
  clearOnboardingComplete,
  getOnboardingComplete,
  setOnboardingComplete,
} from "@/features/auth/onboarding";
import {
  createEmailAccount,
  changeCurrentUserPassword,
  deleteCurrentAccount,
  resetPassword,
  signInWithEmail,
  signOutUser,
  updateCurrentUserName,
} from "@/features/auth/service";

interface AuthContextValue {
  user: User | null;
  initializing: boolean;
  onboarded: boolean | null;
  completeOnboarding: () => Promise<void>;
  signUp: typeof createEmailAccount;
  signIn: typeof signInWithEmail;
  sendPasswordReset: typeof resetPassword;
  signOutUser: typeof signOutUser;
  deleteAccount: typeof deleteCurrentAccount;
  updateName: typeof updateCurrentUserName;
  changePassword: typeof changeCurrentUserPassword;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    getOnboardingComplete().then(setOnboarded);
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
    });
  }, []);

  const completeOnboarding = useCallback(async () => {
    await setOnboardingComplete();
    setOnboarded(true);
  }, []);

  // Update the local session immediately. Firebase will emit the same state
  // shortly afterwards, but waiting for that event left the route guard with a
  // brief unauthenticated window after submitting either auth form.
  const signUp = useCallback(async (...args: Parameters<typeof createEmailAccount>) => {
    const nextUser = await createEmailAccount(...args);
    setUser(nextUser);
    return nextUser;
  }, []);

  const signIn = useCallback(async (...args: Parameters<typeof signInWithEmail>) => {
    const nextUser = await signInWithEmail(...args);
    setUser(nextUser);
    return nextUser;
  }, []);

  // Same reasoning as signIn/signUp, mirrored: clearing the session here rather
  // than waiting for Firebase's event closes the window where a signed-out user
  // is still looking at a protected screen. The onboarding flag is cleared, and
  // onboarded set false, before user is set null: that way the guard never sees
  // the intermediate signed-out-but-onboarded state, which would otherwise
  // bounce the user through /sign-in for a frame on the way back to onboarding.
  const signOutNow = useCallback(async () => {
    await signOutUser();
    await clearOnboardingComplete();
    setOnboarded(false);
    setUser(null);
  }, []);

  const deleteAccount = useCallback(async () => {
    await deleteCurrentAccount();
    await clearOnboardingComplete();
    setOnboarded(false);
    setUser(null);
  }, []);

  const updateName = useCallback(async (name: string) => {
    await updateCurrentUserName(name);
  }, []);

  const changePassword = useCallback(async (currentPassword: string, nextPassword: string) => {
    await changeCurrentUserPassword(currentPassword, nextPassword);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      initializing: !authReady || onboarded === null,
      onboarded,
      completeOnboarding,
      signUp,
      signIn,
      sendPasswordReset: resetPassword,
      deleteAccount,
      updateName,
      changePassword,
      signOutUser: signOutNow,
    }),
    [
      authReady,
      completeOnboarding,
      changePassword,
      deleteAccount,
      onboarded,
      signIn,
      signOutNow,
      signUp,
      updateName,
      user,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
