import { describe, expect, it } from "vitest";

import { getAuthErrorMessage } from "./errors";

describe("getAuthErrorMessage", () => {
  it.each([
    ["auth/invalid-credential", "That email or password isn't right."],
    ["auth/email-already-in-use", "An account already uses that email."],
    ["auth/network-request-failed", "You're offline. Check your connection and try again."],
    ["auth/too-many-requests", "Too many attempts. Wait a moment and try again."],
    ["auth/popup-closed-by-user", "Google sign-in was closed before it finished."],
  ])("maps %s to useful copy", (code, message) => {
    expect(getAuthErrorMessage({ code })).toBe(message);
  });

  it("does not expose unknown internal errors", () => {
    expect(getAuthErrorMessage({ code: "auth/internal-error" })).toBe(
      "Something went wrong. Please try again.",
    );
    expect(getAuthErrorMessage(new Error("secret implementation detail"))).toBe(
      "Something went wrong. Please try again.",
    );
  });
});
