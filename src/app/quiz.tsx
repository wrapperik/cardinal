import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { Colors, Fonts, Gestures, Spacing, Theme } from '@/constants/theme';
import { SAMPLE_QUESTIONS } from '@/features/quiz/questions';

const CARD_SIZE = 70;
const PILL_H = 44;
const SIDE_PILL_W = 124;

/** Gentle settle — mirrors the spring used for the onboarding and home tabs. */
const SETTLE_SPRING = { damping: 16, stiffness: 140, mass: 0.9 } as const;

/**
 * Compass Quiz. Every question is answered by dragging the top card toward
 * one of four cardinal directions — north/west/east are the three choices,
 * south is always Pass. There is nothing to tap, including the way out: the
 * exit tab is dragged, not pressed, just like the settings tab on home.
 */
export default function Quiz() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width: screenW, height: screenH } = useWindowDimensions();

  // Radius the four answer pills are centred on, and the smaller guide ring
  // drawn inside it. Both scale with screen width, capped so wide screens
  // don't blow the compass out too large.
  const PILL_RADIUS = Math.min(screenW * 0.36, 150);
  const RING_RADIUS = PILL_RADIUS * 0.73;
  const cardLeft = PILL_RADIUS - CARD_SIZE / 2;
  const cardTop = PILL_RADIUS - CARD_SIZE / 2;

  const [index, setIndex] = useState(0);
  const question = SAMPLE_QUESTIONS[index];

  // -1 = no verdict showing. Otherwise the index of the committed answer.
  const verdictIndex = useSharedValue(-1);
  const verdictCorrect = useSharedValue(false);
  // Blocks a second commit from landing while a verdict is still on screen.
  const committing = useRef(false);
  const verdictTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (verdictTimeout.current) clearTimeout(verdictTimeout.current);
    };
  }, []);

  function leaveQuiz() {
    router.back();
  }

  function advanceQuestion() {
    if (index + 1 >= SAMPLE_QUESTIONS.length) {
      router.back();
      return;
    }
    setIndex((i) => i + 1);
  }

  // Plain JS, called via runOnJS from the drag gesture. -1 is Pass: no
  // verdict to show, just move on.
  function commit(answer: number) {
    if (committing.current) return;

    if (answer === -1) {
      advanceQuestion();
      return;
    }

    committing.current = true;
    const correct = answer === question.correctIndex;
    verdictIndex.value = answer;
    verdictCorrect.value = correct;
    Haptics.notificationAsync(
      correct
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Error,
    );

    verdictTimeout.current = setTimeout(() => {
      verdictIndex.value = -1;
      committing.current = false;
      advanceQuestion();
    }, 600);
  }

  const dx = useSharedValue(0);
  const dy = useSharedValue(0);

  const drag = Gesture.Pan()
    .onChange((e) => {
      dx.value += e.changeX;
      dy.value += e.changeY;
    })
    .onEnd((e) => {
      const absX = Math.abs(dx.value);
      const absY = Math.abs(dy.value);
      // Dominant-axis thresholding: a diagonal that favours neither axis is
      // ambiguous, and ambiguous swipes snap back rather than guessing.
      const horizontal = absX > absY * Gestures.dominantAxisRatio;
      const vertical = absY > absX * Gestures.dominantAxisRatio;
      const travel = horizontal ? absX : absY;
      const velocity = horizontal ? Math.abs(e.velocityX) : Math.abs(e.velocityY);
      const commits =
        (horizontal || vertical) &&
        (travel > Gestures.commitDistance || velocity > Gestures.commitVelocity);

      if (commits) {
        // north = choices[0], west = choices[1], east = choices[2], south = pass
        const answer = horizontal ? (dx.value > 0 ? 2 : 1) : dy.value > 0 ? -1 : 0;
        runOnJS(commit)(answer);
      }
      dx.value = withSpring(0, SETTLE_SPRING);
      dy.value = withSpring(0, SETTLE_SPRING);
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: dx.value }, { translateY: dy.value }],
  }));

  const exitX = useSharedValue(0);
  const exitDrag = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .onChange((e) => {
      exitX.value = Math.min(0, exitX.value + e.changeX);
    })
    .onEnd(() => {
      // Wrapped rather than `runOnJS(router.back)` — handing a detached method
      // across the bridge drops its binding to the router.
      if (exitX.value < -60) runOnJS(leaveQuiz)();
      exitX.value = withSpring(0, SETTLE_SPRING);
    });

  const exitStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: exitX.value }],
  }));

  const total = SAMPLE_QUESTIONS.length;
  const progressLabel = `${String(index + 1).padStart(2, '0')}/${String(total).padStart(2, '0')}`;

  return (
    <View style={styles.container}>
      <Text style={[styles.progress, { top: insets.top + Spacing.md }]}>
        {progressLabel}
      </Text>

      <GestureDetector gesture={exitDrag}>
        <Animated.View
          style={[styles.exitTab, { top: insets.top + Spacing.sm }, exitStyle]}
        >
          <Text style={styles.exitChevron}>‹</Text>
          <Text style={styles.exitLabel}>EXIT</Text>
        </Animated.View>
      </GestureDetector>

      <Text style={[styles.question, { top: screenH * 0.2 }]}>
        {question.prompt}
      </Text>

      <View style={[styles.compassWrap, { marginTop: screenH * 0.12 }]}>
        <View style={{ width: PILL_RADIUS * 2, height: PILL_RADIUS * 2 }}>
          <Image
            source={require('../../assets/images/BG-Grid.svg')}
            style={{
              position: 'absolute',
              width: PILL_RADIUS * 2.4,
              height: PILL_RADIUS * 2.4,
              left: -PILL_RADIUS * 0.2,
              top: -PILL_RADIUS * 0.2,
            }}
            contentFit="contain"
          />

          <Svg
            width={RING_RADIUS * 2 + 2}
            height={RING_RADIUS * 2 + 2}
            style={{
              position: 'absolute',
              left: PILL_RADIUS - RING_RADIUS - 1,
              top: PILL_RADIUS - RING_RADIUS - 1,
            }}
          >
            <Circle
              cx={RING_RADIUS + 1}
              cy={RING_RADIUS + 1}
              r={RING_RADIUS}
              stroke={Colors.bone}
              strokeWidth={1}
              fill="none"
            />
          </Svg>

          {/* Direction glows sit behind the pills, so render them first. */}
          <DirectionGlow
            direction="north"
            dx={dx}
            dy={dy}
            left={PILL_RADIUS - CARD_SIZE * 0.8}
            top={-CARD_SIZE * 0.8}
          />
          <DirectionGlow
            direction="south"
            dx={dx}
            dy={dy}
            left={PILL_RADIUS - CARD_SIZE * 0.8}
            top={PILL_RADIUS * 2 - CARD_SIZE * 0.8}
          />
          <DirectionGlow
            direction="west"
            dx={dx}
            dy={dy}
            left={-CARD_SIZE * 0.8}
            top={PILL_RADIUS - CARD_SIZE * 0.8}
          />
          <DirectionGlow
            direction="east"
            dx={dx}
            dy={dy}
            left={PILL_RADIUS * 2 - CARD_SIZE * 0.8}
            top={PILL_RADIUS - CARD_SIZE * 0.8}
          />

          <View style={[styles.northWrap, { top: -PILL_H / 2 }]}>
            <AnswerPill
              index={0}
              label={question.choices[0]}
              verdictIndex={verdictIndex}
              verdictCorrect={verdictCorrect}
            />
          </View>

          <View style={[styles.southWrap, { bottom: -PILL_H / 2 }]}>
            <View style={styles.passPill}>
              <View style={styles.passBadge}>
                <Text style={styles.passBadgeText}>×</Text>
              </View>
              <Text style={styles.passText}>PASS</Text>
            </View>
          </View>

          <View
            style={[styles.westWrap, { top: PILL_RADIUS - PILL_H / 2 }]}
          >
            <AnswerPill
              index={1}
              label={question.choices[1]}
              verdictIndex={verdictIndex}
              verdictCorrect={verdictCorrect}
            />
          </View>

          <View
            style={[styles.eastWrap, { top: PILL_RADIUS - PILL_H / 2 }]}
          >
            <AnswerPill
              index={2}
              label={question.choices[2]}
              verdictIndex={verdictIndex}
              verdictCorrect={verdictCorrect}
            />
          </View>

          <View
            style={[
              styles.cardCircle,
              styles.cardBack,
              { left: cardLeft, top: cardTop + 40 },
            ]}
          />
          <View
            style={[
              styles.cardCircle,
              styles.cardMid,
              { left: cardLeft, top: cardTop + 22 },
            ]}
          />
          <GestureDetector gesture={drag}>
            <Animated.View
              style={[
                styles.cardCircle,
                styles.cardTop,
                { left: cardLeft, top: cardTop },
                cardStyle,
              ]}
            />
          </GestureDetector>
        </View>
      </View>
    </View>
  );
}

