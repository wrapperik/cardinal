import { GlassView } from "expo-glass-effect";
import { forwardRef, useEffect, useImperativeHandle, type PropsWithChildren } from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { Fonts, Motion, Radius, Spacing, Theme } from "@/constants/theme";
import { useReducedMotion } from "@/lib/accessibility";
import { useLiquidGlass } from "@/lib/liquid-glass";

export interface BottomSheetHandle {
  /** Slides the sheet down and off screen, then fires `onClosed`. */
  close: () => void;
}

interface BottomSheetProps extends PropsWithChildren {
  /**
   * Fires when the grabber is dragged past the dismiss threshold. The sheet
   * only springs back to rest here — it does not close itself, since the
   * caller may need to intercept with an "unsaved changes" prompt instead
   * of leaving. Call the ref's `close()` once leaving is actually decided.
   */
  onRequestClose: () => void;
  /** Fires once the close animation has landed off screen — the cue to
   *  actually pop the route, so navigation follows the sheet leaving rather
   *  than cutting it off mid-slide. */
  onClosed: () => void;
  /** Centred in the sheet's header row, level with the close button. */
  title?: string;
}

/** Same light charcoal tint as home's course bar, so the two glass surfaces match. */
const GLASS_TINT = "rgba(30, 30, 30, 0.35)";

/** Fraction of the window height the sheet rests at, leaving the top of the
 *  screen behind it in view. */
const HEIGHT_FRACTION = 0.66;
const GRABBER_ROW_HEIGHT = 32;
/**
 * Higher than a SwipeAction row's commit distance (88px) — dragging an
 * entire sheet away is a bigger, more consequential gesture than confirming
 * a card, and should need a deliberate pull rather than a stray brush on
 * the grabber.
 */
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 900;

/**
 * A hand-rolled bottom sheet: a rounded card that slides up from the bottom
 * over the screen behind it, undimmed. It closes by dragging its top — the
 * grabber and title row — down past the threshold, in both UX modes. No native modal presentation is involved — the route
 * that hosts this renders fully transparent and this component draws and
 * animates everything itself.
 */
export const BottomSheet = forwardRef<BottomSheetHandle, BottomSheetProps>(
  function BottomSheet({ children, onRequestClose, onClosed, title }, ref) {
    const { height: screenH } = useWindowDimensions();
    const reducedMotion = useReducedMotion();
    const glass = useLiquidGlass();

    // 0 at rest, screenH once fully off screen below.
    const translateY = useSharedValue(screenH);

    useEffect(() => {
      translateY.value = reducedMotion ? 0 : withSpring(0, Motion.settle);
      // Once at mount only — the sheet opens from off screen exactly once.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useImperativeHandle(ref, () => ({
      close: () => {
        if (reducedMotion) {
          translateY.value = screenH;
          onClosed();
          return;
        }
        translateY.value = withTiming(
          screenH,
          { duration: 260, easing: Easing.in(Easing.cubic) },
          (finished) => {
            if (finished) runOnJS(onClosed)();
          },
        );
      },
    }), [reducedMotion, onClosed, screenH, translateY]);

    const drag = Gesture.Pan()
      // Vertical travel before claiming the touch, so a tap on the × inside
      // the dragged area still reaches the button.
      .activeOffsetY(8)
      .onChange((e) => {
        translateY.value = Math.max(0, e.translationY);
      })
      .onEnd((e) => {
        const committed = e.translationY > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY;
        translateY.value = withSpring(0, Motion.snap);
        if (committed) runOnJS(onRequestClose)();
      });

    const sheetStyle = useAnimatedStyle(() => ({
      transform: [{ translateY: translateY.value }],
    }));

    return (
      <View style={styles.fill}>
        <Animated.View
          style={[styles.sheet, glass && styles.sheetGlass, { height: screenH * HEIGHT_FRACTION }, sheetStyle]}
          // VoiceOver's two-finger scrub stands in for the grabber drag,
          // which assistive tech cannot perform, in either mode.
          onAccessibilityEscape={onRequestClose}
        >
          {glass && (
            <GlassView
              glassEffectStyle="regular"
              colorScheme="dark"
              tintColor={GLASS_TINT}
              style={styles.glassBacking}
            />
          )}
          {/* The whole top of the sheet is the handle — grabber and title
              row together — so the pull down doesn't have to land on a
              4px bar. */}
          <GestureDetector gesture={drag}>
            <View>
              <View style={styles.grabberRow}>
                <View style={styles.grabber} />
              </View>
              {title ? (
                <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
                  {title}
                </Text>
              ) : null}
            </View>
          </GestureDetector>
          <View style={styles.content}>{children}</View>
        </Animated.View>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  fill: { flex: 1 },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Theme.background,
    borderTopLeftRadius: Radius.sheet,
    borderTopRightRadius: Radius.sheet,
    overflow: "hidden",
  },
  grabberRow: {
    height: GRABBER_ROW_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: Radius.pill,
    backgroundColor: Theme.textMuted,
  },
  content: { flex: 1 },
  // The glass is the sheet's surface there; an opaque fill would hide it.
  sheetGlass: { backgroundColor: "transparent" },
  glassBacking: {
    ...StyleSheet.absoluteFill,
    borderTopLeftRadius: Radius.sheet,
    borderTopRightRadius: Radius.sheet,
  },
  title: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    textAlign: "center",
    fontFamily: Fonts.display,
    fontSize: 24,
    letterSpacing: 2,
    color: Theme.text,
  },
});
