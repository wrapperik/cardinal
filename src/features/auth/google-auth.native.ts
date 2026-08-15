import Constants, { ExecutionEnvironment } from "expo-constants";
import {
  GoogleAuthProvider,
  signInWithCredential,
  type User,
} from "firebase/auth";
import { Platform } from "react-native";

import { auth } from "@/lib/firebase";

type GoogleSigninModule = typeof import("@react-native-google-signin/google-signin");

const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

/**
 * Google Sign-In is a native module, so it is missing from Expo Go's prebuilt
 * binary. Its entry point calls TurboModuleRegistry.getEnforcing() at import
 * time, which threw while the root layout was still evaluating and took the
 * whole app down instead of just this one button. Requiring it lazily keeps the
 * crash contained to the sign-in attempt, and the check below turns that into a
 * readable message.
 */
const isExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

let cached: GoogleSigninModule["GoogleSignin"] | null = null;

function getGoogleSignin() {
  if (!cached) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { GoogleSignin } = require("@react-native-google-signin/google-signin") as GoogleSigninModule;
    GoogleSignin.configure({
      webClientId: googleWebClientId,
      iosClientId: googleIosClientId,
    });
    cached = GoogleSignin;
  }

  return cached;
}

export async function signInWithNativeGoogle(): Promise<User | null> {
  if (!googleWebClientId) throw { code: "auth/google-not-configured" };
  if (isExpoGo) throw { code: "auth/google-needs-dev-build" };

  const GoogleSignin = getGoogleSignin();

  if (Platform.OS === "android") {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  }

  const response = await GoogleSignin.signIn();
  if (response.type === "cancelled") return null;
  if (!response.data.idToken) throw { code: "auth/google-missing-token" };

  const credential = GoogleAuthProvider.credential(response.data.idToken);
  return (await signInWithCredential(auth, credential)).user;
}

export const startGoogleSignIn = signInWithNativeGoogle;

export async function finishGoogleRedirect(): Promise<User | null> {
  return null;
}
