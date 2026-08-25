import { describe, expect, it, vi } from "vitest";

import { isAdminClaims } from "./role";

vi.mock("firebase/auth", () => ({
  onIdTokenChanged: vi.fn(() => vi.fn()),
  getIdToken: vi.fn(),
}));
vi.mock("firebase/functions", () => ({ httpsCallable: vi.fn() }));
vi.mock("@/lib/firebase", () => ({ auth: {}, functions: {} }));

describe("isAdminClaims", () => {
  it("is true only for a claims object whose admin is exactly boolean true", () => {
    expect(isAdminClaims({ admin: true })).toBe(true);
  });

  it("rejects truthy-but-not-boolean admin values", () => {
    // A signed claim is still attacker-controlled input from the client's
    // point of view once it is parsed as JSON — treating "true" or 1 as
    // granted would widen the check past what the server actually issues.
    expect(isAdminClaims({ admin: "true" })).toBe(false);
    expect(isAdminClaims({ admin: 1 })).toBe(false);
    expect(isAdminClaims({ admin: false })).toBe(false);
  });

  it("rejects missing or malformed claims objects", () => {
    expect(isAdminClaims({})).toBe(false);
    expect(isAdminClaims(null)).toBe(false);
    expect(isAdminClaims(undefined)).toBe(false);
    expect(isAdminClaims("admin")).toBe(false);
    expect(isAdminClaims(42)).toBe(false);
  });
});
