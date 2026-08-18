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
import { useMemo } from 'react';

import { selectCards, useDecks } from '@/features/upload/decks';
import { SAMPLE_ROUNDS as SAMPLE_MATCH_ROUNDS, type MatchRound } from '@/features/match/rounds';
import { SAMPLE_QUESTIONS, type CompassQuestion } from '@/features/quiz/questions';
import { SAMPLE_ROUNDS as SAMPLE_SEQUENCE_ROUNDS, type SequenceRound } from '@/features/sequence/rounds';
import { SAMPLE_STATEMENTS, type TrueFalseStatement } from '@/features/true-false/statements';
import type { CardContent, GameType } from '@/types/cardinal';

/**
 * The cards a game screen should play. Subscribing to the deck store rather
 * than reading it once matters on the home backdrop, where a save lands while
 * the screen is already mounted.
 */
function useCards(gameType: GameType): CardContent[] {
  const { courseId } = useLocalSearchParams<{ courseId?: string }>();
  const decks = useDecks();
  return useMemo(
    () => (courseId ? selectCards(decks, courseId, gameType) : []),
    [decks, courseId, gameType],
  );
}

export function useQuizQuestions(): CompassQuestion[] {
  const cards = useCards('compassQuiz');
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
    return mapped.length > 0 ? mapped : SAMPLE_QUESTIONS;
  }, [cards]);
}

export function useTrueFalseStatements(): TrueFalseStatement[] {
  const cards = useCards('trueFalseDuel');
  return useMemo(() => {
    const mapped = cards.flatMap((card) =>
      card.gameType === 'trueFalseDuel' ? [{ ...card.payload }] : [],
    );
    return mapped.length > 0 ? mapped : SAMPLE_STATEMENTS;
  }, [cards]);
}

export function useSequenceRounds(): SequenceRound[] {
  const cards = useCards('sequenceSwipe');
  return useMemo(() => {
    const mapped = cards.flatMap((card) => {
      if (card.gameType !== 'sequenceSwipe') return [];
      // The board lays out four slots and nothing else.
      if (card.payload.orderedItems.length !== 4) return [];
      return [{ ...card.payload }];
    });
    return mapped.length > 0 ? mapped : SAMPLE_SEQUENCE_ROUNDS;
  }, [cards]);
}

export function useMatchRounds(): MatchRound[] {
  const cards = useCards('matchRelease');
  return useMemo(() => {
    const mapped = cards.flatMap((card) => {
      if (card.gameType !== 'matchRelease') return [];
      // Three zones, three pairs.
      if (card.payload.pairs.length !== 3) return [];
      return [{ ...card.payload }];
    });
    return mapped.length > 0 ? mapped : SAMPLE_MATCH_ROUNDS;
  }, [cards]);
}
