import { StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useDerivedValue, useSharedValue, withSpring } from "react-native-reanimated";

import { Colors, Fonts, Motion, Spacing, Theme } from "@/constants/theme";
import { DELAYED_FILL_SPRING, SWIPE_COMMIT_DISTANCE, SWIPE_MAX_DRAG } from "@/constants/gestures";
import { useReducedMotion } from "@/lib/accessibility";
import { selection } from "@/lib/haptics";

export interface SwipeActionProps {
  label: string;
  hint?: string;
  onConfirm: () => void;
  tone?: "default" | "accent" | "destructive" | "calm";
  direction?: "left" | "right";
  disabled?: boolean;
}

/** The shared Cardinal swipe row, including the delayed fill used on Home. */
export function SwipeAction({ label, hint, onConfirm, tone = "default", direction = "right", disabled = false }: SwipeActionProps) {
  const reducedMotion = useReducedMotion();
  const drag = useSharedValue(0);
  const sign = direction === "right" ? 1 : -1;
  const commit = () => { selection(); onConfirm(); };
  const gesture = Gesture.Pan()
    .enabled(!disabled)
    .activeOffsetX([-8, 8])
    .onChange((event) => {
      const travel = Math.max(0, Math.min(SWIPE_MAX_DRAG, event.translationX * sign));
      drag.value = travel * sign;
    })
    .onEnd(() => {
      if (drag.value * sign > SWIPE_COMMIT_DISTANCE) runOnJS(commit)();
      drag.value = reducedMotion ? 0 : withSpring(0, Motion.snap);
    });
  const fillDrag = useDerivedValue(() => reducedMotion ? Math.abs(drag.value) : withSpring(Math.abs(drag.value), DELAYED_FILL_SPRING));
  const contentStyle = useAnimatedStyle(() => ({ transform: [{ translateX: drag.value }] }));
  const fillStyle = useAnimatedStyle(() => ({ width: `${Math.max(0, Math.min(100, (fillDrag.value / SWIPE_COMMIT_DISTANCE) * 100))}%` }));
  const fillColor = tone === "default" ? Theme.surface : tone === "calm" ? Colors.blue : Colors.rust;

  return (
    <View style={[styles.row, disabled && styles.disabled]}>
      <Animated.View style={[styles.fill, direction === "right" ? styles.left : styles.right, fillStyle, { backgroundColor: fillColor }]} />
      <GestureDetector gesture={gesture}>
        <Animated.View style={[styles.content, contentStyle]}>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.hint}>{hint ?? `SWIPE ${direction.toUpperCase()}`}</Text>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { height: 56, borderRadius: 16, backgroundColor: Theme.surface, overflow: "hidden" },
  disabled: { opacity: 0.4 },
  fill: { position: "absolute", top: 0, bottom: 0 },
  left: { left: 0 }, right: { right: 0 },
  content: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: Spacing.lg },
  label: { fontFamily: Fonts.bodyBold, fontSize: 15, letterSpacing: 0.5, color: Theme.text },
  hint: { fontFamily: Fonts.bodyBold, fontSize: 11, letterSpacing: 1.2, color: Theme.textMuted },
});
