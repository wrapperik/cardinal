import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";

import type { LocalDeck } from "@/features/upload/types";
import type { CardContent, GameType } from "@/types/cardinal";

const STORAGE_KEY = "cardinal.decks";

/**
 * A module-level store rather than a context, for the same reason as
 * src/features/upload/courses.ts — decks are read from the home screen and
 * every game template, and there is nothing to seed here since a fresh
 * install simply has no uploads yet.
 */
let snapshot: LocalDeck[] = [];

const listeners = new Set<() => void>();

function commit(next: LocalDeck[]) {
  snapshot = next;
  listeners.forEach((l) => l());
  // Fire-and-forget: a failed write costs the player a deck next launch,
  // which is not worth interrupting the save flow over.
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return snapshot;
}

// Hydrate once at import. Anything already rendered re-renders when it lands;
// until then every screen just shows no decks, which is the correct
// fallback rather than a loading state.
AsyncStorage.getItem(STORAGE_KEY)
  .then((raw) => {
    if (!raw) return;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    snapshot = parsed as LocalDeck[];
    listeners.forEach((l) => l());
  })
  .catch(() => {});

export function useDecks(): LocalDeck[] {
  return useSyncExternalStore(subscribe, getSnapshot);
}

export function getDecks(): LocalDeck[] {
  return snapshot;
}

export function decksForCourse(courseId: string): LocalDeck[] {
  return snapshot.filter((deck) => deck.courseId === courseId);
}

/**
 * Not a slug of anything user-visible — unlike course ids, nobody reads a
 * deck id — so a timestamp plus a random tail is enough to keep two saves in
 * the same millisecond apart.
 */
function makeDeckId(): string {
  return `deck-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function saveDeck(input: Omit<LocalDeck, "id" | "createdAt">): LocalDeck {
  const deck: LocalDeck = {
    ...input,
    id: makeDeckId(),
    createdAt: Date.now(),
  };
  commit([...snapshot, deck]);
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
  return selectCards(snapshot, courseId, gameType);
}
