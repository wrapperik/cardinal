import { Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useDerivedValue, useSharedValue, withSpring } from "react-native-reanimated";

import { Icon, type IconName } from "@/components/icons";
import { Colors, Fonts, Motion, Radius, Spacing, Theme, TrailDark } from "@/constants/theme";
import { DELAYED_FILL_SPRING, SWIPE_COMMIT_DISTANCE, SWIPE_MAX_DRAG } from "@/constants/gestures";
import { useReducedMotion } from "@/lib/accessibility";
import { useTraditionalUx } from "@/features/preferences/preferences";
import { selection } from "@/lib/haptics";

export interface SwipeActionProps {
  label: string;
  hint?: string;
  onConfirm: () => void;
  tone?: "default" | "accent" | "destructive" | "calm" | "light";
  direction?: "left" | "right";
  disabled?: boolean;
  /** Traditional UX only; the legacy swipe row ignores it. */
  icon?: IconName;
}

/**
 * The shared Cardinal swipe row, including the delayed fill used on Home.
 * Traditional UX renders the same row as a plain tap target instead; props are
 * identical, so every call site adapts without knowing which mode is active.
 */
export function SwipeAction(props: SwipeActionProps) {
  const traditional = useTraditionalUx();
  return traditional ? <TapAction {...props} /> : <GestureSwipeAction {...props} />;
}

// The fill has to contrast with the row it grows across — Theme.surface on
// styles.row's own Theme.surface background was invisible, giving a
// default-tone swipe no drag feedback at all. `default` and `accent` now
// both resolve to rust; `accent` stays as an explicit name for rows that
// are deliberately the primary action, not because it renders any differently.
function toneFill(tone: NonNullable<SwipeActionProps["tone"]>) {
  return tone === "default"
    ? Colors.rust
    : tone === "calm"
      ? Colors.blue
      : tone === "light"
        ? TrailDark[2]
        : Colors.rust;
}

/** Traditional UX: an ordinary centred button, `[icon] LABEL`, fired by a tap.
 *  There is no drag to reveal the tone's fill, so unlike the swipe row it is
 *  styled at rest. `destructive` is a rust outline on the surface colour so it
 *  reads as distinct from the filled rust primary. */
function TapAction({ label, onConfirm, tone = "default", disabled = false, icon }: SwipeActionProps) {
  const destructive = tone === "destructive";
  // At rest, `default` and `accent` can't share rust the way their drag fills
  // do: a stack like SAVE / DISCARD would show two primaries. So `accent` is
  // the filled primary and `default` the neutral secondary.
  const secondary = tone === "default";
  const background = destructive || secondary ? Theme.surface : toneFill(tone);
  const foreground = destructive ? Colors.rust : Colors.bone;
  const text = icon === "plus" ? label.replace(/^\+\s*/, "") : label;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => { selection(); onConfirm(); }}
      style={({ pressed }) => [
        styles.row,
        styles.tapRow,
        { backgroundColor: background },
        destructive && { borderWidth: 2, borderColor: Colors.rust },
        pressed && styles.tapPressed,
        disabled && styles.disabled,
      ]}
    >
      {icon && <Icon name={icon} color={foreground} />}
      <Text style={[styles.label, styles.tapLabel, { color: foreground }]}>{text}</Text>
    </Pressable>
  );
}

function GestureSwipeAction({ label, hint, onConfirm, tone = "default", direction = "right", disabled = false }: SwipeActionProps) {
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
  const fillColor = toneFill(tone);

  return (
    <View
      style={[styles.row, disabled && styles.disabled]}
      // Screen readers cannot perform the swipe, so the row keeps a direct
      // activation path for assistive tech — the same escape hatch MenuRow
      // has. Without it every swipe row in the app is unreachable with
      // VoiceOver or TalkBack on.
      accessible
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      onAccessibilityTap={disabled ? undefined : commit}
    >
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
  row: { height: 56, borderRadius: Radius.card, backgroundColor: Theme.surface, overflow: "hidden" },
  disabled: { opacity: 0.4 },
  fill: { position: "absolute", top: 0, bottom: 0 },
  left: { left: 0 }, right: { right: 0 },
  content: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: Spacing.lg },
  label: { fontFamily: Fonts.bodyBold, fontSize: 15, letterSpacing: 0.5, color: Theme.text },
  tapRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: Spacing.sm, paddingHorizontal: Spacing.lg },
  tapPressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  tapLabel: { textAlign: "center" },
  hint: { fontFamily: Fonts.bodyBold, fontSize: 11, letterSpacing: 1.2, color: Theme.textMuted },
});
