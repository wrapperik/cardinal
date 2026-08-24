import {
  backfillDeck,
  DECK_FIELD,
  expandDeck,
  isLocalDeck,
  makeCardId,
  makeDeckId,
} from "@/features/upload/deck-rules";
import type { LocalDeck } from "@/features/upload/types";
import { createSyncedStore, type SyncedStoreConfig } from "@/lib/sync/store";
import type { CardContent, GameType } from "@/types/cardinal";

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
};

const store = createSyncedStore<LocalDeck>(deckSyncConfig);

export type SaveDeckInput = Omit<LocalDeck, "id" | "createdAt" | "updatedAt" | "cards"> & {
  cards: CardContent[];
};

export function useDecks(): LocalDeck[] {
  return store.useRecords();
}

export function getDecks(): LocalDeck[] {
  return store.getRecords();
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
