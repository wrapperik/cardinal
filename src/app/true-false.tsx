import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, {
  Circle,
  Defs,
  Path,
  RadialGradient,
  Stop,
} from "react-native-svg";

import Home from "@/app/home";
import BgGrid from "@/assets/images/BG-Grid.svg";
import {
  DOT_CLUSTER_HEIGHT,
  DOT_CLUSTER_WIDTH,
  DotCluster,
} from "@/components/dot-cluster";
import {
  PULL_TAB_HEIGHT,
  PULL_TAB_WIDTH,
  PullTab,
} from "@/components/pull-tab";
import { Colors, Fonts, Gestures, Spacing, Theme } from "@/constants/theme";
import {
  SAMPLE_STATEMENTS,
  type TrueFalseStatement,
} from "@/features/true-false/statements";

/** Edge pill footprint. Tall and narrow so it reads as a lever on the rail,
 *  not a button. */
const PILL_W = 56;
const PILL_H = 76;
/** Fraction of the pill kept on screen — the rest bleeds off the edge, which
 *  is what sells it as something dragged FROM rather than tapped. Enough has
 *  to stay on screen to read the label; the reference keeps about three
 *  quarters. */
const PILL_VISIBLE = 0.75;

/** Card tilt ceiling. The card is a circle, so rotation only reads through
 *  the statement text — past ~10° that stops looking like commitment and
 *  starts looking like the text is falling over. */
const ROTATION_MAX = 10;

/** How far the exit tab pokes into the screen while it is closed. */
const TAB_PEEK = PULL_TAB_WIDTH;
/** Extra width tucked under home's edge so the tab never shows a seam. */
const TAB_TUCK = 40;

/** Gentle settle — mirrors the spring used for the onboarding and home tabs. */
const SETTLE_SPRING = { damping: 16, stiffness: 140, mass: 0.9 } as const;

/** Verdict hold. Wrong answers linger longer — the reveal is the lesson. */
const VERDICT_MS = 600;
const VERDICT_WRONG_MS = 1100;

/**
 * True/False. The statement sits on a bone circle at the centre of the
 * screen; the player drags it toward the edge that matches their answer.
 * LEFT is FALSE, RIGHT is TRUE — a deliberate, non-obvious mapping the
 * approved mockup insists on, which is exactly why the edge pills exist:
 * without a label pinned to each side, no one would guess it correctly.
 * Down is Pass. Up, and anything too diagonal to call, snaps back and does
 * nothing — same dominant-axis thresholding as the compass quiz, so a
 * half-hearted swipe never gets read as a guess.
 */
