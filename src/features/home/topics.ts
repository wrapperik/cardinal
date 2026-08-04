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

/** Second row starts halfway through, so the two rows never line up. */
export const TOPICS_ROW_TWO: Topic[] = [...TOPICS.slice(2), ...TOPICS.slice(0, 2)];

/**
 * Where each template lives. Two of the four are built; the rest are null on
 * purpose, so holding one of their pills quietly does nothing rather than
 * pushing a route that does not exist yet.
 */
export const GAME_ROUTES: Record<GameType, Href | null> = {
  compassQuiz: '/quiz',
  trueFalseDuel: '/true-false',
  sequenceSwipe: null,
  matchRelease: null,
};

/** Labels for the hold-and-slide menu shown while a pill is held. */
export const MENU_ITEMS = [
  'QUICK RECAP',
  'START QUIZ',
  'UPLOAD MATERIAL',
  'PAST SCORES',
] as const;
