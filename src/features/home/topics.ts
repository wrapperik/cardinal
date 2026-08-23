import type { Href } from 'expo-router';

import type { GameType } from '@/types/cardinal';

/**
 * Demo decks for the home screen. One per game template, so the four MVP
 * mechanics are each reachable from the first screen without needing real
 * uploaded content yet.
 *
 * The pairings are not arbitrary — each subject is the kind of material its
 * template handles best: multiple-choice recall for imagery, term-to-definition
 * for place names, chronology for events, and flat assertions for facts.
 */
export interface Topic {
  title: string;
  gameType: GameType;
}

export const TOPICS: Topic[] = [
  { title: 'VISUAL CULTURE', gameType: 'compassQuiz' },
  { title: 'GEOGRAPHY', gameType: 'matchRelease' },
  { title: 'HISTORY', gameType: 'sequenceSwipe' },
  { title: 'BIOLOGY', gameType: 'trueFalseDuel' },
];

/**
 * Where each template lives, with the course carried along so the screen knows
 * whose cards to deal. Written as a switch rather than a lookup table because
 * typed routes only accept a literal pathname in the params-carrying form — a
 * `Record<GameType, Href>` widens the pathname and stops typechecking.
 *
 * A missing courseId is the honest signal for "no particular course": the
 * screens fall back to their shipped fixtures.
 *
 * `recap` carries the flag a recap in progress needs on every leg it routes
 * to — see useRecapRunner. Threaded through this one function rather than
 * given a second switch of its own, so the route-per-gameType mapping stays
 * declared in exactly one place.
 */
export function gameHref(gameType: GameType, courseId?: string, recap?: boolean): Href {
  const params = courseId ? (recap ? { courseId, recap: '1' } : { courseId }) : undefined;
  switch (gameType) {
    case 'compassQuiz':
      return { pathname: '/quiz', params };
    case 'trueFalseDuel':
      return { pathname: '/true-false', params };
    case 'sequenceSwipe':
      return { pathname: '/sequence', params };
    case 'matchRelease':
      return { pathname: '/match', params };
  }
}