export default function TrueFalse() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width: screenW, height: screenH } = useWindowDimensions();

  // Roughly two thirds of the width, per the reference. The card wants dark
  // space around it — filling the screen makes the edge pills feel like debris
  // pushed against the bezel rather than the two poles the card sits between.
  const CARD_DIAMETER = Math.min(screenW * 0.64, 260);
  const cardLeft = (screenW - CARD_DIAMETER) / 2;
  const cardTop = (screenH - CARD_DIAMETER) / 2;
  // Anchored on the edge pill, not the card, so it's sized off the screen
  // width rather than the card diameter. Half of it falls off-screen by
  // design — only the inward-facing half is ever seen.
  const GLOW_SIZE = screenW * 1.1;

  // Background grids anchor their centres on the corners themselves, so
  // exactly half of each bleeds onto the screen whatever size it renders at.
  const GRID_SIZE = screenW * 1.15;

  // Pills sit off-edge by construction: only PILL_VISIBLE of their width is
  // ever on screen, the rest bleeds past the bezel.
  const leftPillLeft = -(PILL_W * (1 - PILL_VISIBLE));
  const rightPillLeft = screenW - PILL_W * PILL_VISIBLE;
  const pillTop = (screenH - PILL_H) / 2;
  const leftPillCentreX = leftPillLeft + PILL_W / 2;
  const rightPillCentreX = rightPillLeft + PILL_W / 2;

  const [index, setIndex] = useState(0);
  const statement: TrueFalseStatement = SAMPLE_STATEMENTS[index];

  const verdictActive = useSharedValue(false);
  const verdictCorrect = useSharedValue(false);
  // -1 = nothing revealed. On a wrong answer this points at whichever pill
  // WAS right — 0 for FALSE, 1 for TRUE — so a miss still teaches.
  const revealSide = useSharedValue(-1);
  // Blocks a second commit from landing while a verdict is still on screen.
  const committing = useRef(false);
  const verdictTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (verdictTimeout.current) clearTimeout(verdictTimeout.current);
    };
  }, []);

  function leaveTrueFalse() {
    router.back();
  }

  function advanceStatement() {
    if (index + 1 >= SAMPLE_STATEMENTS.length) {
      router.back();
      return;
    }
    setIndex((i) => i + 1);
  }

  // Plain JS, called via runOnJS from the drag gesture. -1 is Pass: no
  // verdict to show, just move on. 0 = FALSE picked, 1 = TRUE picked.
  function commit(answer: number) {
    if (committing.current) return;

    if (answer === -1) {
      advanceStatement();
      return;
    }

    committing.current = true;
    const pickedTrue = answer === 1;
    const correct = pickedTrue === statement.isTrue;
    verdictActive.value = true;
    verdictCorrect.value = correct;
    if (!correct) revealSide.value = statement.isTrue ? 1 : 0;
    Haptics.notificationAsync(
      correct
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Error,
    );

    verdictTimeout.current = setTimeout(
      () => {
        verdictActive.value = false;
        revealSide.value = -1;
        committing.current = false;
        advanceStatement();
      },
      correct ? VERDICT_MS : VERDICT_WRONG_MS,
    );
  }

  const dx = useSharedValue(0);
  const dy = useSharedValue(0);
  // Card press-state, mirroring the onboarding ball's touch acknowledgement.
  const held = useSharedValue(0);

  const drag = Gesture.Pan()
    .onBegin(() => {
      held.value = withTiming(1, { duration: 140 });
    })
    .onChange((e) => {
      dx.value += e.changeX;
      dy.value += e.changeY;
    })
    .onFinalize(() => {
      held.value = withTiming(0, { duration: 220 });
    })
    .onEnd((e) => {
      const absX = Math.abs(dx.value);
      const absY = Math.abs(dy.value);
      // Dominant-axis thresholding: a diagonal that favours neither axis is
      // ambiguous, and ambiguous swipes snap back rather than guessing.
      const horizontal = absX > absY * Gestures.dominantAxisRatio;
      const vertical = absY > absX * Gestures.dominantAxisRatio;
      const travel = horizontal ? absX : absY;
      const velocity = horizontal
        ? Math.abs(e.velocityX)
        : Math.abs(e.velocityY);
      const commits =
        (horizontal || vertical) &&
        (travel > Gestures.commitDistance ||
          velocity > Gestures.commitVelocity);

      if (commits) {
        if (horizontal) {
          // left = FALSE (0), right = TRUE (1).
          runOnJS(commit)(dx.value < 0 ? 0 : 1);
        } else if (dy.value > 0) {
          // Only downward vertical does anything — up is a dead swipe, same
          // as an ambiguous diagonal, and both just fall through to the reset.
          runOnJS(commit)(-1);
        }
      }
      dx.value = withSpring(0, SETTLE_SPRING);
      dy.value = withSpring(0, SETTLE_SPRING);
    });

  const cardStyle = useAnimatedStyle(() => {
    const t = Math.max(
      -1,
      Math.min(1, dx.value / Gestures.commitDistance),
    );
    return {
      transform: [
        { translateX: dx.value },
        { translateY: dy.value },
        { rotateZ: `${t * ROTATION_MAX}deg` },
        { scale: 1 - held.value * 0.04 },
      ],
    };
  });

  // Separate from cardStyle: this one only ever touches colour, the other
  // only ever touches transform, so neither worklet re-runs for changes it
  // doesn't care about.
  const cardFillStyle = useAnimatedStyle(() => ({
    backgroundColor: withTiming(
      verdictActive.value
        ? verdictCorrect.value
          ? Theme.correct
          : Theme.incorrect
        : Colors.bone,
      { duration: 150 },
    ),
  }));

  const statementColorStyle = useAnimatedStyle(() => ({
    color: withTiming(verdictActive.value ? Colors.bone : Colors.charcoal, {
      duration: 150,
    }),
  }));

  // 0 = only the tab peeking in at the right edge, 1 = home has covered the screen.
  const exitProgress = useSharedValue(0);
  // 1 = fully off to the right, 0 = settled. The stack renders this screen with
  // no animation of its own, so the entrance is ours to play.
  const entryProgress = useSharedValue(1);
  // Home rides on the sled, so it only needs to exist once the drag is live —
  // no reason to pay for a second Home's marquee timers for the whole game.
  const [previewHome, setPreviewHome] = useState(false);

  useEffect(() => {
    entryProgress.value = withSpring(0, SETTLE_SPRING);
  }, [entryProgress]);

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
          if (done) runOnJS(leaveTrueFalse)();
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

  // The screen itself only ever plays its entrance. Leaving is home arriving
  // over the top of it, not the screen sliding away.
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

  const total = SAMPLE_STATEMENTS.length;
  const progressLabel = `${String(index + 1).padStart(2, "0")}/${String(total).padStart(2, "0")}`;

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.screen, screenStyle]}>
        {/* Purely ambient — the SVG already carries its own low opacity, so it
            fades out on its own with no extra opacity layered on here. */}
        <BgGrid
          width={GRID_SIZE}
          height={GRID_SIZE}
          style={[styles.grid, { left: -GRID_SIZE / 2, top: -GRID_SIZE / 2 }]}
          pointerEvents="none"
        />
        <BgGrid
          width={GRID_SIZE}
          height={GRID_SIZE}
          style={[
            styles.grid,
            { left: screenW - GRID_SIZE / 2, top: screenH - GRID_SIZE / 2 },
          ]}
          pointerEvents="none"
        />

        {/* Anchored on their own edge pill now, not the card, so they have to
            render this early — behind the progress label, pills, and dot
            clusters, so bloom washes the backdrop instead of dulling them. */}
        <DirectionGlow
          direction="left"
          color={Colors.rust}
          dx={dx}
          dy={dy}
          left={leftPillCentreX - GLOW_SIZE / 2}
          top={pillTop + PILL_H / 2 - GLOW_SIZE / 2}
          size={GLOW_SIZE}
        />
        <DirectionGlow
          direction="right"
          color={Colors.blue}
          dx={dx}
          dy={dy}
          left={rightPillCentreX - GLOW_SIZE / 2}
          top={pillTop + PILL_H / 2 - GLOW_SIZE / 2}
          size={GLOW_SIZE}
        />

        <Text style={[styles.progress, { top: insets.top + Spacing.md }]}>
          {progressLabel}
        </Text>

        <EdgePill
          side="left"
          label="FALSE"
          backgroundColor={Colors.rust}
          dx={dx}
          dy={dy}
          revealSide={revealSide}
          style={{ left: leftPillLeft, top: pillTop }}
        />
        <EdgePill
          side="right"
          label="TRUE"
          backgroundColor={Colors.blue}
          dx={dx}
          dy={dy}
          revealSide={revealSide}
          style={{ left: rightPillLeft, top: pillTop }}
        />

        <DotCluster
          color={Colors.rust}
          style={[
            styles.dotCluster,
            {
              left: leftPillCentreX - DOT_CLUSTER_WIDTH / 2,
              top: pillTop - DOT_CLUSTER_HEIGHT - Spacing.sm,
            },
          ]}
        />
        <DotCluster
          color={Colors.rust}
          style={[
            styles.dotCluster,
            {
              left: leftPillCentreX - DOT_CLUSTER_WIDTH / 2,
              top: pillTop + PILL_H + Spacing.sm,
            },
          ]}
        />
        <DotCluster
          color={Colors.blue}
          mirrored
          style={[
            styles.dotCluster,
            {
              left: rightPillCentreX - DOT_CLUSTER_WIDTH / 2,
              top: pillTop - DOT_CLUSTER_HEIGHT - Spacing.sm,
            },
          ]}
        />
        <DotCluster
          color={Colors.blue}
          mirrored
          style={[
            styles.dotCluster,
            {
              left: rightPillCentreX - DOT_CLUSTER_WIDTH / 2,
              top: pillTop + PILL_H + Spacing.sm,
            },
          ]}
        />

        <GestureDetector gesture={drag}>
          <Animated.View
            style={[
              styles.card,
              {
                left: cardLeft,
                top: cardTop,
                width: CARD_DIAMETER,
                height: CARD_DIAMETER,
                borderRadius: CARD_DIAMETER / 2,
                // The largest square that fits inside a circle has a side of
                // D/√2, so this inset is what keeps every line of text off the
                // curve rather than just the middle one.
                paddingHorizontal: CARD_DIAMETER * 0.146,
              },
              cardStyle,
              cardFillStyle,
            ]}
          >
            <Animated.Text
              style={[styles.statementText, statementColorStyle]}
              numberOfLines={5}
              adjustsFontSizeToFit
            >
              {statement.statement}
            </Animated.Text>
          </Animated.View>
        </GestureDetector>

        <View style={[styles.passWrap, { bottom: insets.bottom + Spacing.xl }]}>
          <View style={styles.passPill}>
            <View style={styles.passBadge}>
              <Svg width={10} height={10}>
                <Path
                  d="M2 2 L8 8 M8 2 L2 8"
                  stroke={Colors.bone}
                  strokeWidth={1.5}
                  strokeLinecap="round"
                />
              </Svg>
            </View>
            <Text style={styles.passText}>PASS</Text>
          </View>
        </View>

        {/* The way out, built exactly like the settings tab on home: one wide
            sled with the tab on the left and the screen it reveals attached to
            its right. The tab belongs to the surface it brings in, so dragging
            it pulls home across the screen rather than shoving this screen aside. */}
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

