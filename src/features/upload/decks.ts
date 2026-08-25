import { collection, getDocs } from "firebase/firestore";

import {
  backfillDeck,
  deckFromFirestoreDocuments,
  DECK_FIELD,
  expandDeck,
  expandDeckDelete,
  isLocalDeck,
  makeCardId,
  makeDeckId,
} from "@/features/upload/deck-rules";
import type { LocalDeck } from "@/features/upload/types";
import { db } from "@/lib/firebase";
import { createSyncedStore, type SyncedStoreConfig } from "@/lib/sync/store";
import type { CardContent, GameType } from "@/types/cardinal";

async function hydrateRemoteDeck(input: { id: string; data: Record<string, unknown> }): Promise<LocalDeck | null> {
  const cards = await getDocs(collection(db, "decks", input.id, "cards"));
  return deckFromFirestoreDocuments({
    deckId: input.id,
    deck: input.data,
    cards: cards.docs.map((card) => ({ id: card.id, data: card.data() })),
  });
}

const deckSyncConfig: SyncedStoreConfig<LocalDeck> = {
  name: "decks",
  collectionPath: () => "decks",
  pathIsOwnerScoped: false,
  field: DECK_FIELD,
  remoteUpdatedAtField: "updatedAt",
  isValid: isLocalDeck,
  migrateLegacyKey: "cardinal.decks",
  backfill: backfillDeck,
  expand: expandDeck,
  expandDelete: expandDeckDelete,
  hydrateRemote: hydrateRemoteDeck,
};

const store = createSyncedStore<LocalDeck>(deckSyncConfig);

export type SaveDeckInput = Omit<
  LocalDeck,
  "id" | "createdAt" | "updatedAt" | "cards" | "sourceType" | "uploadId"
> & {
  cards: CardContent[];
};

export function useDecks(): LocalDeck[] {
  return store.useRecords();
}

export function useDecksHydrated(): boolean {
  return store.useHydrated();
}

export function getDecks(): LocalDeck[] {
  return store.getRecords();
}

/** Adopts the Function-created deck without echoing it back through the outbox. */
export function adoptRemoteDeck(deck: LocalDeck): void {
  store.adoptRemote(deck, deck.updatedAt);
}

export function decksForCourse(courseId: string): LocalDeck[] {
  return store.getRecords().filter((deck) => deck.courseId === courseId);
}

export function saveDeck(input: SaveDeckInput): LocalDeck {
  const now = Date.now();
  const deck: LocalDeck = {
    ...input,
    id: makeDeckId(),
    cards: input.cards.map((card) => ({ ...card, cardId: makeCardId() })),
    createdAt: now,
    updatedAt: now,
    sourceType: "manual",
    uploadId: null,
  };
  store.put(deck);
  return deck;
}

/**
 * Flattens a deck list's cards for a course, optionally narrowed to one
 * template. Takes the decks rather than reading the snapshot so a caller
 * inside a useMemo can depend on the subscription it already holds — reading
 * module state in there would go stale the moment a save lands.
 */
export function selectCards(
  decks: LocalDeck[],
  courseId: string,
  gameType?: GameType,
): CardContent[] {
  return decks
    .filter((deck) => deck.courseId === courseId)
    .flatMap((deck) => deck.cards)
    .filter((card) => !gameType || card.gameType === gameType);
}

/** The same selection against the current snapshot, for one-shot reads. */
export function cardsForCourse(courseId: string, gameType?: GameType): CardContent[] {
  return selectCards(store.getRecords(), courseId, gameType);
}

/** Moves a deck without rewriting any of its cards. */
export function moveDeckToCourse(id: string, courseId: string): LocalDeck | undefined {
  const deck = store.getRecords().find((candidate) => candidate.id === id);
  if (!deck) return undefined;
  const moved = { ...deck, courseId, updatedAt: Date.now() };
  store.put(moved);
  return moved;
}

/** Deletes every deck owned by a course and returns the deleted ids. */
export function deleteDecksForCourse(courseId: string): string[] {
  const ids = store.getRecords()
    .filter((deck) => deck.courseId === courseId)
    .map((deck) => deck.id);
  ids.forEach((id) => store.remove(id));
  return ids;
}
