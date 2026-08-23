import { useState } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
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
import { PULL_TAB_WIDTH, PullTab } from "@/components/pull-tab";
import { Colors, Spacing } from "@/constants/theme";

/** How far the exit tab pokes into the screen while it is closed. */
const TAB_PEEK = PULL_TAB_WIDTH;
/** Extra width tucked under home's edge so the tab never shows a seam. */
const TAB_TUCK = 40;

const SETTLE_SPRING = { damping: 16, stiffness: 140, mass: 0.9 } as const;

interface ExitSledProps {
  label: string;
  /** Runs once the sled has fully covered the screen. */
  onLeave: () => void;
  backgroundColor?: string;
  /** Which edge the tab — and therefore Home — arrives from. This is the
   *  whole spatial model in one prop: games live to the left of Home and
   *  keep their tab on the right (drag left, Home slides in from the
   *  right); course detail lives to the right of Home and mirrors that
   *  (drag right, Home slides in from the left). The edge a screen's tab
   *  sits on is what tells you which way home is. Default 'right' is every
   *  existing caller's unchanged behaviour. */
  edge?: "left" | "right";
}

/**
 * The app's shared exit gesture: drag a tab and Home rides in on a sled to
 * cover whatever screen is showing.
 *
 * The tab belongs to the surface it brings in, not the one it leaves — it
 * sits on one edge of the sled with a Home preview filling the rest, so
 * dragging it pulls Home across the current screen instead of shoving the
 * current screen aside. That is also why a cheaper "translate a tab a few
 * pixels, then navigate" gesture is the wrong shape for this: it never shows
 * the surface underneath, so it isn't reproducing this gesture at all, just
 * something that looks similar until you drag it.
 */
export function ExitSled({
  label,
  onLeave,
  backgroundColor = Colors.rust,
  edge = "right",
}: ExitSledProps) {
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const isLeft = edge === "left";

  // 0 = only the tab peeking in at its edge, 1 = home has covered the screen.
  const exitProgress = useSharedValue(0);
  // Home rides on the sled, so it only needs to exist once the drag is live —
  // no reason to pay for a second Home's marquee frame callbacks for the whole
  // screen's lifetime.
  const [previewHome, setPreviewHome] = useState(false);

  function leave() {
    onLeave();
  }

  const exitDrag = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .onBegin(() => {
      runOnJS(setPreviewHome)(true);
    })
    .onChange((e) => {
      // Right edge: dragging LEFT (negative changeX) opens, so progress
      // rises as changeX falls — subtract it. Left edge mirrors around the
      // other pivot: dragging RIGHT opens, so progress rises with changeX —
      // add it. Get this backwards and the tab fights the finger instead of
      // following it.
      const next = isLeft
        ? exitProgress.value + e.changeX / screenW
        : exitProgress.value - e.changeX / screenW;
      exitProgress.value = Math.min(1, Math.max(0, next));
    })
    .onEnd((e) => {
      const leaving = isLeft
        ? e.velocityX > 600
          ? true
          : e.velocityX < -600
            ? false
            : exitProgress.value > 0.35
        : e.velocityX < -600
          ? true
          : e.velocityX > 600
            ? false
            : exitProgress.value > 0.35;
      if (leaving) {
        // Wrapped in a local `leave` rather than passed as `runOnJS(onLeave)`
        // directly — a detached method (like `router.back`, which is what
        // course detail's onLeave resolves to) loses its binding crossing the
        // bridge. The preview stays mounted through the pop: it is what the
        // user is looking at by then.
        exitProgress.value = withTiming(1, { duration: 200 }, (done) => {
          if (done) runOnJS(leave)();
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

  // Right edge: closed, the sled sits one tab-width short of the right edge
  // so only the tab shows; open, it has travelled a full screen width left.
  // Left edge mirrors around the opposite pivot (0 instead of screenW -
  // TAB_PEEK): closed sits a full screen width off to the left, open lands
  // flush at 0.
  const sledStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: isLeft
          ? screenW * (exitProgress.value - 1)
          : screenW - TAB_PEEK - exitProgress.value * screenW,
      },
    ],
  }));

  return (
    <Animated.View
      style={[styles.sled, { width: screenW + TAB_PEEK }, sledStyle]}
      pointerEvents="box-none"
    >
      <GestureDetector gesture={exitDrag}>
        <PullTab
          label={label}
          backgroundColor={backgroundColor}
          extraWidth={TAB_TUCK}
          edge={edge}
          style={[
            styles.exitTab,
            { top: insets.top + Spacing.md },
            // Right edge tucks its extra width rightward from sled-local 0;
            // left edge mirrors that, tucking leftward from screenW so the
            // tuck still ends up under wherever the preview sits.
            isLeft ? { left: screenW - TAB_TUCK } : { left: 0 },
          ]}
        />
      </GestureDetector>

      {/* A preview only — the real home takes over the instant the pop
          lands, so nothing here should ever accept a touch. Rendered after
          the tab so it paints on top: the TAB_TUCK overlap has to disappear
          under home or the drag shows a seam where the tab's flush edge
          pokes out past home's. */}
      <View
        style={[
          styles.homePreview,
          { width: screenW },
          isLeft ? { left: 0 } : { left: TAB_PEEK },
        ]}
        pointerEvents="none"
      >
        {previewHome && <Home />}
      </View>
    </Animated.View>
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
  exitTab: {
    // Inside the sled's own bounds rather than hanging off an edge: Android
    // clips children that overflow their parent, so a tab positioned
    // outside would neither draw nor take touches there.
    position: "absolute",
  },
  homePreview: {
    position: "absolute",
    top: 0,
    bottom: 0,
    // Clipped to exactly one screen, because Home is not self-contained: it
    // mounts SettingsPanel, whose closed sled parks the whole settings panel
    // a full screen width off Home's right edge, and UploadSheet does the
    // same below its bottom edge. Unclipped, those park somewhere harmless
    // for a right-edge sled but land square on the visible screen for a
    // left-edge one, which reads as the detail screen glitching into
    // settings the moment the drag starts. The preview must show what Home
    // shows and nothing it merely parks nearby.
    overflow: "hidden",
  },
});
