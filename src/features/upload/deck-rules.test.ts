import { describe, expect, it, vi } from "vitest";

import { backfillDeck, expandDeck } from "./deck-rules";
import { saveDeck } from "./decks";
import type { LocalDeck } from "./types";
import { createSyncedStore } from "@/lib/sync/store";
import type { CardContent } from "@/types/cardinal";

const platform = vi.hoisted(() => {
  const values = new Map<string, string>();
  const authListeners: ((user: { uid: string } | null) => void)[] = [];
  return {
    values,
    authListeners,
    getItem: vi.fn(async (key: string) => values.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      values.set(key, value);
    }),
  };
});

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: platform.getItem, setItem: platform.setItem },
}));

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: vi.fn((_auth, listener: (user: { uid: string } | null) => void) => {
    platform.authListeners.push(listener);
    return vi.fn();
  }),
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn(),
  onSnapshot: vi.fn(() => vi.fn()),
  query: vi.fn(),
  serverTimestamp: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  where: vi.fn(),
}));

vi.mock("@/lib/firebase", () => ({ auth: {}, db: {} }));

const extractedCards: CardContent[] = [
  {
    gameType: "compassQuiz",
    difficulty: 2,
    payload: { question: "What is a cell?", choices: ["A", "B", "C"], correctIndex: 0 },
  },
  {
    gameType: "trueFalseDuel",
    difficulty: 1,
    payload: { statement: "Cells divide.", isTrue: true },
  },
];

function validDeck(overrides: Partial<LocalDeck> = {}): LocalDeck {
  return {
    id: "deck-1",
    courseId: "biology",
    title: "CELLS",
    sourceName: "cells.pdf",
    cards: extractedCards.map((card, index) => ({ ...card, cardId: `card-${index + 1}` })),
    createdAt: 10,
    updatedAt: 10,
    provider: "mock",
    sourceType: "manual",
    uploadId: null,
    ...overrides,
  };
}

describe("deck local behavior", () => {
  it("gives every extracted card a distinct permanent id when saving a deck", () => {
    const deck = saveDeck({
      courseId: "biology",
      title: "CELLS",
      sourceName: "cells.pdf",
      cards: extractedCards,
      provider: "mock",
    });

    const cardIds = deck.cards.map((card) => card.cardId);
    expect(cardIds).toEqual([expect.stringMatching(/^card-/), expect.stringMatching(/^card-/)]);
    expect(new Set(cardIds).size).toBe(2);
  });
});

describe("backfillDeck", () => {
  it("keeps existing card ids while assigning ids only to legacy cards", () => {
    const result = backfillDeck({
      ...validDeck(),
      cards: [
        validDeck().cards[0],
        { ...extractedCards[1] },
      ],
    }) as LocalDeck;

    expect(result.cards[0].cardId).toBe("card-1");
    expect(result.cards[1].cardId).toMatch(/^card-/);
    expect(result.cards[1].cardId).not.toBe("card-1");
  });

  it("marks legacy decks as manual with no upload provenance", () => {
    const result = backfillDeck({
      ...validDeck(),
      sourceType: undefined,
      uploadId: undefined,
    }) as LocalDeck & { sourceType: string; uploadId: string | null };

    expect(result.sourceType).toBe("manual");
    expect(result.uploadId).toBeNull();
  });
});

describe("expandDeck", () => {
  it("writes a canonical upload deck's real provenance", () => {
    const deck = {
      ...validDeck(),
      sourceType: "upload" as const,
      uploadId: "upload-1",
    } as LocalDeck & { sourceType: "upload"; uploadId: string };

    const [operation] = expandDeck(deck, "owner-1", {});

    expect(operation.payload.sourceType).toBe("upload");
    expect(operation.payload.uploadId).toBe("upload-1");
  });
});

describe("createSyncedStore backfill", () => {
  it("persists a changed hydrated record before it can be lost on restart", async () => {
    platform.values.clear();
    platform.getItem.mockClear();
    platform.setItem.mockClear();
    platform.values.set("cardinal.user-1.hydration", JSON.stringify([{ id: "record-1" }]));

    const store = createSyncedStore<{ id: string; recovered: boolean }>({
      name: "hydration",
      collectionPath: () => "records",
      pathIsOwnerScoped: false,
      field: { idField: "recordId", ownerIdField: "ownerId", timestampFields: [] },
      remoteUpdatedAtField: "updatedAt",
      isValid: (value): value is { id: string; recovered: boolean } =>
        !!value && typeof value === "object" && "id" in value && "recovered" in value,
      backfill: (value) => ({ ...(value as { id: string }), recovered: true }),
    });

    platform.authListeners.at(-1)?.({ uid: "user-1" });
    await Promise.resolve();
    await Promise.resolve();

    expect(store.getRecords()).toEqual([{ id: "record-1", recovered: true }]);
    expect(platform.setItem).toHaveBeenCalledWith(
      "cardinal.user-1.hydration",
      JSON.stringify([{ id: "record-1", recovered: true }]),
    );
  });

  it("adopts a server-confirmed record without creating an outbox write", async () => {
    platform.values.clear();
    platform.setItem.mockClear();

    const store = createSyncedStore<{ id: string; updatedAt: number }>({
      name: "remote-adoption",
      collectionPath: () => "records",
      pathIsOwnerScoped: false,
      field: { idField: "recordId", ownerIdField: "ownerId", timestampFields: ["updatedAt"] },
      remoteUpdatedAtField: "updatedAt",
      isValid: (value): value is { id: string; updatedAt: number } =>
        !!value && typeof value === "object" && "id" in value && "updatedAt" in value,
    });

    platform.authListeners.at(-1)?.({ uid: "user-1" });
    await Promise.resolve();
    await Promise.resolve();

    store.adoptRemote({ id: "deck-server", updatedAt: 20 }, 20);

    expect(store.getRecords()).toEqual([{ id: "deck-server", updatedAt: 20 }]);
    expect(platform.setItem).toHaveBeenCalledWith(
      "cardinal.user-1.remote-adoption",
      JSON.stringify([{ id: "deck-server", updatedAt: 20 }]),
    );
  });
});
