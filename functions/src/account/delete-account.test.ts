import { describe, expect, it } from "vitest";

import { hasDeleteConfirmation } from "./delete-account";

describe("hasDeleteConfirmation", () => {
  it("accepts only the required account-deletion confirmation", () => {
    expect(hasDeleteConfirmation({ confirmation: "DELETE" })).toBe(true);
    expect(hasDeleteConfirmation({ confirmation: "delete" })).toBe(false);
    expect(hasDeleteConfirmation({ confirmation: "DELETE NOW" })).toBe(false);
    expect(hasDeleteConfirmation({})).toBe(false);
  });
});
