import { StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";

import { Colors, EDGE_PILL_HEIGHT, Fonts, HOLD_MS, Motion, Spacing } from "@/constants/theme";
import { useReducedMotion } from "@/lib/accessibility";
import { impact, ImpactFeedbackStyle } from "@/lib/haptics";

/** Same drain as HoldButton: letting go reads as release, not a second commitment. */
const RELEASE_MS = 160;

/**
 * The game PASS pill in legacy UX: hold it to skip the round. A light wash
 * sweeps across the pill from the left over HOLD_MS — the same hold the
 * icon buttons use — so the length of the press is visible rather than
 * guessed, and lifting early drains it back with nothing passed.
 *
 * Replaces the downward swipe on the pill, which was easy to fire by
 * accident while reaching for the cards just above it.
 */
export function HoldPassPill({ onPass }: { onPass: () => void }) {
  const reducedMotion = useReducedMotion();
  const fill = useSharedValue(0);
  const scale = useSharedValue(1);
  // onPass advances the round and can remount what sits around the pill
  // while the finger is still down; once fired, the release handlers below
  // must not animate a commitment that has already happened.
  const fired = useSharedValue(false);

  const begin = () => impact(ImpactFeedbackStyle.Light);
  const pass = () => {
    impact(ImpactFeedbackStyle.Medium);
    onPass();
  };

  const release = () => {
    "worklet";
    scale.value = reducedMotion ? 1 : withSpring(1, Motion.press);
    if (fired.value) {
      // Clear the completed fill once the round has moved on.
      fill.value = withTiming(0, { duration: RELEASE_MS });
      fired.value = false;
      return;
    }
    fill.value = reducedMotion ? 0 : withTiming(0, { duration: RELEASE_MS });
  };

  const gesture = Gesture.LongPress()
    .minDuration(HOLD_MS)
    .maxDistance(24)
    .onBegin(() => {
      fired.value = false;
      scale.value = reducedMotion ? 1 : withSpring(0.96, Motion.press);
      fill.value = reducedMotion ? 1 : withTiming(1, { duration: HOLD_MS, easing: Easing.linear });
      runOnJS(begin)();
    })
    .onStart(() => {
      fired.value = true;
      runOnJS(pass)();
    })
    .onFinalize(() => release())
    // The recognizer only fails once minDuration has passed, even after an
    // early lift; touch-up is immediate, so drain on that instead.
    .onTouchesUp(() => release());

  const pillStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  // Scaled from the left edge rather than animating width, so the sweep
  // costs no layout per frame.
  const fillStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: fill.value }] }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={[styles.pill, pillStyle]}
        accessible
        accessibilityRole="button"
        accessibilityLabel="Pass"
        accessibilityHint="Hold to skip this round"
        // A screen reader's double tap can't sustain a hold.
        onAccessibilityTap={onPass}
      >
        <Animated.View style={[styles.fill, fillStyle]} />
        <View style={styles.badge}>
          <Svg width={10} height={10}>
            <Path d="M2 2 L8 8 M8 2 L2 8" stroke={Colors.bone} strokeWidth={1.5} strokeLinecap="round" />
          </Svg>
        </View>
        <Text style={styles.text}>HOLD TO PASS</Text>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  pill: {
    height: EDGE_PILL_HEIGHT,
    borderRadius: 999,
    backgroundColor: Colors.rust,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    overflow: "hidden",
  },
  fill: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0, 0, 0, 0.28)",
    transformOrigin: "left center",
  },
  badge: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: Colors.bone,
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    fontFamily: Fonts.bodyBold,
    fontSize: 15,
    letterSpacing: 1,
    color: Colors.bone,
  },
});
