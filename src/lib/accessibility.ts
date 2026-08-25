import { AccessibilityInfo } from "react-native";
import { useEffect, useState } from "react";

export { motionDuration } from "@/lib/motion";

/** Keeps React UI and Reanimated in step with the device's motion preference. */
export function useReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) setReducedMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReducedMotion,
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return reducedMotion;
}
