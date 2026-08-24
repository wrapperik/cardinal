import { describe, expect, it, vi } from "vitest";
import { activeProvider } from "./index";

const providers = vi.hoisted(() => ({ configured: false }));

vi.mock("./mock", () => ({
  mockProvider: { id: "mock", isConfigured: () => true },
}));

vi.mock("./gemini", () => ({
  geminiProvider: { id: "gemini", isConfigured: () => providers.configured },
}));

describe("activeProvider", () => {
  it("uses the cloud provider when its non-secret configuration is available", () => {
    providers.configured = true;
    expect(activeProvider().id).toBe("gemini");
  });

  it("keeps the demo flow available only when cloud extraction is unavailable", () => {
    providers.configured = false;
    expect(activeProvider().id).toBe("mock");
  });
});
