import { HttpsError } from "firebase-functions/v2/https";
import { describe, expect, it } from "vitest";

import { assertAdmin, isAllowlistedAdmin, parseAdminEmails } from "./roles";

/** assertAdmin always throws in these cases; this pulls out the thrown HttpsError to inspect its code. */
function caught(fn: () => void): HttpsError {
  try {
    fn();
  } catch (error) {
    return error as HttpsError;
  }
  throw new Error("expected the function to throw");
}

describe("parseAdminEmails", () => {
  it("splits on commas and whitespace, trims, and lowercases", () => {
    expect(parseAdminEmails(" Alice@Example.com,  bob@example.com\ncarol@example.com ")).toEqual([
      "alice@example.com",
      "bob@example.com",
      "carol@example.com",
    ]);
  });

  it("de-duplicates case-insensitively", () => {
    expect(parseAdminEmails("alice@example.com, ALICE@example.com")).toEqual(["alice@example.com"]);
  });

  it("drops empty entries from stray separators", () => {
    expect(parseAdminEmails("alice@example.com,, , bob@example.com")).toEqual([
      "alice@example.com",
      "bob@example.com",
    ]);
  });

  it("returns an empty list for undefined or blank input", () => {
    expect(parseAdminEmails(undefined)).toEqual([]);
    expect(parseAdminEmails("")).toEqual([]);
    expect(parseAdminEmails("   ")).toEqual([]);
  });
});

describe("isAllowlistedAdmin", () => {
  const allowlist = ["alice@example.com", "bob@example.com"];

  it("matches case-insensitively and ignores surrounding whitespace", () => {
    expect(isAllowlistedAdmin("Alice@Example.com", allowlist)).toBe(true);
    expect(isAllowlistedAdmin("  bob@example.com  ", allowlist)).toBe(true);
  });

  it("rejects an email outside the allowlist", () => {
    expect(isAllowlistedAdmin("carol@example.com", allowlist)).toBe(false);
  });

  it("rejects a null, undefined, or empty email regardless of the allowlist", () => {
    expect(isAllowlistedAdmin(null, allowlist)).toBe(false);
    expect(isAllowlistedAdmin(undefined, allowlist)).toBe(false);
    expect(isAllowlistedAdmin("", allowlist)).toBe(false);
    expect(isAllowlistedAdmin("   ", allowlist)).toBe(false);
  });

  it("rejects everyone when the allowlist is empty", () => {
    expect(isAllowlistedAdmin("alice@example.com", [])).toBe(false);
  });
});

describe("assertAdmin", () => {
  it("throws unauthenticated when there is no auth at all", () => {
    expect(caught(() => assertAdmin(null)).code).toBe("unauthenticated");
    expect(caught(() => assertAdmin(undefined)).code).toBe("unauthenticated");
  });

  it("throws permission-denied when the caller's token lacks the admin claim", () => {
    expect(caught(() => assertAdmin({ token: {} })).code).toBe("permission-denied");
    expect(caught(() => assertAdmin({ token: { admin: false } })).code).toBe("permission-denied");
  });

  it("passes silently once the admin claim is true", () => {
    expect(() => assertAdmin({ token: { admin: true } })).not.toThrow();
  });
});
