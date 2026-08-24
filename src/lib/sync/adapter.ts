/**
 * Local record <-> Firestore document mapping.
 *
 * Pure and dependency-free so vitest can exercise it directly under node: the
 * one runtime conversion a write actually needs — turning a local millis
 * value into something the Firestore SDK accepts — is a plain `Date`, which
 * needs no firebase import (the SDK converts a `Date` in write data to a
 * `Timestamp` internally). The one thing that can't be produced this way is
 * the real `serverTimestamp()` FieldValue; see the SERVER_TIMESTAMP comment
 * in ./types for how that's handled instead.
 */

import { SERVER_TIMESTAMP } from "./types";

export interface FieldAdapterConfig {
  /**
   * The Firestore field that duplicates the document's own id. Every write
   * rule in firestore.rules checks this against the path segment (e.g.
   * `incoming().courseId == courseId`), so the id has to travel as a field,
   * not just live as the document key.
   */
  idField: string;
  /**
   * The Firestore field that records ownership, or null when the collection
   * carries no such field because ownership is already encoded in a
   * users/{uid}/... path segment — sessions and progress are like this,
   * per firestore.rules.
   */
  ownerIdField: string | null;
  /** Local millis fields that are Firestore Timestamps on the other side. */
  timestampFields: string[];
  /**
   * Which of `timestampFields` firestore.rules pins to serverTimestamp()
   * rather than trusting the client's value, and on which writes. 'onCreate'
   * covers e.g. a course's createdAt; 'always' covers e.g. a deck's
   * updatedAt, which firestore.rules re-pins on every update too.
   */
  serverTimestamps?: Partial<Record<string, "onCreate" | "always">>;
}

/**
 * Builds the payload for a `set` (full-document, used to create a record) or
 * `update` (partial, used for every edit after that) write.
 *
 * A field forced 'onCreate' is written as the server-timestamp marker on a
 * `set`, and dropped from the payload entirely on `update` — not
 * reconstructed from the local millis value. firestore.rules enforces
 * `unchanged('createdAt')` by comparing Timestamps, and a Timestamp rebuilt
 * from a millis-precision local cache is not guaranteed to compare equal to
 * whatever nanosecond-precision value the server actually stored; the local
 * value carries seeded courses' placeholder `createdAt: 0` besides, which is
 * never a value worth sending. Leaving the field out of an `updateDoc` call
 * is the only way to guarantee it survives the write untouched.
 */
export function toFirestorePayload<T extends { id: string }>(
  record: T,
  kind: "set" | "update",
  ownerId: string,
  config: FieldAdapterConfig,
): Record<string, unknown> {
  const { id, ...rest } = record;
  const payload: Record<string, unknown> = { ...rest, [config.idField]: id };
  if (config.ownerIdField) payload[config.ownerIdField] = ownerId;

  for (const field of config.timestampFields) {
    if (!(field in payload)) continue;
    const mode = config.serverTimestamps?.[field];

    if (mode === "onCreate") {
      if (kind === "set") {
        payload[field] = SERVER_TIMESTAMP;
      } else {
        delete payload[field];
      }
      continue;
    }

    if (mode === "always") {
      payload[field] = SERVER_TIMESTAMP;
      continue;
    }

    const value = payload[field];
    payload[field] = value === null || value === undefined ? null : new Date(value as number);
  }

  return payload;
}

/**
 * Accepts either a real Firestore Timestamp or a plain millis number — the
 * latter so fixtures in adapter.test.ts don't need firebase/firestore just
 * to fake a read. Duck-typed on `toMillis` rather than importing the
 * Timestamp class for an `instanceof` check, for the same reason.
 */
function millisFromTimestampLike(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  if (typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") {
    return (value as { toMillis: () => number }).toMillis();
  }
  return null;
}

/**
 * Reverses toFirestorePayload for a document read back off a snapshot.
 * `docId` comes from the snapshot itself rather than `data[config.idField]`
 * so a record still resolves correctly even against a malformed document
 * where the duplicated id field and the real path happen to disagree.
 */
export function fromFirestorePayload<T extends { id: string }>(
  docId: string,
  data: Record<string, unknown>,
  config: FieldAdapterConfig,
): T {
  const rest: Record<string, unknown> = { ...data };
  delete rest[config.idField];
  if (config.ownerIdField) delete rest[config.ownerIdField];

  for (const field of config.timestampFields) {
    if (field in rest) rest[field] = millisFromTimestampLike(rest[field]);
  }

  return { ...rest, id: docId } as T;
}
