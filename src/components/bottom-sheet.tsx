import { forwardRef, useEffect, useImperativeHandle, type PropsWithChildren } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { Fonts, Motion, Radius, Spacing, Theme } from "@/constants/theme";
import { useTraditionalUx } from "@/features/preferences/preferences";
import { useReducedMotion } from "@/lib/accessibility";

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
}

/** Fraction of the window height the sheet rests at, leaving a strip of the
 *  dimmed screen visible above it. */
const HEIGHT_FRACTION = 0.94;
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
 * A hand-rolled bottom sheet: a dimmed backdrop and a rounded card that
 * slides up from the bottom, dismissible only by dragging its grabber down
 * past the threshold. No native modal presentation is involved — the route
 * that hosts this renders fully transparent and this component draws and
 * animates everything itself.
 */
export const BottomSheet = forwardRef<BottomSheetHandle, BottomSheetProps>(
  function BottomSheet({ children, onRequestClose, onClosed }, ref) {
    const { height: screenH } = useWindowDimensions();
    const reducedMotion = useReducedMotion();
    const traditional = useTraditionalUx();

    // 0 at rest, screenH once fully off screen below. Drives both the
    // sheet's own position and, inverted, how dim the backdrop reads.
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

    const backdropStyle = useAnimatedStyle(() => ({
      opacity: interpolate(translateY.value, [0, screenH], [1, 0]),
    }));

    return (
      <View style={styles.fill}>
        <Animated.View style={[styles.backdrop, backdropStyle]} pointerEvents="none" />
        <Animated.View
          style={[styles.sheet, { height: screenH * HEIGHT_FRACTION }, sheetStyle]}
          // VoiceOver's two-finger scrub stands in for the grabber drag,
          // which assistive tech cannot perform, in either mode.
          onAccessibilityEscape={onRequestClose}
        >
          {traditional ? (
            // Traditional UX: no drag. The grabber row still reads as the
            // sheet's handle but closes on tap, and a visible close button
            // sits top-right; both go through onRequestClose so the caller's
            // unsaved-changes prompt still applies.
            <Pressable
              style={styles.grabberRow}
              hitSlop={12}
              onPress={onRequestClose}
              // The × below is the announced close control; this is just a
              // larger tap area for sighted users, so it stays out of the
              // accessibility tree rather than reading "Close" twice.
              accessible={false}
              importantForAccessibility="no"
            >
              <View style={styles.grabber} />
            </Pressable>
          ) : (
            <GestureDetector gesture={drag}>
              <View style={styles.grabberRow} hitSlop={12}>
                <View style={styles.grabber} />
              </View>
            </GestureDetector>
          )}
          <View style={styles.content}>{children}</View>
          {traditional && (
            <Pressable
              style={styles.closeButton}
              hitSlop={8}
              onPress={onRequestClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Text style={styles.closeGlyph}>×</Text>
            </Pressable>
          )}
        </Animated.View>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.55)" },
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
  closeButton: {
    position: "absolute",
    top: Spacing.sm,
    right: Spacing.md,
    width: 40,
    height: 40,
    borderRadius: Radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surface,
  },
  closeGlyph: {
    fontFamily: Fonts.body,
    fontSize: 26,
    lineHeight: 28,
    color: Theme.text,
  },
});
