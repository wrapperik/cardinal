/**
 * Pure rules for decks and cards: id generation, shape validation, backfill
 * of records written before card identity was introduced, and the adapter configs that
 * describe how a LocalDeck maps onto `decks/{deckId}` and its `cards`
 * subcollection. No React Native or firebase imports on purpose — every
 * function here is exercised directly by vitest under node, and DECK_FIELD/
 * CARD_FIELD/expandDeck are also what tests/rules/firestore.test.ts imports
 * to prove the *real* wiring against the emulator, not a hand-copied
 * approximation of it (see the comment on courses' equivalent gap there).
 */

import { isGameType } from "@/features/upload/course-rules";
import type { LocalCard, LocalDeck } from "@/features/upload/types";
import { toFirestorePayload, type FieldAdapterConfig } from "@/lib/sync/adapter";
import type { ExpandedOp, MetaMap } from "@/lib/sync/types";

/**
 * Not a slug of anything user-visible — unlike course ids, nobody reads a
 * deck id — so a timestamp plus a random tail is enough to keep two saves in
 * the same millisecond apart.
 */
export function makeDeckId(): string {
  return `deck-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Same reasoning as makeDeckId: nobody reads a card id either. */
export function makeCardId(): string {
  return `card-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * In the style of isCourse in course-rules.ts. firestore.rules checks the
 * envelope only ("payload is map") and leaves per-gameType arity to the
 * extraction parser — this does the same, rather than re-implementing four
 * separate payload shapes here too.
 */
export function isLocalCard(value: unknown): value is LocalCard {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<LocalCard>;
  return (
    typeof candidate.cardId === "string" &&
    isGameType(candidate.gameType) &&
    typeof candidate.difficulty === "number" &&
    (candidate.topic === undefined || typeof candidate.topic === "string") &&
    !!candidate.payload &&
    typeof candidate.payload === "object"
  );
}

/**
 * Exported for createSyncedStore's `isValid`. A remote deck document can
 * never satisfy this — `cards`, `sourceName`, and `provider` never travel to
 * Firestore at all (see DECK_FIELD.omitFields below) — which is deliberate:
 * see the comment on reconcile()'s remoteConfirmed check in merge.ts for why
 * that does not turn into either data loss or a resend loop.
 */
export function isLocalDeck(value: unknown): value is LocalDeck {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<LocalDeck>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.courseId === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.sourceName === "string" &&
    Array.isArray(candidate.cards) &&
    candidate.cards.every(isLocalCard) &&
    typeof candidate.createdAt === "number" &&
    typeof candidate.updatedAt === "number" &&
    (candidate.provider === "mock" || candidate.provider === "groq")
  );
}

/**
 * Assigns a cardId to any card that predates card identity, and derives
 * updatedAt from createdAt for any deck that predates it too. Applied to
 * every record before isValid ever sees it (see the `backfill` field on
 * SyncedStoreConfig in store.ts) — isValid can only accept or reject a
 * record as given, and rejecting every deck a player already uploaded would
 * silently wipe their history the first time the new shape loads against
 * it. Stable ids matter beyond just satisfying isValid: the SM-2
 * scheduler writes `users/{uid}/progress/{cardId}`, so an id handed out here
 * has to be the one that card keeps forever, not one regenerated the next
 * time this function happens to run again — which is exactly what NOT
 * persisting the result immediately would risk.
 *
 * Deliberately permissive about the input shape: `value` is whatever raw
 * JSON.parse produced, which is not guaranteed to be object-shaped at all.
 * Anything that does not look enough like a deck to backfill is returned
 * untouched, leaving isValid to reject it on its own terms afterward.
 */
export function backfillDeck(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const candidate = value as Record<string, unknown>;

  const cards = Array.isArray(candidate.cards)
    ? candidate.cards.map((card) => {
        if (!card || typeof card !== "object") return card;
        const cardCandidate = card as Record<string, unknown>;
        return typeof cardCandidate.cardId === "string"
          ? cardCandidate
          : { ...cardCandidate, cardId: makeCardId() };
      })
    : candidate.cards;

  const updatedAt =
    typeof candidate.updatedAt === "number" ? candidate.updatedAt : candidate.createdAt;

  return { ...candidate, cards, updatedAt };
}

/**
 * `decks/{deckId}`. `cards`, `sourceName`, and `provider` are local-only:
 * `cards` is the subcollection below, never a field on the deck document
 * itself; `sourceName` duplicates `UploadDoc.fileName`, and `provider` is
 * not in the ERD at all — both stay off the wire until upload sync resolves
 * provenance through `uploadId` instead.
 */
export const DECK_FIELD: FieldAdapterConfig = {
  idField: "deckId",
  ownerIdField: "ownerId",
  timestampFields: ["createdAt", "updatedAt"],
  serverTimestamps: { createdAt: "onCreate", updatedAt: "always" },
  omitFields: ["cards", "sourceName", "provider"],
};

/**
 * `decks/{deckId}/cards/{cardId}`. No ownerIdField — cards carry no ownerId
 * of their own; firestore.rules derives ownership from the parent deck via
 * a get(), which is the cost the ERD accepts for not denormalising it onto
 * every card (see the comment on that rule).
 */
export const CARD_FIELD: FieldAdapterConfig = {
  idField: "cardId",
  ownerIdField: null,
  timestampFields: ["createdAt"],
  serverTimestamps: { createdAt: "onCreate" },
};

/**
 * The SyncedStoreConfig.expand hook for decks: one deck record becomes the
 * deck's own write followed by one write per card, in that exact order —
 * the only order firestore.rules allows, since the cards rule's deckOwner()
 * reads the parent deck via get() and sees nothing until that write has
 * actually committed (see the emulator tests named for this in
 * tests/rules/firestore.test.ts). store.ts's strict FIFO outbox is what
 * turns "return them in order" into "send them in order" — this function
 * itself does no scheduling.
 *
 * `cardCount`/`sourceType`/`uploadId` are not LocalDeck fields — they are
 * derived or fixed at write time: `cardCount` from `deck.cards.length`,
 * `sourceType` always 'manual' and `uploadId` always null, since nothing
 * before upload sync creates a deck any other way. A card carries no local
 * `createdAt` (CardContent has none — see its doc comment in
 * cardinal.ts), so `createdAt: 0` is added purely as the placeholder
 * toFirestorePayload's 'onCreate' handling expects to override, the same
 * role seedCourses' `createdAt: 0` plays for courses.
 */
export function expandDeck(deck: LocalDeck, uid: string, meta: MetaMap): ExpandedOp[] {
  const deckKind: "set" | "update" = meta[deck.id]?.remoteConfirmed ? "update" : "set";
  const deckPayload = toFirestorePayload(
    { ...deck, cardCount: deck.cards.length, sourceType: "manual" as const, uploadId: null },
    deckKind,
    uid,
    DECK_FIELD,
  );

  const ops: ExpandedOp[] = [
    { collection: "decks", docId: deck.id, kind: deckKind, payload: deckPayload },
  ];

  for (const card of deck.cards) {
    ops.push({
      collection: `decks/${deck.id}/cards`,
      docId: card.cardId,
      kind: "set",
      payload: toFirestorePayload(
        { ...card, id: card.cardId, deckId: deck.id, createdAt: 0 },
        "set",
        uid,
        CARD_FIELD,
      ),
    });
  }

  return ops;
}
