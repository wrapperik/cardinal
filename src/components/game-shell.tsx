import { useEffect, type ReactNode } from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ExitSled } from "@/components/exit-sled";
import { PULL_TAB_HEIGHT } from "@/components/pull-tab";
import { Colors, Fonts, Spacing, Theme } from "@/constants/theme";
import { useRecapRunner } from "@/features/recap/runner";

const SETTLE_SPRING = { damping: 16, stiffness: 140, mass: 0.9 } as const;

/**
 * Vertical room the header claims below the safe area. Games pad their own
 * content down by `insets.top + GAME_HEADER_H` to clear it — the shell cannot
 * do it for them, because most of them position against the full viewport.
 */
export const GAME_HEADER_H = PULL_TAB_HEIGHT + Spacing.lg;

interface GameShellProps {
  /** 1-based position in the deck; rendered as the NN/NN readout. */
  step: number;
  total: number;
  children: ReactNode;
}

/**
 * Everything every game template has in common: the charcoal field, the
 * progress readout, the entrance, and the way out.
 *
 * The exit is ExitSled, the same sled as the settings tab on home — one wide
 * container with the tab on the left and the screen it reveals attached to
 * its right, so the tab belongs to the surface it brings in rather than the
 * one it leaves. Dragging it pulls home across the game instead of shoving
 * the game aside.
 */
export function GameShell({ step, total, children }: GameShellProps) {
  const insets = useSafeAreaInsets();
  const runner = useRecapRunner();
  const { width: screenW } = useWindowDimensions();

  // 1 = fully off to the right, 0 = settled. Game routes are registered with
  // no stack animation of their own, so the entrance is ours to play.
  const entryProgress = useSharedValue(1);

  useEffect(() => {
    entryProgress.value = withSpring(0, SETTLE_SPRING);
  }, [entryProgress]);

  // The game itself only ever plays its entrance. Leaving is home arriving over
  // the top of it, not the game sliding away.
  const screenStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: screenW * entryProgress.value }],
  }));

  const progressLabel = `${String(step).padStart(2, "0")}/${String(total).padStart(2, "0")}`;

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.screen, screenStyle]}>
        {children}

        <Text style={[styles.progress, { top: insets.top + Spacing.md }]}>
          {progressLabel}
        </Text>

        <ExitSled label="EXIT" onLeave={() => runner.abandon()} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    // Home's rust, showing through in the gap the game has not covered yet
    // while it slides in on mount.
    backgroundColor: Colors.rust,
  },
  screen: {
    flex: 1,
    backgroundColor: Theme.background,
  },
  progress: {
    position: "absolute",
    left: 0,
    right: 0,
    textAlign: "center",
    fontFamily: Fonts.display,
    fontSize: 30,
    color: Theme.text,
    letterSpacing: 2,
    marginTop: 8,
  },
});
