import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import { Colors, Fonts, Spacing, Theme, Trail } from "@/constants/theme";
import {
  MILESTONES,
  ONBOARDING_PATH,
  PIPE,
  pointAtDistance,
  stageAtDistance,
} from "@/features/onboarding/path";

/** One line per stage, shown centred once the ball has passed that milestone. */
const STAGES = [
  "HOLD THE BALL TO MOVE THROUGH THE PIPE.",
  "NO BUTTONS. THE GESTURE IS THE ANSWER.",
  "UPLOAD YOUR NOTES. SWIPE TO REVISE.",
];

// The SVG canvas extends 100px past the path bounds on every side so the
// pipe's rounded caps and the ball never clip against the drawn edge.
const CONTENT_W = ONBOARDING_PATH.maxX + 200;
const CONTENT_H = ONBOARDING_PATH.maxY + 200;
const LEN = ONBOARDING_PATH.length;

/** Pipe-pixels travelled per second while the ball is held. */
const HOLD_SPEED = 320;
/** Distance covered in one 60fps frame at full speed — the scale for "is moving". */
const FRAME_TRAVEL = HOLD_SPEED / 60;
/** Below this much travel per frame the ball counts as stopped. */
const MOVING_THRESHOLD = FRAME_TRAVEL * 0.15;
/** Release this close to the next checkpoint and the ball finishes the trip itself. */
const SNAP_DISTANCE = 50;
/** Where the ball sits on screen, as a fraction of the viewport. It never moves. */
const BALL_X = 0.5;
const BALL_Y = 0.68;
/** Distance the ball travels to for each stage — the next milestone, then the end. */
const TARGETS = [...MILESTONES.slice(1), LEN];
/**
 * Eases out, deliberately. The ball moves the instant it is held — full speed
 * from the first frame, so there's no dead air before motion starts — then
 * decelerates smoothly into the checkpoint, landing softly where the haptic
 * fires instead of stopping dead. HOLD_SPEED is therefore an average rather
 * than a literal constant.
 */
const HOLD_EASING = Easing.out(Easing.sin);

/** Gentle settle — used wherever something eases back into place. */
const SETTLE_SPRING = { damping: 16, stiffness: 140, mass: 0.9 } as const;
/** Snappier, for the small indicator that should feel responsive. */
const SNAP_SPRING = { damping: 15, stiffness: 220, mass: 0.7 } as const;

/** Where the ball comes to rest at the end of each stage — drawn faintly so the
 *  user can see how far the next hold has to carry them. Each keeps its distance
 *  so it can fade out once the ball has actually reached it. */
const CHECKPOINTS = TARGETS.map((d) => {
  const p = pointAtDistance(ONBOARDING_PATH, d);
  return { d, x: p.x, y: p.y };
});
const CHECKPOINT_OPACITY = 0.16;

const TRAIL_COUNT = 3;
/** Pipe-distance between successive ghosts at full speed. */
const TRAIL_GAP = 26;

const DOT_SIZE = 8;
const DOT_GAP = 10;
const DOT_STEP = DOT_SIZE + DOT_GAP;
/** Finger travel needed to move the indicator one dot. */
const DRAG_PER_DOT = 52;

/**
 * Gesture-only onboarding. There is nothing to tap — the ball is held in
 * place and advances along the pipe on its own, and everything else (text,
 * camera, dots) derives from how far it has travelled.
 */
