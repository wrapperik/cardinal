import type { Href } from 'expo-router';

import type { GameType } from '@/types/cardinal';

/**
 * The one demo course shipped on a fresh install, so Compass Quiz is
 * reachable from the first screen without needing real uploaded content yet.
 *
 * Trimmed from four seeded courses (one per game template) down to this one:
 * with only a single sample on the home screen, the pill row is no longer
 * demonstrating navigation between courses that don't really exist yet — a
 * new player's own uploads are what should fill that row in.
 */
export interface Topic {
  title: string;
  gameType: GameType;
}

export const TOPICS: Topic[] = [
  { title: 'VISUAL CULTURE', gameType: 'compassQuiz' },
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