/**
 * One edge lever — FALSE on the left, TRUE on the right. It brightens and
 * grows slightly as the drag commits toward it, and on a wrong answer the
 * side that WAS right is forced to full strength even though the drag never
 * reached it, so the reveal still lands.
 */
function EdgePill({
  side,
  label,
  backgroundColor,
  dx,
  dy,
  revealSide,
  style,
}: {
  side: "left" | "right";
  label: string;
  backgroundColor: string;
  dx: SharedValue<number>;
  dy: SharedValue<number>;
  revealSide: SharedValue<number>;
  style: { left: number; top: number };
}) {
  const sideIndex = side === "left" ? 0 : 1;

  const pillStyle = useAnimatedStyle(() => {
    const absX = Math.abs(dx.value);
    const absY = Math.abs(dy.value);
    const horizontal = absX > absY * Gestures.dominantAxisRatio;

    let progress = 0;
    if (horizontal && side === "left" && dx.value < 0) {
      progress = Math.min(1, absX / Gestures.commitDistance);
    } else if (horizontal && side === "right" && dx.value > 0) {
      progress = Math.min(1, absX / Gestures.commitDistance);
    }
    if (revealSide.value === sideIndex) progress = 1;

    return {
      opacity: 0.55 + progress * 0.45,
      transform: [{ scale: 1 + progress * 0.08 }],
    };
  });

  return (
    <Animated.View
      style={[styles.pill, { backgroundColor }, style, pillStyle]}
    >
      <Text
        style={[
          styles.pillLabel,
          { transform: [{ rotate: side === "left" ? "-90deg" : "90deg" }] },
        ]}
      >
        {label}
      </Text>
    </Animated.View>
  );
}

