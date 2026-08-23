/**
 * Pure aggregation over a course's cards: how many, which games they play,
 * and which topics they cover. No React Native imports on purpose — exercised
 * directly by vitest under node, same reasoning as course-rules.ts.
 */

import type { LocalDeck } from "@/features/upload/types";
import type { GameType } from "@/types/cardinal";

/**
 * Declaration order, not first-seen order — `gameTypes` is sorted against
 * this so the UI does not reorder itself every time a card of a new template
 * gets added to a course.
 *
 * Exported because the recap plan orders cards by this exact same sequence
 * within a topic — a second, independently-declared copy of this order would
 * only need to drift once for a recap leg to stop matching what the home
 * screen calls "next".
 */
export const GAME_TYPE_ORDER: readonly GameType[] = [
  "compassQuiz",
  "trueFalseDuel",
  "sequenceSwipe",
  "matchRelease",
];

export interface CourseStats {
  cardCount: number;
  /** Distinct game types present, in canonical GameType declaration order. */
  gameTypes: GameType[];
  /** Distinct topics present, in first-seen order. */
  topics: string[];
}

/**
 * Takes `decks` as a parameter rather than reading the module snapshot, for
 * the same reason as `selectCards` in decks.ts — so a caller inside a
 * useMemo can depend on the subscription it already holds instead of going
 * stale the moment a save lands.
 */
export function courseStats(decks: LocalDeck[], courseId: string): CourseStats {
  const cards = decks
    .filter((deck) => deck.courseId === courseId)
    .flatMap((deck) => deck.cards);

  const presentGameTypes = new Set(cards.map((card) => card.gameType));
  const gameTypes = GAME_TYPE_ORDER.filter((gameType) => presentGameTypes.has(gameType));

  // First-seen order is meaningful here, unlike gameTypes above: it reflects
  // the order the material was covered, so a Set (insertion-ordered) is
  // exactly right rather than something to sort away.
  const topics = [...new Set(cards.map((card) => card.topic).filter((topic): topic is string => !!topic))];

  return { cardCount: cards.length, gameTypes, topics };
}
