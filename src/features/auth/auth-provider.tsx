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
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
    });
  }, []);

  const completeOnboarding = useCallback(async () => {
    await setOnboardingComplete();
    setOnboarded(true);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      initializing: !authReady || onboarded === null,
      onboarded,
      completeOnboarding,
      signUp: createEmailAccount,
      signIn: signInWithEmail,
      signInWithGoogle,
      sendPasswordReset: resetPassword,
      signOutUser,
    }),
    [authReady, completeOnboarding, onboarded, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
