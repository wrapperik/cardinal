import type { ReactNode } from "react";
import * as Haptics from "expo-haptics";
import { StyleSheet } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { Colors, HOLD_MS, Motion, Radius } from "@/constants/theme";

/** Fixed footprint for both icon buttons, so the fill overlay (below) has a
 *  concrete height to animate towards instead of measuring itself at runtime. */
export const HOLD_BUTTON_SIZE = 52;

/** How long an abandoned hold takes to drain back to empty. Deliberately
 *  shorter than HOLD_MS itself — the fill should read as "letting go", not
 *  as a second commitment of equal weight to the hold that built it. */
const RELEASE_MS = 160;

interface HoldButtonProps {
  glyph: ReactNode;
  label: string;
  /** Announced to assistive tech alongside `label`. Defaults to the generic
   *  hold instruction; callers whose hold does something more specific than
   *  "activate" (RestartButton, say) can name that instead. */
  hint?: string;
  onHold: () => void;
  backgroundColor?: string;
}

/**
 * A circular icon button that fires on a sustained hold rather than a tap.
 *
 * Cardinal has no tap-to-fire controls anywhere — every commitment in the
 * app, from answering a quiz card to confirming a sign-out, is a sustained
 * or directional gesture the user has to see through, not a single instant
 * they can trigger by accident brushing past it. An icon button that fired
 * on tap would be the one control in the app that broke that promise, so it
 * holds instead, and the fill below makes the hold legible rather than a
 * guess at how long to keep a finger down.
 */
export function HoldButton({
  glyph,
  label,
  hint = "Hold to activate",
  onHold,
  backgroundColor = Colors.charcoal,
}: HoldButtonProps) {
  const scale = useSharedValue(1);
  const fill = useSharedValue(0);
  // onHold navigates (back/restart), which unmounts this button while the
  // finger may still be down. The gesture keeps delivering onFinalize /
  // onTouchesUp after that, and writing to shared values for a view that's
  // already gone crashes the native side — so once fired, no more writes.
  const fired = useSharedValue(false);

  const beginHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const fireHold = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onHold();
  };

  const release = () => {
    "worklet";
    if (fired.value) return;
    scale.value = withSpring(1, Motion.press);
    fill.value = withTiming(0, { duration: RELEASE_MS });
  };

  const gesture = Gesture.LongPress()
    .minDuration(HOLD_MS)
    .maxDistance(24)
    .onBegin(() => {
      scale.value = withSpring(1.1, Motion.press);
      fill.value = withTiming(1, { duration: HOLD_MS, easing: Easing.linear });
      runOnJS(beginHaptic)();
    })
    .onStart(() => {
      fired.value = true;
      runOnJS(fireHold)();
    })
    .onFinalize(() => {
      release();
    })
    // The recognizer's own fail state doesn't resolve until minDuration has
    // elapsed, even when the finger lifted immediately — so a plain tap
    // would otherwise watch the fill finish its rise before onFinalize ever
    // drains it. Touch events aren't gated by that recognition delay, so
    // release on the real lift instead of waiting on the gesture's verdict.
    .onTouchesUp(() => {
      release();
    });

  const circleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  // Rises like a level in a glass, clipped by the circle's own
  // overflow: 'hidden' rather than by any shape of its own.
  //
  // A full-height view translated down out of sight, NOT a view whose height
  // grows: height is a layout property, so animating it would run layout on
  // every frame of the hold for all the same pixels a transform moves for
  // free. Reanimated drives both on the UI thread, but only one of them is
  // actually cheap.
  const fillStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - fill.value) * HOLD_BUTTON_SIZE }],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={[styles.button, { backgroundColor }, circleStyle]}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={hint}
      >
        <Animated.View style={[styles.fill, fillStyle]} />
        {/* Rendered after the fill so the glyph always paints on top and
            stays readable at every point of the rise, not just at rest. */}
        {glyph}
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  button: {
    width: HOLD_BUTTON_SIZE,
    height: HOLD_BUTTON_SIZE,
    borderRadius: Radius.pill,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  fill: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: HOLD_BUTTON_SIZE,
    backgroundColor: Colors.bone,
    opacity: 0.18,
  },
});
