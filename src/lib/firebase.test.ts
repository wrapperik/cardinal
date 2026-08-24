import { afterEach, describe, expect, it, vi } from "vitest";

const firebase = vi.hoisted(() => ({
  connectAuthEmulator: vi.fn(),
  connectFirestoreEmulator: vi.fn(),
  connectStorageEmulator: vi.fn(),
}));

vi.mock("firebase/app", () => ({
  getApp: vi.fn(() => ({})),
  getApps: vi.fn(() => []),
  initializeApp: vi.fn(() => ({})),
}));
vi.mock("firebase/auth", () => ({
  connectAuthEmulator: firebase.connectAuthEmulator,
  getAuth: vi.fn(() => ({})),
}));
vi.mock("firebase/firestore", () => ({
  connectFirestoreEmulator: firebase.connectFirestoreEmulator,
  getFirestore: vi.fn(() => ({})),
}));
vi.mock("firebase/storage", () => ({
  connectStorageEmulator: firebase.connectStorageEmulator,
  getStorage: vi.fn(() => ({})),
}));

type FirebaseGlobal = typeof globalThis & { __cardinalEmulatorsConnected?: boolean };

async function loadFirebaseWith(value: string | undefined) {
  vi.resetModules();
  delete (globalThis as FirebaseGlobal).__cardinalEmulatorsConnected;
  if (value === undefined) delete process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATOR;
  else process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATOR = value;
  await import("./firebase");
}

afterEach(() => {
  delete process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATOR;
  delete (globalThis as FirebaseGlobal).__cardinalEmulatorsConnected;
  vi.clearAllMocks();
});

describe("Firebase emulator selection", () => {
  it("keeps the production backend selected when the flag is false", async () => {
    await loadFirebaseWith("false");

    expect(firebase.connectFirestoreEmulator).not.toHaveBeenCalled();
    expect(firebase.connectStorageEmulator).not.toHaveBeenCalled();
    expect(firebase.connectAuthEmulator).not.toHaveBeenCalled();
  });

  it("connects the local services when the flag is 1", async () => {
    await loadFirebaseWith("1");

    expect(firebase.connectFirestoreEmulator).toHaveBeenCalledOnce();
    expect(firebase.connectStorageEmulator).toHaveBeenCalledOnce();
    expect(firebase.connectAuthEmulator).toHaveBeenCalledOnce();
  });
});
