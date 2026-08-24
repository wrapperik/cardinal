import { describe, expect, it } from "vitest";

import { fromFirestorePayload, toFirestorePayload, type FieldAdapterConfig } from "./adapter";
import { SERVER_TIMESTAMP } from "./types";

interface Fixture {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  endedAt: number | null;
}

const rootConfig: FieldAdapterConfig = {
  idField: "courseId",
  ownerIdField: "ownerId",
  timestampFields: ["createdAt", "updatedAt", "endedAt"],
  serverTimestamps: { createdAt: "onCreate", updatedAt: "always" },
};

function fixture(overrides: Partial<Fixture> = {}): Fixture {
  return {
    id: "geography",
    title: "GEOGRAPHY",
    createdAt: 1000,
    updatedAt: 1000,
    endedAt: null,
    ...overrides,
  };
}

describe("toFirestorePayload", () => {
  it("renames id to the configured id field and injects ownerId", () => {
    const payload = toFirestorePayload(fixture(), "set", "owner-1", rootConfig);
    expect(payload.id).toBeUndefined();
    expect(payload.courseId).toBe("geography");
    expect(payload.ownerId).toBe("owner-1");
  });

  it("omits ownerId entirely when the collection carries no such field", () => {
    const config: FieldAdapterConfig = { ...rootConfig, ownerIdField: null };
    const payload = toFirestorePayload(fixture(), "set", "owner-1", config);
    expect("ownerId" in payload).toBe(false);
  });

  it("forces an 'onCreate' field to the server timestamp marker on set, even when the local value is the seeded-course placeholder 0", () => {
    const payload = toFirestorePayload(fixture({ createdAt: 0 }), "set", "owner-1", rootConfig);
    expect(payload.createdAt).toBe(SERVER_TIMESTAMP);
  });

  it("drops an 'onCreate' field from an update payload rather than resending the local value", () => {
    const payload = toFirestorePayload(fixture(), "update", "owner-1", rootConfig);
    expect("createdAt" in payload).toBe(false);
  });

  it("forces an 'always' field to the server timestamp marker on both set and update", () => {
    const setPayload = toFirestorePayload(fixture(), "set", "owner-1", rootConfig);
    const updatePayload = toFirestorePayload(fixture(), "update", "owner-1", rootConfig);
    expect(setPayload.updatedAt).toBe(SERVER_TIMESTAMP);
    expect(updatePayload.updatedAt).toBe(SERVER_TIMESTAMP);
  });

  it("converts an unforced timestamp field from local millis to a Date", () => {
    const payload = toFirestorePayload(fixture({ endedAt: 5000 }), "update", "owner-1", rootConfig);
    expect(payload.endedAt).toBeInstanceOf(Date);
    expect((payload.endedAt as Date).getTime()).toBe(5000);
  });

  it("keeps a null unforced timestamp field as null rather than a Date", () => {
    const payload = toFirestorePayload(fixture({ endedAt: null }), "update", "owner-1", rootConfig);
    expect(payload.endedAt).toBeNull();
  });
});

describe("fromFirestorePayload", () => {
  it("uses the snapshot's own docId as the local id and drops the duplicated id field", () => {
    const record = fromFirestorePayload<Fixture>(
      "geography",
      { courseId: "geography", ownerId: "owner-1", title: "GEOGRAPHY", createdAt: 0, updatedAt: 0, endedAt: null },
      rootConfig,
    );
    expect(record.id).toBe("geography");
    expect((record as unknown as Record<string, unknown>).courseId).toBeUndefined();
  });

  it("strips the ownerId field", () => {
    const record = fromFirestorePayload<Fixture>(
      "geography",
      { courseId: "geography", ownerId: "owner-1", title: "GEOGRAPHY", createdAt: 0, updatedAt: 0, endedAt: null },
      rootConfig,
    );
    expect((record as unknown as Record<string, unknown>).ownerId).toBeUndefined();
  });

  it("converts a Timestamp-like value back to millis via toMillis()", () => {
    const record = fromFirestorePayload<Fixture>(
      "geography",
      {
        courseId: "geography",
        ownerId: "owner-1",
        title: "GEOGRAPHY",
        createdAt: { toMillis: () => 12345 },
        updatedAt: { toMillis: () => 6789 },
        endedAt: null,
      },
      rootConfig,
    );
    expect(record.createdAt).toBe(12345);
    expect(record.updatedAt).toBe(6789);
  });

  it("keeps a null timestamp field as null", () => {
    const record = fromFirestorePayload<Fixture>(
      "geography",
      {
        courseId: "geography",
        ownerId: "owner-1",
        title: "GEOGRAPHY",
        createdAt: { toMillis: () => 1 },
        updatedAt: { toMillis: () => 1 },
        endedAt: null,
      },
      rootConfig,
    );
    expect(record.endedAt).toBeNull();
  });
});
