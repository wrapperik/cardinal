import { describe, expect, it, vi } from "vitest";

import { createSyncedStore, type SyncedStoreConfig } from "./store";

const platform = vi.hoisted(() => {
  Object.defineProperty(globalThis, "window", { value: {}, configurable: true });
  return {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
  };
});

const firestore = vi.hoisted(() => ({
  onSnapshot: vi.fn(
    (_query: unknown, listener: (snapshot: { docs: { id: string; data: () => Record<string, unknown> }[] }) => void) => {
      void Promise.resolve().then(() =>
        listener({
          docs: [
            {
              id: "deck-cloud",
              data: () => ({
                deckId: "deck-cloud",
                ownerId: "owner-1",
                courseId: "physics",
                title: "NEWTON'S SECOND LAW",
                updatedAt: 20,
              }),
            },
          ],
        }),
      );
      return vi.fn();
    },
  ),
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: platform.getItem, setItem: platform.setItem },
}));

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: vi.fn((_auth, listener: (user: { uid: string }) => void) => {
    listener({ uid: "owner-1" });
    return vi.fn();
  }),
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn(),
  onSnapshot: firestore.onSnapshot,
  query: vi.fn(),
  serverTimestamp: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  where: vi.fn(),
}));

vi.mock("@/lib/firebase", () => ({ auth: {}, db: {} }));

interface Deck {
  id: string;
  title: string;
  updatedAt: number;
  cards: string[];
}

describe("createSyncedStore remote hydration", () => {
  it("exposes when its first local snapshot is ready for rendering", async () => {
    const store = createSyncedStore<{ id: string; updatedAt: number }>({
      name: "hydration-state",
      collectionPath: () => "records",
      pathIsOwnerScoped: false,
      field: { idField: "recordId", ownerIdField: "ownerId", timestampFields: ["updatedAt"] },
      remoteUpdatedAtField: "updatedAt",
      isValid: (value): value is { id: string; updatedAt: number } =>
        !!value && typeof value === "object" && "id" in value && "updatedAt" in value,
    });

    expect(store.isHydrated()).toBe(false);
    await vi.waitFor(() => expect(store.isHydrated()).toBe(true));
  });

  it("adopts a cloud record after the store fills its child data", async () => {
    const config: SyncedStoreConfig<Deck> & {
      hydrateRemote: (input: { id: string; data: Record<string, unknown> }) => Promise<Deck | null>;
    } = {
      name: "decks",
      collectionPath: () => "decks",
      pathIsOwnerScoped: false,
      field: {
        idField: "deckId",
        ownerIdField: "ownerId",
        timestampFields: ["updatedAt"],
      },
      remoteUpdatedAtField: "updatedAt",
      isValid: (value): value is Deck =>
        !!value &&
        typeof value === "object" &&
        Array.isArray((value as Partial<Deck>).cards) &&
        (value as Partial<Deck>).cards?.length === 2,
      hydrateRemote: async ({ id, data }) => ({
        id,
        title: String(data.title),
        updatedAt: 20,
        cards: ["card-1", "card-2"],
      }),
    };
    const store = createSyncedStore(config);

    await vi.waitFor(() => {
      expect(store.getRecords()).toEqual([
        {
          id: "deck-cloud",
          title: "NEWTON'S SECOND LAW",
          updatedAt: 20,
          cards: ["card-1", "card-2"],
        },
      ]);
    });
  });
});
