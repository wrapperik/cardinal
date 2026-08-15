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
  getOnboardingComplete,
  setOnboardingComplete,
} from "@/features/auth/onboarding";
import {
  createEmailAccount,
  completeGoogleRedirect,
  resetPassword,
  signInWithEmail,
  signInWithGoogle,
  signOutUser,
} from "@/features/auth/service";

interface AuthContextValue {
  user: User | null;
  initializing: boolean;
  onboarded: boolean | null;
  completeOnboarding: () => Promise<void>;
  signUp: typeof createEmailAccount;
  signIn: typeof signInWithEmail;
  signInWithGoogle: typeof signInWithGoogle;
  sendPasswordReset: typeof resetPassword;
  signOutUser: typeof signOutUser;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    getOnboardingComplete().then(setOnboarded);
    completeGoogleRedirect().catch(() => {
      // The form will surface any user-triggered sign-in error on its next attempt.
    });
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

  const signInWithGoogleNow = useCallback(
    async (...args: Parameters<typeof signInWithGoogle>) => {
      const nextUser = await signInWithGoogle(...args);
      if (nextUser) setUser(nextUser);
      return nextUser;
    },
    [],
  );

  // Same reasoning as signIn/signUp, mirrored: clearing the session here rather
  // than waiting for Firebase's event closes the window where a signed-out user
  // is still looking at a protected screen.
  const signOutNow = useCallback(async () => {
    await signOutUser();
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      initializing: !authReady || onboarded === null,
      onboarded,
      completeOnboarding,
      signUp,
      signIn,
      signInWithGoogle: signInWithGoogleNow,
      sendPasswordReset: resetPassword,
      signOutUser: signOutNow,
    }),
    [
      authReady,
      completeOnboarding,
      onboarded,
      signIn,
      signInWithGoogleNow,
      signOutNow,
      signUp,
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
