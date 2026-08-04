import { useState } from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PULL_TAB_WIDTH, PullTab } from "@/components/pull-tab";
import { Colors, Fonts, Spacing, Theme } from "@/constants/theme";

/** How far the tab pokes into the screen when the panel is closed. */
const TAB_PEEK = PULL_TAB_WIDTH;
/** Extra width tucked under the panel edge so the tab never shows a seam. */
const TAB_TUCK = 40;

const PANEL_SPRING = { damping: 18, stiffness: 140, mass: 0.9 } as const;

/**
 * Full-screen settings panel, dragged into view by the tab peeking in from the
 * right edge. There is no tap target anywhere — the tab and the open panel share
 * one Pan gesture, so pulling either direction is what opens and closes it.
 *
 * The whole thing is one wide sled: tab on the left, panel to its right. The tab
 * has to live INSIDE the dragged view's bounds rather than hanging off its left
 * edge, because Android clips children that overflow their parent — a tab
 * positioned outside would neither draw nor take touches there.
 */
export function SettingsPanel() {
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();

  // 0 = closed, 1 = open.
  const progress = useSharedValue(0);

  const sledStyle = useAnimatedStyle(() => ({
    // Closed, the sled sits one tab-width short of the right edge, so only the
    // tab shows. Open, it has travelled a full screen width to the left.
    transform: [{ translateX: screenW - TAB_PEEK - progress.value * screenW }],
  }));

  // Two instances of the same pan, because one Gesture object cannot be attached
  // to two views. The tab carries one; the open panel carries the other so it can
  // be pushed back. The sled itself stays untouchable, or its full-height column
  // down the right edge would swallow every gesture that started there.
  const makeDrag = () =>
    Gesture.Pan()
      // Deliberate: a dozen pixels of sideways travel before this takes over, so
      // brushing past the tab never drags the settings screen out.
      .activeOffsetX([-12, 12])
      .onChange((e) => {
        // Dragging left (negative changeX) opens it.
        progress.value = Math.min(
          1,
          Math.max(0, progress.value - e.changeX / screenW),
        );
      })
      .onEnd((e) => {
        // A decisive flick wins over position, so a short fast pull still opens it.
        const open =
          e.velocityX < -600
            ? true
            : e.velocityX > 600
              ? false
              : progress.value > 0.4;
        progress.value = withSpring(open ? 1 : 0, PANEL_SPRING);
      });

  return (
    <Animated.View
      style={[styles.sled, { width: screenW + TAB_PEEK }, sledStyle]}
      pointerEvents="box-none"
    >
      <GestureDetector gesture={makeDrag()}>
        <PullTab
          label="SETTINGS"
          backgroundColor={Colors.charcoal}
          extraWidth={TAB_TUCK}
          style={[styles.tab, { top: insets.top + Spacing.md }]}
        />
      </GestureDetector>

      <GestureDetector gesture={makeDrag()}>
        <View style={[styles.panel, { width: screenW }]}>
          <View style={{ paddingTop: insets.top + Spacing.xl }}>
            <Text style={styles.heading}>SETTINGS</Text>

            <Text style={styles.sectionLabel}>ACCOUNT</Text>
            {/* TODO(week5): populate from Firebase Auth once the login flow exists. */}
            <InfoRow label="NAME" value="GUEST" />
            <InfoRow label="SYNC" value="OFF" />

            <Text style={styles.sectionLabel}>ACCESSIBILITY</Text>
            <AccessibilityRow />
            {/* TODO(week7): wire to the real tap-zone overlay when the accessibility mode ships. */}

            <Text style={styles.sectionLabel}>ABOUT</Text>
            <InfoRow label="VERSION" value="1.0.0" />
            <InfoRow label="BUILD" value="WEEK 5" />
          </View>

          <Text style={[styles.hint, { bottom: insets.bottom + Spacing.xl }]}>
            DRAG RIGHT TO CLOSE
          </Text>
        </View>
      </GestureDetector>
    </Animated.View>
  );
}

/** A static label/value line, used for ACCOUNT and ABOUT. */
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

/**
 * EDGE TAP ZONES toggle. A drag-only switch — the knob follows the finger
 * and releasing snaps it to the nearer side, matching the no-tap premise.
 */
function AccessibilityRow() {
  const [tapZones, setTapZones] = useState(false);
  const knob = useSharedValue(0); // 0 = off, 1 = on

  // The child toggle's GestureDetector takes precedence over the panel's
  // close-drag automatically (innermost first), so this never fights the sled.
  const toggleDrag = Gesture.Pan()
    .activeOffsetX([-6, 6])
    .onChange((e) => {
      knob.value = Math.min(1, Math.max(0, knob.value + e.changeX / 22));
    })
    .onEnd(() => {
      const on = knob.value > 0.5;
      knob.value = withSpring(on ? 1 : 0, {
        damping: 18,
        stiffness: 220,
        mass: 0.7,
      });
      runOnJS(setTapZones)(on);
    });

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      knob.value,
      [0, 1],
      [Theme.surface, Colors.rust],
    ),
  }));

  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: knob.value * 22 }],
  }));

  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>EDGE TAP ZONES</Text>
      <View style={styles.toggleWrap}>
        <Text style={styles.toggleState}>{tapZones ? "ON" : "OFF"}</Text>
        <GestureDetector gesture={toggleDrag}>
          <Animated.View style={[styles.track, trackStyle]}>
            <Animated.View style={[styles.knob, knobStyle]} />
          </Animated.View>
        </GestureDetector>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sled: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    zIndex: 10,
  },
  tab: {
    position: "absolute",
    left: 0,
  },
  panel: {
    position: "absolute",
    left: TAB_PEEK,
    top: 0,
    bottom: 0,
    backgroundColor: Theme.background,
    paddingHorizontal: Spacing.lg,
  },
  heading: {
    fontFamily: Fonts.display,
    color: Theme.text,
    letterSpacing: 2,
    fontSize: 40,
  },
  sectionLabel: {
    fontFamily: Fonts.bodyBold,
    fontSize: 12,
    letterSpacing: 2,
    color: Theme.textMuted,
    marginTop: Spacing.xl,
    marginBottom: Spacing.sm,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.glassEdge,
  },
  infoLabel: {
    fontFamily: Fonts.body,
    fontSize: 15,
    color: Theme.text,
  },
  infoValue: {
    fontFamily: Fonts.bodyBold,
    fontSize: 15,
    color: Theme.textMuted,
  },
  toggleWrap: {
    flexDirection: "row",
    alignItems: "center",
  },
  toggleState: {
    fontFamily: Fonts.bodyBold,
    fontSize: 12,
    color: Theme.textMuted,
    marginRight: Spacing.sm,
  },
  track: {
    width: 52,
    height: 30,
    borderRadius: 999,
  },
  knob: {
    position: "absolute",
    left: 3,
    top: 3,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.bone,
  },
  hint: {
    position: "absolute",
    left: Spacing.lg,
    right: Spacing.lg,
    fontFamily: Fonts.body,
    fontSize: 13,
    color: Theme.textMuted,
  },
});
