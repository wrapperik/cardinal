import { describe, expect, it } from "vitest";

import { matchesTypedConfirmation } from "./typed-confirmation";

describe("matchesTypedConfirmation", () => {
  it("requires the complete confirmation word while ignoring case and outer whitespace", () => {
    expect(matchesTypedConfirmation(" delete ", "DELETE")).toBe(true);
    expect(matchesTypedConfirmation("dele", "DELETE")).toBe(false);
    expect(matchesTypedConfirmation("DELETE NOW", "DELETE")).toBe(false);
  });
});
