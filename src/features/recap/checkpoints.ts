import { decodeCheckpointRecords, isCheckpoint } from "@/features/recap/recap-rules";
import type { Checkpoint } from "@/features/recap/recap-rules";
import type { FieldAdapterConfig } from "@/lib/sync/adapter";
import { createSyncedStore, type SyncedStoreConfig } from "@/lib/sync/store";

const LEGACY_STORAGE_KEY = "cardinal.checkpoints";

type CheckpointRecord = Checkpoint & { id: string };

export const CHECKPOINT_FIELD: FieldAdapterConfig = {
  idField: "courseId",
  ownerIdField: null,
  timestampFields: ["updatedAt"],
  serverTimestamps: { updatedAt: "always" },
};

function isCheckpointRecord(value: unknown): value is CheckpointRecord {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as { id?: unknown }).id === "string" &&
    isCheckpoint(value)
  );
}

const checkpointSyncConfig: SyncedStoreConfig<CheckpointRecord> = {
  name: "checkpoints",
  collectionPath: (uid) => `users/${uid}/checkpoints`,
  pathIsOwnerScoped: true,
  field: CHECKPOINT_FIELD,
  remoteUpdatedAtField: "updatedAt",
  isValid: isCheckpointRecord,
  migrateLegacyKey: LEGACY_STORAGE_KEY,
  decodeRecords: decodeCheckpointRecords,
};

const store = createSyncedStore<CheckpointRecord>(checkpointSyncConfig);

/**
 * A module-level store rather than a context, for the same reason as
 * src/features/upload/courses.ts — the recap detail screen and the recap
 * player both need this, and there is nothing to seed since a fresh install
 * has nobody mid-recap yet.
 */
let sourceRecords: CheckpointRecord[] | null = null;
let derivedSnapshot: Record<string, Checkpoint> = {};

/** Keeps React's external-store snapshot stable while records are unchanged. */
function checkpointsFrom(records: CheckpointRecord[]): Record<string, Checkpoint> {
  if (records === sourceRecords) return derivedSnapshot;

  sourceRecords = records;
  derivedSnapshot = Object.fromEntries(
    records.map(({ id, ...checkpoint }) => [id, checkpoint]),
  );
  return derivedSnapshot;
}

export function useCheckpoints(): Record<string, Checkpoint> {
  return checkpointsFrom(store.useRecords());
}

export function getCheckpoint(courseId: string): Checkpoint | undefined {
  return checkpointsFrom(store.getRecords())[courseId];
}

/**
 * A checkpoint at or past the queue's end has nothing left to resume —
 * storing one anyway would let the course detail screen offer a "continue"
 * that ends the recap the instant it is tapped. So a finished recap clears
 * its checkpoint instead of recording a terminal one.
 */
export function saveCheckpoint(courseId: string, index: number, total: number): void {
  if (index >= total) {
    clearCheckpoint(courseId);
    return;
  }
  const checkpoint: Checkpoint = { index, total, updatedAt: Date.now() };
  if (!isCheckpoint(checkpoint)) return;
  store.put({ id: courseId, ...checkpoint });
}

export function clearCheckpoint(courseId: string): void {
  if (!getCheckpoint(courseId)) return;
  store.remove(courseId);
}
