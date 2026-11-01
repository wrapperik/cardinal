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
      uxMode: "legacy",
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

describe("uxMode", () => {
  it("accepts records written before the choice existed", () => {
    expect(isPreferencesRecord({
      id: "settings",
      hapticsEnabled: true,
      dailyReminderEnabled: false,
      reminderTime: "19:30",
      updatedAt: 1_000,
    })).toBe(true);
  });

  it("accepts both modes and rejects anything else", () => {
    expect(isPreferencesRecord(preferences({ uxMode: "legacy" }))).toBe(true);
    expect(isPreferencesRecord(preferences({ uxMode: "traditional" }))).toBe(true);
    expect(isPreferencesRecord({ ...preferences(), uxMode: "other" })).toBe(false);
  });

  it("defaults to legacy", () => {
    expect(DEFAULT_PREFERENCES.uxMode).toBe("legacy");
  });
});

describe("liquidGlass", () => {
  it("accepts records written before the toggle existed", () => {
    const { liquidGlass: _omitted, ...older } = preferences();
    expect(isPreferencesRecord(older)).toBe(true);
  });

  it("accepts booleans only", () => {
    expect(isPreferencesRecord(preferences({ liquidGlass: false }))).toBe(true);
    expect(isPreferencesRecord({ ...preferences(), liquidGlass: "yes" })).toBe(false);
  });

  it("defaults to on", () => {
    expect(DEFAULT_PREFERENCES.liquidGlass).toBe(true);
  });
});

describe("syncStatusLabel", () => {
  it("keeps settings copy aligned with the actual store state", () => {
    expect(syncStatusLabel("synced")).toBe("SYNCED");
    expect(syncStatusLabel("syncing")).toBe("SYNCING");
    expect(syncStatusLabel("offline")).toBe("OFFLINE");
  });
});
