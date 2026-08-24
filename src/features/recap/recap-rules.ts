/**
 * Pure rules for building a recap queue and validating where a player left
 * off in it. No React Native imports on purpose — exercised directly by
 * vitest under node, same reasoning as course-rules.ts and course-stats.ts.
 */

// Relative, not "@/features/upload/course-stats": this module is loaded
// directly by vitest, which has no alias resolution configured, so the one
// runtime dependency this pure file has must be resolvable on its own. See
// the equivalent note in extract/parse.ts.
import { GAME_TYPE_ORDER } from "../upload/course-stats";
import { recordAnswer, type SessionTally } from "../sessions/session-rules";
import type { ProgressRecord } from "@/features/progress/progress";
import type { LocalCard, LocalDeck } from "@/features/upload/types";
import type { AnswerResult, GameType } from "@/types/cardinal";

/** A persisted card enriched with the deck needed to update its schedule. */
export type RecapCard = LocalCard & { deckId: string };

export interface RecapLeg {
  gameType: GameType;
  /** Undefined for the trailing group of cards that carry no topic. */
  topic?: string;
  /** Position in the full queue of this leg's first card. */
  start: number;
  cards: RecapCard[];
}

export interface RecapPlan {
  courseId: string;
  /** Every card in play order. A checkpoint indexes into this. */
  cards: RecapCard[];
  legs: RecapLeg[];
}

/**
 * Puts due cards ahead of new or future cards, then groups each priority
 * section by topic (first-seen order, untopiced cards last — matching
 * `courseStats.topics`) and game type. The sort relies on
 * `Array.prototype.sort` being stable (guaranteed since ES2019), so cards
 * tied on priority, topic, and game type keep upload order.
 *
 * Each (priority, topic, gameType) group becomes one leg because the sort
 * makes every such group a contiguous run.
 */
export function buildRecapPlan(
  decks: LocalDeck[],
  courseId: string,
  progress: readonly ProgressRecord[] = [],
  now = Date.now(),
): RecapPlan {
  const raw = decks
    .filter((deck) => deck.courseId === courseId)
    .flatMap((deck) => deck.cards.map((card) => ({ ...card, deckId: deck.id })));

  const dueCardIds = new Set(
    progress.filter((record) => record.dueDate <= now).map((record) => record.id),
  );
  const prioritySections = [
    raw.filter((card) => dueCardIds.has(card.cardId)),
    raw.filter((card) => !dueCardIds.has(card.cardId)),
  ];

  const cards: RecapCard[] = [];
  const legs: RecapLeg[] = [];

  for (const section of prioritySections) {
    // Map preserves first-seen key order, including the `undefined` key for
    // untopiced cards — but that group has to land last regardless of when it
    // was first seen, so it is pulled out and re-appended below rather than
    // left wherever it happened to fall.
    const groups = new Map<string | undefined, RecapCard[]>();
    for (const card of section) {
      // An empty-string topic counts as no topic, matching how courseStats
      // filters falsy topics out. parseTopic never emits one, but a hand-built
      // fixture can, and it must not become a phantom group of its own that
      // sorts ahead of the real ones.
      const key = card.topic || undefined;
      const existing = groups.get(key);
      if (existing) existing.push(card);
      else groups.set(key, [card]);
    }
    const noTopic = groups.get(undefined);
    groups.delete(undefined);
    const orderedGroups = [...groups.entries()];
    if (noTopic) orderedGroups.push([undefined, noTopic]);

    for (const [topic, groupCards] of orderedGroups) {
      const sorted = [...groupCards].sort(
        (a, b) => GAME_TYPE_ORDER.indexOf(a.gameType) - GAME_TYPE_ORDER.indexOf(b.gameType),
      );

      let i = 0;
      while (i < sorted.length) {
        const gameType = sorted[i].gameType;
        let j = i + 1;
        while (j < sorted.length && sorted[j].gameType === gameType) j++;
        const legCards = sorted.slice(i, j);
        legs.push({ gameType, topic, start: cards.length, cards: legCards });
        cards.push(...legCards);
        i = j;
      }
    }
  }

  return { courseId, cards, legs };
}

/**
 * Resolves a checkpoint index to where play should resume. Null for a
 * negative index, an index at or past the end, or an empty plan — all of
 * which mean "nothing here to resume into" rather than a specific card.
 */
export function legAt(
  plan: RecapPlan,
  index: number,
): { leg: RecapLeg; legIndex: number; offsetInLeg: number } | null {
  if (index < 0 || index >= plan.cards.length) return null;

  for (let legIndex = 0; legIndex < plan.legs.length; legIndex++) {
    const leg = plan.legs[legIndex];
    if (index < leg.start + leg.cards.length) {
      return { leg, legIndex, offsetInLeg: index - leg.start };
    }
  }
  // Unreachable: legs partition [0, plan.cards.length) completely, and the
  // guard above already rejected anything outside that range.
  return null;
}

