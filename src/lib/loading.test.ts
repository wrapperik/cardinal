import { describe, expect, it } from "vitest";

import { shouldShowSkeleton } from "./loading";

describe("shouldShowSkeleton", () => {
  it("waits 300ms before replacing provisional data with a skeleton", () => {
    expect(shouldShowSkeleton(false, false)).toBe(false);
    expect(shouldShowSkeleton(false, true)).toBe(true);
  });

  it("hides the skeleton as soon as data is hydrated", () => {
    expect(shouldShowSkeleton(true, true)).toBe(false);
  });
});
