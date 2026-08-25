import * as ExpoHaptics from "expo-haptics";

import { getPreferences } from "@/features/preferences/preferences";

export const ImpactFeedbackStyle = ExpoHaptics.ImpactFeedbackStyle;
export const NotificationFeedbackType = ExpoHaptics.NotificationFeedbackType;

/** Native feedback gated by the player's persisted preference. */
export function impact(style: ExpoHaptics.ImpactFeedbackStyle): void {
  if (getPreferences().hapticsEnabled) void ExpoHaptics.impactAsync(style);
}

/** Native feedback gated by the player's persisted preference. */
export function notification(type: ExpoHaptics.NotificationFeedbackType): void {
  if (getPreferences().hapticsEnabled) void ExpoHaptics.notificationAsync(type);
}

/** Native feedback gated by the player's persisted preference. */
export function selection(): void {
  if (getPreferences().hapticsEnabled) void ExpoHaptics.selectionAsync();
}
