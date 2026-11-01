import { isGlassEffectAPIAvailable, isLiquidGlassAvailable } from "expo-glass-effect";
import { Platform } from "react-native";

import { usePreferences } from "@/features/preferences/preferences";

/**
 * Whether this device can render Liquid Glass at all: iOS 26 or later, with
 * the glass API actually present. The second check matters — some iOS 26
 * betas report the design as available but lack the API, and GlassView
 * crashes there. Fixed for the life of the process, so it's read once.
 */
export const LIQUID_GLASS_SUPPORTED =
  Platform.OS === "ios" && isGlassEffectAPIAvailable() && isLiquidGlassAvailable();

/** True when glass should render: the device supports it and the person hasn't switched it off. */
export function useLiquidGlass(): boolean {
  const { liquidGlass } = usePreferences();
  return LIQUID_GLASS_SUPPORTED && liquidGlass;
}