/**
 * The maximal run of same-gameType cards starting at `index` — exactly what
 * one game screen plays in one visit.
 *
 * Distinct from `legAt` on purpose: a leg is a (topic, gameType) pair, and
 * two consecutive legs can share a gameType across a topic boundary (RIVERS
 * matchRelease followed directly by MOUNTAINS matchRelease, say). Routing to
 * the same game route twice in a row would `replace()` a screen that never
 * remounts, so its `useState(0)` round index would keep pointing into the
 * PREVIOUS leg's rounds array instead of resetting for the new one. Grouping
 * by contiguous gameType instead of by leg guarantees the next screen is
 * always a different route, so a fresh mount — and a fresh index — is the
 * only way to reach it. `legAt` remains for the course detail screen's topic
 * display, where the topic boundary is exactly what needs to show.
 */
export function runAt(
  plan: RecapPlan,
  index: number,
): { gameType: GameType; cards: RecapCard[]; start: number } | null {
  if (index < 0 || index >= plan.cards.length) return null;

  const gameType = plan.cards[index].gameType;
  let end = index + 1;
  while (end < plan.cards.length && plan.cards[end].gameType === gameType) end++;

  return { gameType, cards: plan.cards.slice(index, end), start: index };
}

export interface Checkpoint {
  /** Cards already answered — equivalently, the index of the next card to play. */
  index: number;
  /** The queue length this was taken against — see `resumeIndex` for why. */
  total: number;
  updatedAt: number;
}

export function isCheckpoint(value: unknown): value is Checkpoint {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Checkpoint>;
  // Integers, not merely numbers — stricter than `isCourse` in
  // course-rules.ts is about its own numeric field, and deliberately so.
  // A course's `createdAt` only ever feeds a sort, where a junk value is
  // harmless; these two are array positions. A fractional index reaches
  // `legAt` and indexes a leg's cards to `undefined`, and a NaN one slips
  // through every comparison in `resumeIndex` to be returned as-is.
  return (
    typeof candidate.index === "number" &&
    Number.isInteger(candidate.index) &&
    candidate.index >= 0 &&
    typeof candidate.total === "number" &&
    Number.isInteger(candidate.total) &&
    candidate.total > 0 &&
    candidate.index < candidate.total &&
    typeof candidate.updatedAt === "number" &&
    Number.isFinite(candidate.updatedAt)
  );
}

/** Turns the old `{ [courseId]: Checkpoint }` cache into synced-store records. */
export function decodeCheckpointRecords(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];

  const records: (Checkpoint & { id: string })[] = [];
  for (const [id, candidate] of Object.entries(value as Record<string, unknown>)) {
    if (isCheckpoint(candidate)) records.push({ id, ...candidate });
  }
  return records;
}

/** Validates a hydrated `Record<courseId, Checkpoint>`, dropping anything malformed. */
export function sanitiseCheckpoints(value: unknown): Record<string, Checkpoint> {
  if (!value || typeof value !== "object") return {};

  const result: Record<string, Checkpoint> = {};
  for (const [courseId, candidate] of Object.entries(value as Record<string, unknown>)) {
    if (isCheckpoint(candidate)) result[courseId] = candidate;
  }
  return result;
}

/**
 * A checkpoint is only resumable against the plan it was taken from.
 *
 * The checkpoint itself is nothing but a bare index into a generated queue —
 * it does not name a card. Upload one more deck into the course, or delete
 * one, and the same index now points somewhere else entirely, so resuming
 * blindly would drop the player into an unrelated card rather than back
 * where they stopped.
 *
 * Comparing `checkpoint.total` to the freshly-built plan's length is a
 * deliberately cheap guard rather than an exact one: it catches every add or
 * remove, since either changes the count. What it does not catch is a
 * same-length swap — one card removed and a different one added back in the
 * same topic and game type — but the cost of that rare miss is one
 * mis-placed resume, not corruption, and an exact guard would mean hashing
 * the plan's content and storing that hash alongside the index. Not worth
 * the bytes for a mistake this cheap.
 */
export function resumeIndex(checkpoint: Checkpoint | undefined, plan: RecapPlan): number {
  if (!checkpoint) return 0;
  if (checkpoint.total !== plan.cards.length) return 0;
  if (checkpoint.index < 0 || checkpoint.index >= plan.cards.length) return 0;
  return checkpoint.index;
}

export interface RecapState {
  courseId: string;
  plan: RecapPlan;
  /** Cards already answered; indexes into plan.cards. */
  index: number;
  sessionId: string;
  tally: SessionTally;
}

/**
 * Immutable. Folds one answer in: tallies it against the CURRENT card's
 * gameType, then steps the index.
 *
 * Reads `plan.cards[state.index]` BEFORE stepping — the tally belongs to the
 * card just answered, not whatever the index points at afterward. If the
 * index is already past the end this is a no-op instead of stepping again: a
 * verdict `setTimeout` can still fire after the player has already left the
 * last card behind, and that late call must not push the index (or the
 * tally) past the end a second time.
 */
export function advanceRecap(state: RecapState, result: AnswerResult): RecapState {
  if (isRecapComplete(state)) return state;
  const gameType = state.plan.cards[state.index].gameType;
  return {
    ...state,
    index: state.index + 1,
    tally: recordAnswer(state.tally, result, gameType),
  };
}

export function isRecapComplete(state: RecapState): boolean {
  return state.index >= state.plan.cards.length;
}
