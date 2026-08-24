/**
 * Reconciliation between the local cache and a fresh Firestore snapshot.
 * Pure — store.ts is the only place that knows how to read a snapshot or
 * persist the result; this module just decides what the merged state and
 * the resulting upload list should be.
 */

import type { MetaMap } from "./types";

export interface RemoteEntry<T extends { id: string }> {
  record: T;
  /**
   * Millis, already converted from whatever Firestore field the store's
   * config designates as the authoritative "last write" for this collection
   * — usually the field marked 'always' in the adapter config, or createdAt
   * when the collection has no updatedAt of its own.
   */
  updatedAt: number;
}

export interface ReconcileResult<T extends { id: string }> {
  records: T[];
  meta: MetaMap;
  /** Local records with no remote counterpart yet — nothing to compare against, so they need to be enqueued as an upload. */
  toUpload: T[];
}

/**
 * Last-write-wins by `updatedAt`, local wins ties: an offline edit made in
 * the same millisecond as whatever produced the remote copy should not be
 * silently discarded just because the two clocks happened to agree. A
 * record only Firestore knows about is adopted locally; a record only the
 * local cache knows about is kept and queued for upload — there is nothing
 * to compare it against, so "newer wins" does not apply until the first
 * round trip gives it something to be newer or older than.
 */
export function reconcile<T extends { id: string }>(
  localRecords: T[],
  localMeta: MetaMap,
  remoteRecords: RemoteEntry<T>[],
): ReconcileResult<T> {
  const remoteById = new Map(remoteRecords.map((entry) => [entry.record.id, entry]));
  const seenRemoteIds = new Set<string>();

  const records: T[] = [];
  const meta: MetaMap = {};
  const toUpload: T[] = [];

  for (const local of localRecords) {
    const remote = remoteById.get(local.id);
    const localMetaEntry = localMeta[local.id];

    if (!remote) {
      records.push(local);
      if (localMetaEntry) meta[local.id] = localMetaEntry;
      toUpload.push(local);
      continue;
    }

    seenRemoteIds.add(local.id);
    const localUpdatedAt = localMetaEntry?.updatedAt ?? 0;

    if (localUpdatedAt >= remote.updatedAt) {
      records.push(local);
      meta[local.id] = localMetaEntry ?? {
        updatedAt: remote.updatedAt,
        dirty: false,
        remoteConfirmed: true,
      };
    } else {
      records.push(remote.record);
      meta[local.id] = { updatedAt: remote.updatedAt, dirty: false, remoteConfirmed: true };
    }
  }

  for (const entry of remoteRecords) {
    if (seenRemoteIds.has(entry.record.id)) continue;
    records.push(entry.record);
    meta[entry.record.id] = { updatedAt: entry.updatedAt, dirty: false, remoteConfirmed: true };
  }

  return { records, meta, toUpload };
}
