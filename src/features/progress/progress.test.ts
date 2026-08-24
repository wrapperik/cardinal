import { describe, expect, it, vi } from "vitest";

import { toFirestorePayload } from "@/lib/sync/adapter";

import { PROGRESS_FIELD, isProgressRecord, type ProgressRecord } from "./progress";

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

function progress(overrides: Partial<ProgressRecord> = {}): ProgressRecord {
  return {
    id: "card-1",
    deckId: "deck-1",
    easeFactor: 2.5,
    interval: 6,
    repetitions: 2,
    lapses: 0,
    dueDate: 10_000,
    lastReviewedAt: 1_000,
    lastQuality: 5,
    ...overrides,
  };
}

describe("progress sync config", () => {
  it("writes a card-scoped document with Firestore timestamps and no owner field", () => {
    const payload = toFirestorePayload(progress(), "set", "user-1", PROGRESS_FIELD);

    expect(payload.cardId).toBe("card-1");
    expect(payload.ownerId).toBeUndefined();
    expect(payload.dueDate).toEqual(new Date(10_000));
    expect(payload.lastReviewedAt).toEqual(new Date(1_000));
  });

  it("accepts only complete schedules that satisfy the progress rules", () => {
    expect(isProgressRecord(progress())).toBe(true);
    expect(isProgressRecord(progress({ easeFactor: 1.2 }))).toBe(false);
    expect(isProgressRecord(progress({ lastQuality: 6 as 5 }))).toBe(false);
  });
});
