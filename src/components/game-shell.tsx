import { useRouter } from "expo-router";
import { useEffect, useState, type ReactNode } from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Home from "@/app/home";
import {
  PULL_TAB_HEIGHT,
  PULL_TAB_WIDTH,
  PullTab,
} from "@/components/pull-tab";
import { Colors, Fonts, Spacing, Theme } from "@/constants/theme";

/** How far the exit tab pokes into the screen while it is closed. */
const TAB_PEEK = PULL_TAB_WIDTH;
/** Extra width tucked under home's edge so the tab never shows a seam. */
const TAB_TUCK = 40;

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
 * The exit is the same sled as the settings tab on home — one wide container
 * with the tab on the left and the screen it reveals attached to its right, so
 * the tab belongs to the surface it brings in rather than the one it leaves.
 * Dragging it pulls home across the game instead of shoving the game aside.
 */
export function GameShell({ step, total, children }: GameShellProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width: screenW } = useWindowDimensions();

  // 0 = only the tab peeking in at the right edge, 1 = home has covered the game.
  const exitProgress = useSharedValue(0);
  // 1 = fully off to the right, 0 = settled. Game routes are registered with
  // no stack animation of their own, so the entrance is ours to play.
  const entryProgress = useSharedValue(1);
  // Home rides on the sled, so it only needs to exist once the drag is live —
  // no reason to pay for a second Home's marquee timers for the whole game.
  const [previewHome, setPreviewHome] = useState(false);

  useEffect(() => {
    entryProgress.value = withSpring(0, SETTLE_SPRING);
  }, [entryProgress]);

  function leaveGame() {
    router.back();
  }

  const exitDrag = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .onBegin(() => {
      runOnJS(setPreviewHome)(true);
    })
    .onChange((e) => {
      exitProgress.value = Math.min(
        1,
        Math.max(0, exitProgress.value - e.changeX / screenW),
      );
    })
    .onEnd((e) => {
      const leaving =
        e.velocityX < -600
          ? true
          : e.velocityX > 600
            ? false
            : exitProgress.value > 0.35;
      if (leaving) {
        // Wrapped rather than `runOnJS(router.back)` — handing a detached method
        // across the bridge drops its binding to the router. The preview stays
        // mounted through the pop: it is what the user is looking at by then.
        exitProgress.value = withTiming(1, { duration: 200 }, (done) => {
          if (done) runOnJS(leaveGame)();
        });
        return;
      }
      exitProgress.value = withSpring(0, SETTLE_SPRING, (done) => {
        if (done) runOnJS(setPreviewHome)(false);
      });
    })
    .onFinalize(() => {
      // A touch that never cleared activeOffsetX gets no onEnd, so nothing would
      // ever tear the preview back down. Brushing the tab must not leave a whole
      // second Home mounted and animating away off the right edge.
      if (exitProgress.value === 0) runOnJS(setPreviewHome)(false);
    });

  // The game itself only ever plays its entrance. Leaving is home arriving over
  // the top of it, not the game sliding away.
  const screenStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: screenW * entryProgress.value }],
  }));

  // Closed, the sled sits one tab-width short of the right edge so only the tab
  // shows. Open, it has travelled a full screen width to the left.
  const sledStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: screenW - TAB_PEEK - exitProgress.value * screenW },
    ],
  }));

  const progressLabel = `${String(step).padStart(2, "0")}/${String(total).padStart(2, "0")}`;

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.screen, screenStyle]}>
        {children}

        <Text style={[styles.progress, { top: insets.top + Spacing.md }]}>
          {progressLabel}
        </Text>

        <Animated.View
          style={[styles.sled, { width: screenW + TAB_PEEK }, sledStyle]}
          pointerEvents="box-none"
        >
          <GestureDetector gesture={exitDrag}>
            <PullTab
              label="EXIT"
              backgroundColor={Colors.rust}
              extraWidth={TAB_TUCK}
              style={[styles.exitTab, { top: insets.top + Spacing.md }]}
            />
          </GestureDetector>

          {/* A preview only — the real home takes over the instant the pop
              lands, so nothing here should ever accept a touch. */}
          <View
            style={[styles.homePreview, { width: screenW }]}
            pointerEvents="none"
          >
            {previewHome && <Home />}
          </View>
        </Animated.View>
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
  sled: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    zIndex: 10,
  },
  exitTab: {
    // Inside the sled's own bounds rather than hanging off its left edge:
    // Android clips children that overflow their parent, so a tab positioned
    // outside would neither draw nor take touches there.
    position: "absolute",
    left: 0,
  },
  homePreview: {
    position: "absolute",
    left: TAB_PEEK,
    top: 0,
    bottom: 0,
  },
});