/**
 * One of the three answer pills (north/west/east). Bone until the drag
 * commits to it, then it flips blue for correct or rust for wrong — the
 * only place in the app blue appears, so it has to read as the payoff.
 */
function AnswerPill({
  index,
  label,
  verdictIndex,
  verdictCorrect,
}: {
  index: number;
  label: string;
  verdictIndex: SharedValue<number>;
  verdictCorrect: SharedValue<boolean>;
}) {
  const pillStyle = useAnimatedStyle(() => {
    const active = verdictIndex.value === index;
    return {
      backgroundColor: withTiming(
        active ? (verdictCorrect.value ? Theme.correct : Theme.incorrect) : Colors.bone,
        { duration: 150 },
      ),
    };
  });

  const textStyle = useAnimatedStyle(() => ({
    color: withTiming(verdictIndex.value === index ? Colors.bone : Colors.charcoal, {
      duration: 150,
    }),
  }));

  return (
    <Animated.View style={[styles.pill, pillStyle]}>
      <Animated.Text
        style={[styles.pillText, textStyle]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {label}
      </Animated.Text>
    </Animated.View>
  );
}

/**
 * Soft highlight behind one compass point, brightening as the drag commits
 * toward it. Only the dominant-axis direction the drag currently favours
 * ever lights up — the other three stay at zero opacity.
 */
function DirectionGlow({
  direction,
  dx,
  dy,
  left,
  top,
}: {
  direction: 'north' | 'south' | 'east' | 'west';
  dx: SharedValue<number>;
  dy: SharedValue<number>;
  left: number;
  top: number;
}) {
  const style = useAnimatedStyle(() => {
    const absX = Math.abs(dx.value);
    const absY = Math.abs(dy.value);
    const horizontal = absX > absY * Gestures.dominantAxisRatio;
    const vertical = absY > absX * Gestures.dominantAxisRatio;

    let progress = 0;
    if (horizontal && direction === 'east' && dx.value > 0) {
      progress = Math.min(1, absX / Gestures.commitDistance);
    } else if (horizontal && direction === 'west' && dx.value < 0) {
      progress = Math.min(1, absX / Gestures.commitDistance);
    } else if (vertical && direction === 'south' && dy.value > 0) {
      progress = Math.min(1, absY / Gestures.commitDistance);
    } else if (vertical && direction === 'north' && dy.value < 0) {
      progress = Math.min(1, absY / Gestures.commitDistance);
    }

    return { opacity: 0.18 * progress };
  });

  return <Animated.View style={[styles.glow, { left, top }, style]} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.background,
  },
  progress: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontFamily: Fonts.display,
    fontSize: 20,
    color: Theme.text,
    letterSpacing: 2,
  },
  exitTab: {
    position: 'absolute',
    right: -42,
    height: PILL_H,
    backgroundColor: Colors.rust,
    borderTopLeftRadius: 999,
    borderBottomLeftRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  exitChevron: {
    fontFamily: Fonts.body,
    fontSize: 20,
    color: Colors.bone,
  },
  exitLabel: {
    fontFamily: Fonts.bodyBold,
    fontSize: 15,
    letterSpacing: 1,
    color: Colors.bone,
  },
  question: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.xl,
    fontFamily: Fonts.body,
    fontSize: 22,
    lineHeight: 32,
    color: Theme.text,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  compassWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    width: CARD_SIZE * 1.6,
    height: CARD_SIZE * 1.6,
    borderRadius: 999,
    backgroundColor: Colors.bone,
  },
  northWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  southWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  westWrap: {
    position: 'absolute',
    left: -SIDE_PILL_W / 2,
    width: SIDE_PILL_W,
  },
  eastWrap: {
    position: 'absolute',
    right: -SIDE_PILL_W / 2,
    width: SIDE_PILL_W,
  },
  pill: {
    height: PILL_H,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
  },
  pillText: {
    fontFamily: Fonts.bodyBold,
    fontSize: 15,
    letterSpacing: 1,
  },
  passPill: {
    height: PILL_H,
    borderRadius: 999,
    backgroundColor: Colors.rust,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  passBadge: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: Colors.bone,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passBadgeText: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: Colors.bone,
  },
  passText: {
    fontFamily: Fonts.bodyBold,
    fontSize: 15,
    letterSpacing: 1,
    color: Colors.bone,
  },
  cardCircle: {
    position: 'absolute',
    width: CARD_SIZE,
    height: CARD_SIZE,
    borderRadius: CARD_SIZE / 2,
  },
  cardBack: {
    backgroundColor: Theme.surface,
  },
  cardMid: {
    backgroundColor: Theme.textMuted,
  },
  cardTop: {
    backgroundColor: Colors.bone,
  },
});
