import { describe, expect, it } from "vitest";

import { reconcile, type RemoteEntry } from "./merge";
import type { MetaMap } from "./types";

interface Fixture {
  id: string;
  title: string;
}

function meta(updatedAt: number, overrides: Partial<MetaMap[string]> = {}): MetaMap[string] {
  return { updatedAt, dirty: false, remoteConfirmed: false, ...overrides };
}

function remote(id: string, title: string, updatedAt: number): RemoteEntry<Fixture> {
  return { record: { id, title }, updatedAt };
}

describe("reconcile", () => {
  it("adds a remote-only record locally", () => {
    const result = reconcile<Fixture>([], {}, [remote("geography", "GEOGRAPHY", 100)]);
    expect(result.records).toEqual([{ id: "geography", title: "GEOGRAPHY" }]);
    expect(result.meta.geography).toEqual({ updatedAt: 100, dirty: false, remoteConfirmed: true });
  });

  it("keeps a local-only record and queues it for upload", () => {
    const local: Fixture = { id: "history", title: "HISTORY" };
    const result = reconcile<Fixture>([local], { history: meta(50) }, []);
    expect(result.records).toEqual([local]);
    expect(result.toUpload).toEqual([local]);
  });

  it("queues a local-only record for upload even with no prior meta entry, as a brand-new install would have", () => {
    const local: Fixture = { id: "geography", title: "GEOGRAPHY" };
    const result = reconcile<Fixture>([local], {}, []);
    expect(result.toUpload).toEqual([local]);
  });

  it("does not re-queue an already remote-confirmed record just because this snapshot can't see it", () => {
    // Stands in for a store whose local type carries fields the remote
    // document never had (a deck's `cards`), which makes isValid reject the
    // remote reconstruction on every single snapshot — so remoteRecords is
    // permanently empty for it, even for a deck this app already wrote.
    // Without the remoteConfirmed check this would toUpload the SAME record
    // again, whose resend produces a new snapshot that lands right back
    // here — an unbounded resend loop, not a one-off.
    const local: Fixture = { id: "deck-1", title: "DECK" };
    const result = reconcile<Fixture>([local], { "deck-1": meta(100, { remoteConfirmed: true }) }, []);
    expect(result.toUpload).toEqual([]);
    expect(result.records).toEqual([local]);
  });

  it("prefers the remote record when it is newer than the local one", () => {
    const local: Fixture = { id: "geography", title: "OLD TITLE" };
    const result = reconcile<Fixture>([local], { geography: meta(100) }, [
      remote("geography", "NEW TITLE", 200),
    ]);
    expect(result.records).toEqual([{ id: "geography", title: "NEW TITLE" }]);
    expect(result.meta.geography).toEqual({ updatedAt: 200, dirty: false, remoteConfirmed: true });
  });

  it("keeps the local record when it is newer than the remote one", () => {
    const local: Fixture = { id: "geography", title: "NEW TITLE" };
    const localMeta = meta(200, { dirty: true });
    const result = reconcile<Fixture>([local], { geography: localMeta }, [
      remote("geography", "OLD TITLE", 100),
    ]);
    expect(result.records).toEqual([local]);
    expect(result.meta.geography).toBe(localMeta);
  });

  it("keeps the local record on a tie — local wins ties", () => {
    const local: Fixture = { id: "geography", title: "LOCAL" };
    const result = reconcile<Fixture>([local], { geography: meta(100) }, [
      remote("geography", "REMOTE", 100),
    ]);
    expect(result.records).toEqual([local]);
  });

  it("does not duplicate a record present in both — one merged entry, not two", () => {
    const local: Fixture = { id: "geography", title: "LOCAL" };
    const result = reconcile<Fixture>([local], { geography: meta(100) }, [
      remote("geography", "REMOTE", 200),
    ]);
    expect(result.records).toHaveLength(1);
  });

  it("handles a mix of remote-only, local-only, and present-in-both records in one pass", () => {
    const localOnly: Fixture = { id: "local-only", title: "LOCAL ONLY" };
    const both: Fixture = { id: "both", title: "LOCAL VERSION" };
    const result = reconcile<Fixture>(
      [localOnly, both],
      { both: meta(50) },
      [remote("remote-only", "REMOTE ONLY", 10), remote("both", "REMOTE VERSION", 999)],
    );
    expect(result.records.map((r) => r.id).sort()).toEqual(["both", "local-only", "remote-only"]);
    expect(result.toUpload).toEqual([localOnly]);
    expect(result.records.find((r) => r.id === "both")?.title).toBe("REMOTE VERSION");
  });
});