export default function Onboarding() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width: screenW, height: screenH } = useWindowDimensions();

  const [stage, setStage] = useState(0);
  const completed = useRef(false);

  // Arc-length position along the pipe — the single source of truth driving
  // the ball, the camera and the current stage.
  const distance = useSharedValue(0);

  const triggerStageHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  // TODO(week5): persist an "onboarded" flag once Firebase Auth gates the entry route.
  const handleComplete = () => {
    if (completed.current) return;
    completed.current = true;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace("/home");
  };

  const dotsHeld = useSharedValue(0);
  /** Puck position in dot units. Follows the stage, but the finger can drag it back. */
  const puckPos = useSharedValue(0);
  const dragDots = useSharedValue(0);
  /** Punches up then eases back on arrival at a checkpoint, in sync with the haptic. */
  const pulse = useSharedValue(0);

  useAnimatedReaction(
    () => stageAtDistance(distance.value),
    (next, prev) => {
      // prev is null on the initial run — skip it so mounting doesn't buzz.
      if (prev !== null && next !== prev) {
        runOnJS(setStage)(next);
        runOnJS(triggerStageHaptic)();
        pulse.value = withSequence(
          withTiming(1, { duration: 90 }),
          withTiming(0, { duration: 280, easing: Easing.out(Easing.quad) }),
        );
      }
      puckPos.value = withSpring(next, SNAP_SPRING);
    },
  );

  // How fast the ball is travelling, -1→1 (signed by direction of travel), smoothed.
  // Drives the trail length so the ghosts only appear while it is genuinely moving,
  // and stream behind whichever direction the ball is currently headed.
  const trail = useSharedValue(0);
  const lastDistance = useSharedValue(0);

  // A frame callback, not a reaction on `distance`: a reaction only fires when the
  // value changes, so the moment the ball stopped the trail would freeze at full
  // spread instead of decaying away behind it.
  useFrameCallback(() => {
    const delta = distance.value - lastDistance.value;
    lastDistance.value = distance.value;
    // Direction only, never magnitude. Scaling the trail by speed made it stretch
    // and contract as the easing varied the pace, which reads as a stagger. A
    // fixed length that simply points the other way when reversing is steadier.
    const target = Math.abs(delta) > MOVING_THRESHOLD ? Math.sign(delta) : 0;
    // Exponential smoothing — the trail still grows and collapses rather than
    // popping, it just no longer tracks instantaneous speed.
    trail.value = trail.value + (target - trail.value) * 0.15;
  });

  const held = useSharedValue(0); // 1 while pressed, drives the press-state scale

  // Pan, not LongPress: a long-press with minDuration(0) satisfies and finalises
  // almost immediately, so the hold would cancel itself within a frame. Pan begins
  // tracking on touch-down and stays alive until the finger lifts, which is what a
  // hold actually needs. Movement is ignored — only begin and release matter.
  const hold = Gesture.Pan()
    .minDistance(0)
    .shouldCancelWhenOutside(false)
    .onBegin(() => {
      held.value = withTiming(1, { duration: 140 });
      const stageNow = stageAtDistance(distance.value);
      const target = TARGETS[stageNow];
      if (target === undefined) return;
      const duration = ((target - distance.value) / HOLD_SPEED) * 1000;
      if (duration <= 0) return;
      distance.value = withTiming(
        target,
        { duration, easing: HOLD_EASING },
        (finished) => {
          if (finished && target >= LEN - 1) runOnJS(handleComplete)();
        },
      );
    })
    .onFinalize(() => {
      held.value = withTiming(0, { duration: 220 });
      // Already finished — let handleComplete take over rather than springing back.
      if (distance.value >= LEN - 1) return;
      cancelAnimation(distance);

      const stageNow = stageAtDistance(distance.value);
      const target = TARGETS[stageNow];
      if (target === undefined) return;

      // Nearly there — carry it home rather than punishing a lift that was all but
      // finished. Losing the whole stage over the last few pixels reads as a bug.
      if (target - distance.value <= SNAP_DISTANCE) {
        const remaining = Math.max(0, target - distance.value);
        distance.value = withTiming(
          target,
          { duration: (remaining / HOLD_SPEED) * 1000, easing: HOLD_EASING },
          (finished) => {
            if (finished && target >= LEN - 1) runOnJS(handleComplete)();
          },
        );
        return;
      }

      // Released early: ease back to the milestone this stage started from, so
      // reaching the next one is always a single deliberate hold.
      distance.value = withSpring(MILESTONES[stageNow], SETTLE_SPRING);
    });

  const ballStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - held.value * 0.08 + pulse.value * 0.12 }],
  }));

  const dotsGesture = Gesture.Pan()
    .minDistance(0)
    .shouldCancelWhenOutside(false)
    .onBegin(() => {
      dotsHeld.value = withTiming(1, { duration: 160 });
    })
    .onChange((e) => {
      // Backwards only — forward is earned by holding the ball, never scrubbed.
      const raw = e.translationX / DRAG_PER_DOT;
      dragDots.value = Math.min(0, Math.max(-puckPos.value, raw));
    })
    .onEnd(() => {
      const from = Math.round(puckPos.value);
      const target = Math.max(
        0,
        Math.min(from, Math.round(puckPos.value + dragDots.value)),
      );
      dragDots.value = 0;
      puckPos.value = withSpring(target, SNAP_SPRING);
      if (target >= from) return;
      // Commit: walk the ball back down the pipe to that stage's milestone.
      const d = MILESTONES[target];
      const duration = ((distance.value - d) / HOLD_SPEED) * 1000;
      distance.value = withTiming(d, { duration, easing: HOLD_EASING });
    })
    .onFinalize(() => {
      dotsHeld.value = withSpring(0, SNAP_SPRING);
      dragDots.value = 0;
    });

  const dotsStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + dotsHeld.value * 0.4 }],
  }));

  const puckStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: Math.max(0, puckPos.value + dragDots.value) * DOT_STEP },
    ],
  }));

  const cameraStyle = useAnimatedStyle(() => {
    const p = pointAtDistance(ONBOARDING_PATH, distance.value);
    return {
      transform: [
        { translateX: screenW * BALL_X - p.x },
        { translateY: screenH * BALL_Y - p.y },
      ],
    };
  });

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.camera, cameraStyle]}>
        <Svg width={CONTENT_W} height={CONTENT_H}>
          {/* Stroking the same centreline twice — wide in bone, then narrower
              in rust — produces both pipe walls with correct corner radii. */}
          <Path
            d={ONBOARDING_PATH.d}
            stroke={Colors.bone}
            strokeWidth={PIPE.bore + PIPE.wall * 2}
            strokeLinecap="round"
            fill="none"
          />
          <Path
            d={ONBOARDING_PATH.d}
            stroke={Colors.rust}
            strokeWidth={PIPE.bore}
            strokeLinecap="round"
            fill="none"
          />
        </Svg>

        {CHECKPOINTS.map((cp) => (
          <Checkpoint key={cp.d} at={cp} distance={distance} />
        ))}

        {/* Furthest ghost first, so the nearer brighter ones paint over it. With
            solid fills the paint order is the depth order. */}
        {Array.from({ length: TRAIL_COUNT }, (_, i) => TRAIL_COUNT - 1 - i).map(
          (i) => (
            <Ghost key={i} index={i} distance={distance} trail={trail} />
          ),
        )}
      </Animated.View>

      <GestureDetector gesture={hold}>
        <Animated.View
          style={[
            styles.ball,
            ballStyle,
            {
              left: screenW * BALL_X - PIPE.ballSize / 2,
              top: screenH * BALL_Y - PIPE.ballSize / 2,
            },
          ]}
          hitSlop={20}
        />
      </GestureDetector>

      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Text style={styles.wordmark}>CARDINAL</Text>
      </View>

      <View style={[styles.bodyWrap, { top: screenH * 0.45 }]}>
        <Text style={styles.body}>{STAGES[stage]}</Text>
      </View>

      <View
        style={[styles.dotsAnchor, { bottom: insets.bottom + Spacing.lg }]}
        pointerEvents="box-none"
      >
        <GestureDetector gesture={dotsGesture}>
          <Animated.View style={dotsStyle} hitSlop={24}>
            <BlurView intensity={24} tint="light" style={styles.glass}>
              {STAGES.map((_, i) => (
                <View key={i} style={styles.dotDim} />
              ))}
              <Animated.View style={[styles.puck, puckStyle]} />
            </BlurView>
          </Animated.View>
        </GestureDetector>
      </View>
    </View>
  );
}

