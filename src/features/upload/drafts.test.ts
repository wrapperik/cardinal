import { beforeEach, describe, expect, it } from "vitest";

import { clearDraftIds, getDraftIds, hideDrafts, setDraftIds } from "@/features/upload/drafts";

describe("draft registry", () => {
  beforeEach(() => {
    clearDraftIds();
  });

  it("hides only the records an unconfirmed upload owns", () => {
    const records = [{ id: "biology" }, { id: "physics" }, { id: "deck-1" }];
    setDraftIds(["biology", "deck-1"]);

    expect(hideDrafts(records, getDraftIds())).toEqual([{ id: "physics" }]);
  });

  it("hands back the same list when nothing is staged", () => {
    const records = [{ id: "biology" }];

    expect(hideDrafts(records, getDraftIds())).toBe(records);
  });

  it("shows the records again once the upload is confirmed", () => {
    const records = [{ id: "biology" }];
    setDraftIds(["biology"]);
    clearDraftIds();

    expect(hideDrafts(records, getDraftIds())).toEqual(records);
  });

  it("keeps one snapshot identity while nothing changes", () => {
    setDraftIds(["biology"]);

    // useDraftIds reads this through useSyncExternalStore, which re-renders
    // in a loop if repeated reads hand back a fresh object each time.
    expect(getDraftIds()).toBe(getDraftIds());
  });
});