/**
 * Soft highlight behind the card, brightening as the drag commits left
 * (toward FALSE) or right (toward TRUE). Only the dominant-axis direction
 * the drag currently favours ever lights up — the other stays at zero.
 */
function DirectionGlow({
  direction,
  color,
  dx,
  dy,
  left,
  top,
  size,
}: {
  direction: "left" | "right";
  color: string;
  dx: SharedValue<number>;
  dy: SharedValue<number>;
  left: number;
  top: number;
  size: number;
}) {
  const style = useAnimatedStyle(() => {
    const absX = Math.abs(dx.value);
    const absY = Math.abs(dy.value);
    const horizontal = absX > absY * Gestures.dominantAxisRatio;

    let progress = 0;
    if (horizontal && direction === "left" && dx.value < 0) {
      progress = Math.min(1, absX / Gestures.commitDistance);
    } else if (horizontal && direction === "right" && dx.value > 0) {
      progress = Math.min(1, absX / Gestures.commitDistance);
    }

    return { opacity: 0.55 * progress };
  });

  // A radial gradient rather than a tinted circle: the glow is wider than the
  // card, so a flat fill would show a hard rim around it and read as a ring
  // instead of light. Two instances only ever exist, so keying the gradient id
  // off the direction is enough to keep them unique.
  const fillId = `glow-${direction}`;

  return (
    <Animated.View
      style={[styles.glow, { left, top, width: size, height: size }, style]}
      pointerEvents="none"
    >
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={fillId} cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={color} stopOpacity={1} />
            <Stop offset="45%" stopColor={color} stopOpacity={0.5} />
            <Stop offset="100%" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${fillId})`} />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    // Home's rust, showing through in the gap the screen has not covered yet
    // while it slides in on mount.
    backgroundColor: Colors.rust,
  },
  screen: {
    flex: 1,
    backgroundColor: Theme.background,
  },
  grid: {
    position: "absolute",
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
  pill: {
    position: "absolute",
    width: PILL_W,
    height: PILL_H,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  pillLabel: {
    fontFamily: Fonts.bodyBold,
    fontSize: 15,
    letterSpacing: 1,
    color: Colors.bone,
  },
  dotCluster: {
    position: "absolute",
  },
  glow: {
    position: "absolute",
  },
  card: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 20,
    elevation: 10,
  },
  statementText: {
    fontFamily: Fonts.body,
    fontSize: 19,
    lineHeight: 25,
    textAlign: "center",
    color: Colors.charcoal,
  },
  passWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  passPill: {
    height: PULL_TAB_HEIGHT,
    borderRadius: 999,
    backgroundColor: Colors.rust,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  passBadge: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: Colors.bone,
    alignItems: "center",
    justifyContent: "center",
  },
  passText: {
    fontFamily: Fonts.bodyBold,
    fontSize: 15,
    letterSpacing: 1,
    color: Colors.bone,
  },
});
