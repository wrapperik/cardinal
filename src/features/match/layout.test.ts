import { describe, expect, it } from "vitest";

import { getMatchZoneHeight } from "./layout";

describe("getMatchZoneHeight", () => {
  it("keeps all three zones inside the available vertical gap", () => {
    const height = getMatchZoneHeight(256);

    expect(height * 3 + 14 * 2).toBeLessThanOrEqual(256);
    expect(height).toBe(76);
  });

  it("preserves the normal zone height when there is enough room", () => {
    expect(getMatchZoneHeight(320)).toBe(84);
  });
});
