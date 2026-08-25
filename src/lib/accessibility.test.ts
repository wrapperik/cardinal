import { describe, expect, it } from "vitest";

import { motionDuration } from "./motion";

describe("motionDuration", () => {
  it("makes state changes immediate when reduced motion is enabled", () => {
    expect(motionDuration(true, 600)).toBe(0);
  });

  it("preserves the normal duration otherwise", () => {
    expect(motionDuration(false, 600)).toBe(600);
  });
});
