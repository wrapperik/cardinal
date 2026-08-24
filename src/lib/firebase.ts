import { getApp, getApps, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectStorageEmulator, getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

/** Web/SSR-safe defaults. Native persistence is configured in firebase.native.ts. */
export const auth = getAuth(app);
export const db = getFirestore(app);

export const storage = getStorage(app);

/**
 * Editing this file re-executes it under Fast Refresh, but each
 * connect*Emulator call is one-shot: calling it again once the instance has
 * made a network call throws. A module-level boolean would not survive
 * that — Fast Refresh resets this module's top-level state along with
 * everything else in it — so the guard lives on globalThis instead, which
 * is untouched by re-evaluating this module. The try/catch is a second line
 * of defence for a full reload, where globalThis itself is reset and the
 * connect calls race whatever else in the app first touches auth/db;
 * it swallows only the "already" error so a genuine misconfiguration still
 * surfaces.
 */
type CardinalGlobal = typeof globalThis & {
  __cardinalEmulatorsConnected?: boolean;
};
const cardinalGlobal = globalThis as CardinalGlobal;

if (process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATOR && !cardinalGlobal.__cardinalEmulatorsConnected) {
  const host = process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST || 'localhost';
  try {
    connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, host, 8080);
    connectStorageEmulator(storage, host, 9199);
  } catch (error) {
    if (!(error instanceof Error) || !/already/i.test(error.message)) throw error;
  }
  cardinalGlobal.__cardinalEmulatorsConnected = true;
}

export default app;
