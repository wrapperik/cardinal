import { useSyncExternalStore } from "react";

/**
 * The ids an upload in review has staked a claim on. The extraction Function
 * writes its course and deck to Firestore before anyone has confirmed the
 * upload, and the ordinary collection listeners deliver both into the stores
 * within seconds — which is what used to make a half-finished upload show up
 * on home behind the sheet, and stay there after a discard.
 *
 * Rather than teach the sync store to hold records back, the ids are parked
 * here for as long as the sheet owns them and the library filters them out at
 * the point it presents them. The registry is deliberately in-memory: it
 * describes one screen's in-flight work, not durable state, and the upload
 * flow deletes the records outright when that work is abandoned.
 */
const EMPTY: ReadonlySet<string> = new Set();

let draftIds: ReadonlySet<string> = EMPTY;

const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setDraftIds(ids: Iterable<string>): void {
  draftIds = new Set(ids);
  notify();
}

export function clearDraftIds(): void {
  if (draftIds.size === 0) return;
  draftIds = EMPTY;
  notify();
}

export function getDraftIds(): ReadonlySet<string> {
  return draftIds;
}

export function useDraftIds(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, getDraftIds, getDraftIds);
}

/** Drops the records an unconfirmed upload owns from a library listing. */
export function hideDrafts<T extends { id: string }>(records: T[], drafts: ReadonlySet<string>): T[] {
  if (drafts.size === 0) return records;
  return records.filter((record) => !drafts.has(record.id));
}
