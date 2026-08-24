import { scheduleReview, recallQualityFor, type Sm2State } from "@/features/progress/sm2";
import type { FieldAdapterConfig } from "@/lib/sync/adapter";
import { createSyncedStore, type SyncedStoreConfig } from "@/lib/sync/store";
import type { AnswerResult, RecallQuality } from "@/types/cardinal";

export interface ProgressRecord extends Sm2State {
  id: string;
  deckId: string;
  dueDate: number;
  lastReviewedAt: number;
  lastQuality: RecallQuality;
}

export const PROGRESS_FIELD: FieldAdapterConfig = {
  idField: "cardId",
  ownerIdField: null,
  timestampFields: ["dueDate", "lastReviewedAt"],
};

export function isProgressRecord(value: unknown): value is ProgressRecord {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ProgressRecord>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.deckId === "string" &&
    typeof candidate.easeFactor === "number" &&
    Number.isFinite(candidate.easeFactor) &&
    candidate.easeFactor >= 1.3 &&
    typeof candidate.interval === "number" &&
    Number.isInteger(candidate.interval) &&
    candidate.interval >= 0 &&
    typeof candidate.repetitions === "number" &&
    Number.isInteger(candidate.repetitions) &&
    candidate.repetitions >= 0 &&
    typeof candidate.lapses === "number" &&
    Number.isInteger(candidate.lapses) &&
    candidate.lapses >= 0 &&
    typeof candidate.dueDate === "number" &&
    Number.isFinite(candidate.dueDate) &&
    typeof candidate.lastReviewedAt === "number" &&
    Number.isFinite(candidate.lastReviewedAt) &&
    typeof candidate.lastQuality === "number" &&
    Number.isInteger(candidate.lastQuality) &&
    candidate.lastQuality >= 0 &&
    candidate.lastQuality <= 5
  );
}

const progressSyncConfig: SyncedStoreConfig<ProgressRecord> = {
  name: "progress",
  collectionPath: (uid) => `users/${uid}/progress`,
  pathIsOwnerScoped: true,
  field: PROGRESS_FIELD,
  remoteUpdatedAtField: "lastReviewedAt",
  isValid: isProgressRecord,
};

const store = createSyncedStore<ProgressRecord>(progressSyncConfig);

export function useProgress(): ProgressRecord[] {
  return store.useRecords();
}

export function getProgress(): ProgressRecord[] {
  return store.getRecords();
}

export function recordProgress(
  card: { cardId: string; deckId: string },
  result: AnswerResult,
  reviewedAt = Date.now(),
): ProgressRecord {
  const previous = store.getRecords().find((record) => record.id === card.cardId);
  const review = scheduleReview(previous, recallQualityFor(result), reviewedAt);
  const record: ProgressRecord = { id: card.cardId, deckId: card.deckId, ...review };
  store.put(record);
  return record;
}
