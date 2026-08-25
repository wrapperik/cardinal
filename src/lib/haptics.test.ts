import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  impact,
  ImpactFeedbackStyle,
  notification,
  NotificationFeedbackType,
  selection,
} from "./haptics";

const preferences = vi.hoisted(() => ({
  getPreferences: vi.fn(),
}));
const nativeHaptics = vi.hoisted(() => ({
  impactAsync: vi.fn(),
  notificationAsync: vi.fn(),
  selectionAsync: vi.fn(),
  ImpactFeedbackStyle: { Light: "light" },
  NotificationFeedbackType: { Success: "success" },
}));

vi.mock("@/features/preferences/preferences", () => preferences);
vi.mock("expo-haptics", () => nativeHaptics);

beforeEach(() => {
  vi.clearAllMocks();
  preferences.getPreferences.mockReturnValue({ hapticsEnabled: true });
});

describe("haptics", () => {
  it("does not invoke native feedback when the preference is disabled", () => {
    preferences.getPreferences.mockReturnValue({ hapticsEnabled: false });

    impact(ImpactFeedbackStyle.Light);
    notification(NotificationFeedbackType.Success);
    selection();

    expect(nativeHaptics.impactAsync).not.toHaveBeenCalled();
    expect(nativeHaptics.notificationAsync).not.toHaveBeenCalled();
    expect(nativeHaptics.selectionAsync).not.toHaveBeenCalled();
  });

  it("forwards each requested feedback type when haptics are enabled", () => {
    impact(ImpactFeedbackStyle.Light);
    notification(NotificationFeedbackType.Success);
    selection();

    expect(nativeHaptics.impactAsync).toHaveBeenCalledWith("light");
    expect(nativeHaptics.notificationAsync).toHaveBeenCalledWith("success");
    expect(nativeHaptics.selectionAsync).toHaveBeenCalledOnce();
  });
});
