import { createContext, useContext, type ReactElement } from "react";
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

/** Set by ActionPair: its buttons share a row, so they render shorter. */
const CompactContext = createContext(false);

/**
 * Two related actions — a dialog's confirm and cancel, a stage's next step
 * and its way out. Traditional UX sets them side by side as two compact
 * buttons, the way a native alert does: secondary on the left, primary on
 * the right. Legacy UX stacks them, primary first, since a swipe row needs
 * the full width to travel.
 */
export function ActionPair({ primary, secondary }: { primary: ReactElement; secondary: ReactElement }) {
  const traditional = useTraditionalUx();
  if (!traditional) {
    return (
      <View style={styles.pairStack}>
        {primary}
        {secondary}
      </View>
    );
  }
  return (
    <CompactContext.Provider value>
      <View style={styles.pairRow}>
        <View style={styles.pairCell}>{secondary}</View>
        <View style={styles.pairCell}>{primary}</View>
      </View>
    </CompactContext.Provider>
  );
}

// The swipe fill has to contrast with the row it grows across — Theme.surface
// on styles.row's own Theme.surface background was invisible, giving a
// default-tone swipe no drag feedback at all. `default` and `accent` both
// resolve to rust there. `calm` was blue, but blue and rust are also the
// games' correct / incorrect colours, so a blue CANCEL beside a rust confirm
// read as a right and a wrong answer; it is a neutral grey now.
function toneFill(tone: NonNullable<SwipeActionProps["tone"]>) {
  return tone === "calm"
    ? TrailDark[0]
    : tone === "light"
      ? TrailDark[2]
      : Colors.rust;
}

/**
 * Traditional UX: an ordinary centred button, `[icon] LABEL`, fired by a tap.
 * There is no drag to reveal a fill, so it is styled at rest — and kept off
 * the games' blue / rust, which mean right and wrong everywhere else:
 *
 * - `accent`: the primary, solid bone with charcoal lettering.
 * - `default`, `calm`: the neutral secondary, on the surface colour.
 * - `light`: a lighter grey secondary.
 * - `destructive`: solid rust with white lettering — the one place red is
 *   the honest signal, carried by the fill so the words stay readable.
 */
function TapAction({ label, onConfirm, tone = "default", disabled = false, icon }: SwipeActionProps) {
  const compact = useContext(CompactContext);
  const destructive = tone === "destructive";
  const primary = tone === "accent";
  const background = primary
    ? Colors.bone
    : destructive
      ? Colors.rust
      : tone === "light" ? TrailDark[2] : Theme.surface;
  const foreground = destructive ? Theme.onAccent : primary ? Colors.charcoal : Colors.bone;
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
        compact && styles.tapCompact,
        { backgroundColor: background },
        pressed && styles.tapPressed,
        disabled && styles.disabled,
      ]}
    >
      {icon && <Icon name={icon} size={compact ? 16 : 18} color={foreground} />}
      <Text
        style={[styles.label, styles.tapLabel, compact && styles.tapLabelCompact, { color: foreground }]}
        numberOfLines={1}
        // Half-width buttons hold labels like STAY SIGNED IN; shrink a
        // little rather than truncate.
        adjustsFontSizeToFit
        minimumFontScale={0.8}
      >
        {text}
      </Text>
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
  tapLabel: { textAlign: "center", flexShrink: 1 },
  tapCompact: { height: 48, paddingHorizontal: Spacing.md, gap: Spacing.xs },
  tapLabelCompact: { fontSize: 14, letterSpacing: 0.3 },
  pairRow: { flexDirection: "row", gap: Spacing.sm },
  pairCell: { flex: 1 },
  pairStack: { gap: Spacing.sm },
  hint: { fontFamily: Fonts.bodyBold, fontSize: 11, letterSpacing: 1.2, color: Theme.textMuted },
});