/**
 * Marker for where the current hold ends. It fades out once the ball has reached
 * it, so only the checkpoints still ahead are ever shown — and fades back in if
 * the user scrubs back past it.
 */
function Checkpoint({
  at,
  distance,
}: {
  at: { d: number; x: number; y: number };
  distance: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => ({
    // Tolerance, because the ball lands exactly on the checkpoint distance.
    opacity: withTiming(distance.value >= at.d - 1 ? 0 : CHECKPOINT_OPACITY, {
      duration: 240,
    }),
  }));

  return (
    <Animated.View
      style={[
        styles.checkpoint,
        { left: at.x - PIPE.ballSize / 8, top: at.y - PIPE.ballSize / 8 },
        style,
      ]}
    />
  );
}

function Ghost({
  index,
  distance,
  trail,
}: {
  index: number;
  distance: SharedValue<number>;
  trail: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    // Lag behind the ball along the pipe, so the trail follows the bends. Signed
    // `trail` flips this to the far side of the ball when scrubbing backwards.
    const lag = (index + 1) * TRAIL_GAP * trail.value;
    const p = pointAtDistance(
      ONBOARDING_PATH,
      Math.max(0, distance.value - lag),
    );
    return {
      transform: [
        { translateX: p.x - PIPE.ballSize / 2 },
        { translateY: p.y - PIPE.ballSize / 2 },
      ],
    };
  });

  return (
    <Animated.View
      style={[styles.ghost, { backgroundColor: Trail[index] }, style]}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.rust,
    overflow: "hidden",
  },
  camera: {
    position: "absolute",
    top: 0,
    left: 0,
    width: CONTENT_W,
    height: CONTENT_H,
  },
  ball: {
    position: "absolute",
    width: PIPE.ballSize,
    height: PIPE.ballSize,
    borderRadius: PIPE.ballSize / 2,
    backgroundColor: Colors.bone,
  },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  wordmark: {
    backgroundColor: Colors.rust,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    fontFamily: Fonts.display,
    fontSize: 28,
    color: Colors.bone,
    letterSpacing: 2,
  },
  checkpoint: {
    position: "absolute",
    width: PIPE.ballSize / 4,
    height: PIPE.ballSize / 4,
    borderRadius: PIPE.ballSize / 8,
    backgroundColor: Colors.bone,
  },
  ghost: {
    position: "absolute",
    left: 0,
    top: 0,
    width: PIPE.ballSize,
    height: PIPE.ballSize,
    borderRadius: PIPE.ballSize / 2,
  },
  bodyWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  body: {
    // Masks the pipe behind the copy — the text must stay readable wherever the
    // ball happens to be.
    backgroundColor: Colors.rust,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    maxWidth: "88%",
    fontFamily: Fonts.body,
    fontSize: 25,
    color: Colors.bone,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    textAlign: "center",
  },
  dotsAnchor: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  glass: {
    flexDirection: "row",
    alignItems: "center",
    gap: DOT_GAP,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 999,
    // Required, or the blur ignores borderRadius and renders as a square.
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.glassEdge,
    backgroundColor: Theme.glassTint,
  },
  dotDim: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: Colors.bone,
    opacity: 0.35,
  },
  puck: {
    position: "absolute",
    // Matches the capsule's padding so the puck starts exactly over the first dot.
    left: Spacing.md,
    top: Spacing.sm,
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: Colors.bone,
  },
});
