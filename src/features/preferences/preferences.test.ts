import { describe, expect, it, vi } from "vitest";

import { toFirestorePayload } from "@/lib/sync/adapter";

import {
  DEFAULT_PREFERENCES,
  PREFERENCES_FIELD,
  isPreferencesRecord,
  syncStatusLabel,
  type PreferencesRecord,
} from "./preferences";

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: vi.fn(), setItem: vi.fn() },
}));
vi.mock("firebase/auth", () => ({ onAuthStateChanged: vi.fn(() => vi.fn()) }));
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn(),
  onSnapshot: vi.fn(),
  query: vi.fn(),
  serverTimestamp: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  where: vi.fn(),
}));
vi.mock("@/lib/firebase", () => ({ auth: {}, db: {} }));

function preferences(overrides: Partial<PreferencesRecord> = {}): PreferencesRecord {
  return {
    id: "settings",
    ...DEFAULT_PREFERENCES,
    updatedAt: 1_000,
    ...overrides,
  };
}

describe("preferences sync config", () => {
  it("writes the fixed settings document with its owner and a server refresh time", () => {
    const payload = toFirestorePayload(preferences(), "set", "user-1", PREFERENCES_FIELD);

    expect(payload).toMatchObject({
      userId: "user-1",
      hapticsEnabled: true,
      dailyReminderEnabled: false,
      reminderTime: "19:30",
    });
    expect(payload.updatedAt).toBeDefined();
  });

  it("accepts complete preferences and rejects a malformed reminder time", () => {
    expect(isPreferencesRecord(preferences())).toBe(true);
    expect(isPreferencesRecord(preferences({ reminderTime: "7pm" }))).toBe(false);
  });

  it("accepts legacy records without retired tap-zone and theme fields", () => {
    expect(isPreferencesRecord({
      id: "settings",
      hapticsEnabled: true,
      dailyReminderEnabled: false,
      reminderTime: "19:30",
      updatedAt: 1_000,
    })).toBe(true);
  });
});

describe("syncStatusLabel", () => {
  it("keeps settings copy aligned with the actual store state", () => {
    expect(syncStatusLabel("synced")).toBe("SYNCED");
    expect(syncStatusLabel("syncing")).toBe("SYNCING");
    expect(syncStatusLabel("offline")).toBe("OFFLINE");
  });
});
