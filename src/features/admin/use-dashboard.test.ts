import { describe, expect, it, vi } from "vitest";

import { dashboardErrorMessage } from "./use-dashboard";

vi.mock("firebase/functions", () => ({ httpsCallable: vi.fn() }));
vi.mock("@/lib/firebase", () => ({ functions: {} }));

describe("dashboardErrorMessage", () => {
  it("maps a permission-denied callable failure to an access-specific message", () => {
    expect(dashboardErrorMessage({ code: "functions/permission-denied" })).toBe(
      "YOU DO NOT HAVE DASHBOARD ACCESS.",
    );
  });

  it("maps any other callable failure to the generic retry message", () => {
    expect(dashboardErrorMessage({ code: "functions/internal" })).toBe(
      "COULDN'T LOAD THE DASHBOARD. TRY AGAIN.",
    );
    expect(dashboardErrorMessage(new Error("DASHBOARD_UNAVAILABLE"))).toBe(
      "COULDN'T LOAD THE DASHBOARD. TRY AGAIN.",
    );
    expect(dashboardErrorMessage("not an error object")).toBe(
      "COULDN'T LOAD THE DASHBOARD. TRY AGAIN.",
    );
    expect(dashboardErrorMessage(null)).toBe("COULDN'T LOAD THE DASHBOARD. TRY AGAIN.");
  });
});
