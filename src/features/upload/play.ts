/**
 * Where an upload finally pays off: the bridge from stored cards to the shape
 * each game screen already plays.
 *
 * Every screen keeps its own local round type rather than consuming CardContent
 * directly — those types encode constraints the payloads do not (a Compass
 * question's choices are a fixed triple, for one), and they predate uploads.
 * So the mapping lives here, in one place, instead of leaking the upload
 * feature into four game screens.
 *
 * A screen opened without a courseId — or for a course with nothing uploaded
 * under that template — falls back to the shipped fixtures. That is what keeps
 * every game playable on a fresh install.
 */

import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';

import { runAt } from '@/features/recap/recap-rules';
import { getActiveRecap } from '@/features/recap/session';
import { selectCards, useDecks } from '@/features/upload/decks';
import { SAMPLE_ROUNDS as SAMPLE_MATCH_ROUNDS, type MatchRound } from '@/features/match/rounds';
import { SAMPLE_QUESTIONS, type CompassQuestion } from '@/features/quiz/questions';
import { SAMPLE_ROUNDS as SAMPLE_SEQUENCE_ROUNDS, type SequenceRound } from '@/features/sequence/rounds';
import { SAMPLE_STATEMENTS, type TrueFalseStatement } from '@/features/true-false/statements';
import type { CardContent, GameType } from '@/types/cardinal';

/**
 * The current run's cards when a recap is driving this screen — captured
 * ONCE, at mount, and never recomputed. `getActiveRecap()` (the plain
 * getter, not the reactive `useActiveRecap()`) is read inside the lazy
 * `useState` initializer for exactly that reason: it runs a single time.
 *
 * It has to stay frozen for the screen's whole lifetime, because the screen's
 * own local round index also starts at 0 and counts up through THIS array.
 * If the array were re-derived from the live recap index on every report
 * instead, it would shrink by one card at the same moment the local index
 * grows by one — a double shift that silently skips a card on every single
 * answer. `runAt` merging same-gameType legs into one run is what guarantees
 * this screen only ever mounts once per run, so "once at mount" really does
 * mean "for this whole run."
 *
 * Null means no recap is driving this screen — the caller falls through to
 * `selectCards`.
 */
function useRecapRunCards(gameType: GameType, inRecap: boolean): CardContent[] | null {
  const [cards] = useState<CardContent[] | null>(() => {
    if (!inRecap) return null;
    const active = getActiveRecap();
    if (!active) return null;
    const run = runAt(active.plan, active.index);
    return run && run.gameType === gameType ? run.cards : [];
  });
  return cards;
}

/**
 * The cards a game screen should play, and whether they came from an active
 * recap. Subscribing to the deck store rather than reading it once matters on
 * the home backdrop, where a save lands while the screen is already mounted —
 * that only applies to the non-recap path, since a recap's cards are frozen
 * for the reason in useRecapRunCards above.
 */
function useCards(gameType: GameType): { cards: CardContent[]; isRecap: boolean } {
  const { courseId, recap } = useLocalSearchParams<{ courseId?: string; recap?: string }>();
  const decks = useDecks();
  const recapCards = useRecapRunCards(gameType, recap === '1');

  const cards = useMemo(
    () => recapCards ?? (courseId ? selectCards(decks, courseId, gameType) : []),
    [recapCards, decks, courseId, gameType],
  );

  return { cards, isRecap: recapCards !== null };
}

export function useQuizQuestions(): CompassQuestion[] {
  const { cards, isRecap } = useCards('compassQuiz');
  return useMemo(() => {
    const mapped = cards.flatMap((card) => {
      if (card.gameType !== 'compassQuiz') return [];
      const { question, choices, correctIndex } = card.payload;
      // A malformed card is dropped rather than crashing the screen: the
      // compass has exactly three lettered targets and no way to render a
      // fourth or leave one empty.
      if (choices.length !== 3) return [];
      const triple: [string, string, string] = [choices[0], choices[1], choices[2]];
      return [{ prompt: question, choices: triple, correctIndex }];
    });
    // A recap plays real cards only — falling back to the shipped fixtures
    // here would silently inject unrelated content mid-recap. Only the
    // standalone path keeps this fallback, which is what makes every game
    // playable on a fresh install.
    if (isRecap) return mapped;
    return mapped.length > 0 ? mapped : SAMPLE_QUESTIONS;
  }, [cards, isRecap]);
}

export function useTrueFalseStatements(): TrueFalseStatement[] {
  const { cards, isRecap } = useCards('trueFalseDuel');
  return useMemo(() => {
    const mapped = cards.flatMap((card) =>
      card.gameType === 'trueFalseDuel' ? [{ ...card.payload }] : [],
    );
    // See useQuizQuestions: a recap never falls back to fixtures.
    if (isRecap) return mapped;
    return mapped.length > 0 ? mapped : SAMPLE_STATEMENTS;
  }, [cards, isRecap]);
}

export function useSequenceRounds(): SequenceRound[] {
  const { cards, isRecap } = useCards('sequenceSwipe');
  return useMemo(() => {
    const mapped = cards.flatMap((card) => {
      if (card.gameType !== 'sequenceSwipe') return [];
      // The board lays out four slots and nothing else.
      if (card.payload.orderedItems.length !== 4) return [];
      return [{ ...card.payload }];
    });
    // See useQuizQuestions: a recap never falls back to fixtures.
    if (isRecap) return mapped;
    return mapped.length > 0 ? mapped : SAMPLE_SEQUENCE_ROUNDS;
  }, [cards, isRecap]);
}

export function useMatchRounds(): MatchRound[] {
  const { cards, isRecap } = useCards('matchRelease');
  return useMemo(() => {
    const mapped = cards.flatMap((card) => {
      if (card.gameType !== 'matchRelease') return [];
      // Three zones, three pairs.
      if (card.payload.pairs.length !== 3) return [];
      return [{ ...card.payload }];
    });
    // See useQuizQuestions: a recap never falls back to fixtures.
    if (isRecap) return mapped;
    return mapped.length > 0 ? mapped : SAMPLE_MATCH_ROUNDS;
  }, [cards, isRecap]);
}
