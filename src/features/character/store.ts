import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";

import { characterById, DEFAULT_CHARACTER_ID } from "@/features/character/roster";

const STORAGE_KEY = "cardinal.character";

interface CharacterState {
  equippedId: string;
  /** Every character the player owns. The default is owned from the start. */
  claimed: string[];
}

/**
 * A module-level store rather than a context: the equipped character is read
 * by home and by every game screen, and threading a provider through the
 * router's layout to share one string is more plumbing than it is worth.
 *
 * `snapshot` is rebuilt only when something actually changes, because
 * useSyncExternalStore compares snapshots by identity — returning a fresh
 * object each read would spin the render loop forever.
 */
let snapshot: CharacterState = {
  equippedId: DEFAULT_CHARACTER_ID,
  claimed: [DEFAULT_CHARACTER_ID],
};

const listeners = new Set<() => void>();

function commit(next: CharacterState) {
  snapshot = next;
  listeners.forEach((l) => l());
  // Fire-and-forget: a failed write costs the player their selection next
  // launch, which is not worth interrupting the interaction over.
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
// until then every screen just shows the default, which is the correct
// fallback rather than a loading state.
AsyncStorage.getItem(STORAGE_KEY)
  .then((raw) => {
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<CharacterState>;
    const claimed = Array.isArray(parsed.claimed)
      ? parsed.claimed.filter((id) => id === characterById(id).id)
      : [DEFAULT_CHARACTER_ID];
    if (!claimed.includes(DEFAULT_CHARACTER_ID)) claimed.push(DEFAULT_CHARACTER_ID);
    const equippedId =
      typeof parsed.equippedId === "string" && claimed.includes(parsed.equippedId)
        ? parsed.equippedId
        : DEFAULT_CHARACTER_ID;
    snapshot = { equippedId, claimed };
    listeners.forEach((l) => l());
  })
  .catch(() => {});

export function useCharacter() {
  return useSyncExternalStore(subscribe, getSnapshot);
}

/** Claims a character if it is claimable, and equips it. Locked ones no-op. */
export function claimAndEquip(id: string) {
  const character = characterById(id);
  if (character.locked) return;
  const claimed = snapshot.claimed.includes(id)
    ? snapshot.claimed
    : [...snapshot.claimed, id];
  commit({ equippedId: id, claimed });
}
