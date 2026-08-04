import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  FadeIn,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path } from "react-native-svg";

import Home from "@/app/home";
import BgGrid from "@/assets/images/BG-Grid.svg";
import { CharacterMark } from "@/components/character-mark";
import {
  PULL_TAB_HEIGHT,
  PULL_TAB_WIDTH,
  PullTab,
} from "@/components/pull-tab";
import {
  Colors,
  Fonts,
  Gestures,
  Spacing,
  Theme,
  TrailDark,
} from "@/constants/theme";
import { useCharacter } from "@/features/character/store";
import { SAMPLE_QUESTIONS } from "@/features/quiz/questions";

/** The draggable puck at the compass centre. */
const CARD_SIZE = 70;

/** Compass targets. All four are the same circle — moving the answer text up
 *  into the list is what makes that possible, and an identical target in every
 *  direction is the only arrangement that cannot read as lopsided. */
const TOKEN_SIZE = 56;

/** The letter is the only thing the list and the compass share, so a drag is
 *  never aimed at a word. Index order is reading order: A, B, C. */
const LETTERS = ["A", "B", "C"] as const;

/** Where each lettered choice sits on the compass — A west, B north, C east,
 *  left-to-right the way the list above is scanned. South is always Pass and
 *  never a choice, which is why it has no entry here. */
const CHOICE_DIRECTION = ["west", "north", "east"] as const;

/** How far the exit tab pokes into the quiz while it is closed. */
const TAB_PEEK = PULL_TAB_WIDTH;
/** Extra width tucked under home's edge so the tab never shows a seam. */
const TAB_TUCK = 40;

/** How far behind the drag vector each successive ghost sits. */
const TRAIL_LAG = 0.2;

/** Degrees of spin per pixel dragged. Tuned so a commit-length pull turns the
 *  character about a third of a turn — enough to see it move, not so much it
 *  becomes a blur. */
const ROLL_PER_PX = 0.45;

/** Gentle settle — mirrors the spring used for the onboarding and home tabs. */
const SETTLE_SPRING = { damping: 16, stiffness: 140, mass: 0.9 } as const;

/** Verdict hold. Wrong answers linger longer — the reveal is the lesson. */
const VERDICT_MS = 600;
const VERDICT_WRONG_MS = 1100;

/** Centre-to-centre box for something of `size` sitting on a compass point. */
const boxAt = (c: { x: number; y: number }, size: number) => ({
  left: c.x - size / 2,
  top: c.y - size / 2,
});

/**
 * Compass Quiz. The question and its three lettered options are read at the
 * top; the answer is given at the bottom by dragging the puck toward A, B or C,
 * with south always Pass. There is nothing to tap, including the way out: the
 * exit tab is dragged, not pressed, just like the settings tab on home.
 */
export default function Quiz() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const { equippedId } = useCharacter();

  // Three separate ceilings, whichever bites first. Width alone is not enough:
  // the question and its three options now sit above the compass, and on a
  // short device a width-sized compass runs off the bottom of the screen.
  const RADIUS = Math.min(
    // East and west tokens fully on screen, with a margin.
    (screenW - TOKEN_SIZE) / 2 - Spacing.xl,
    // Leaves the top block room to breathe, including a three-line question.
    (screenH * 0.36 - TOKEN_SIZE) / 2,
    // And never sprawls, however much room a large device offers.
    128,
  );
  const COMPASS_SIZE = RADIUS * 2 + TOKEN_SIZE;
  const CENTRE = COMPASS_SIZE / 2;
  const RING_RADIUS = RADIUS * 0.72;

  // Every compass point, as a centre. Tokens, glows and the ring all derive
  // from these, so the geometry is stated once.
  const CENTRES = {
    north: { x: CENTRE, y: TOKEN_SIZE / 2 },
    south: { x: CENTRE, y: COMPASS_SIZE - TOKEN_SIZE / 2 },
    west: { x: TOKEN_SIZE / 2, y: CENTRE },
    east: { x: COMPASS_SIZE - TOKEN_SIZE / 2, y: CENTRE },
  } as const;

  const cardLeft = CENTRE - CARD_SIZE / 2;
  const cardTop = CENTRE - CARD_SIZE / 2;

  const [index, setIndex] = useState(0);
  const question = SAMPLE_QUESTIONS[index];

  // -1 = no verdict showing. Otherwise the index of the committed answer.
  const verdictIndex = useSharedValue(-1);
  const verdictCorrect = useSharedValue(false);
  // -1 = nothing revealed. On a wrong answer this points at the right choice
  // so it can flip blue alongside the rust pick.
  const revealCorrect = useSharedValue(-1);
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
    if (!correct) revealCorrect.value = question.correctIndex;
    Haptics.notificationAsync(
      correct
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Error,
    );

    verdictTimeout.current = setTimeout(
      () => {
        verdictIndex.value = -1;
        revealCorrect.value = -1;
        committing.current = false;
        advanceQuestion();
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
        // west = A = 0, north = B = 1, east = C = 2, south = pass.
        const answer = horizontal
          ? dx.value > 0
            ? 2
            : 0
          : dy.value > 0
            ? -1
            : 1;
        runOnJS(commit)(answer);
      }
      dx.value = withSpring(0, SETTLE_SPRING);
      dy.value = withSpring(0, SETTLE_SPRING);
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: dx.value },
      { translateY: dy.value },
      // Rolls rather than slides. A plain disc looks identical whichever way
      // it is turned, so this reads as nothing at all until a character with
      // arms is equipped — at which point the whole drag comes alive.
      { rotateZ: `${(dx.value + dy.value) * ROLL_PER_PX}deg` },
      { scale: 1 - held.value * 0.08 },
    ],
  }));

  // 0 = only the tab peeking in at the right edge, 1 = home has covered the quiz.
  const exitProgress = useSharedValue(0);
  // 1 = fully off to the right, 0 = settled. The stack renders this screen with
  // no animation of its own, so the entrance is ours to play.
  const entryProgress = useSharedValue(1);
  // Home rides on the sled, so it only needs to exist once the drag is live —
  // no reason to pay for a second Home's marquee timers for the whole quiz.
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
          if (done) runOnJS(leaveQuiz)();
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

  // The quiz itself only ever plays its entrance. Leaving is home arriving over
  // the top of it, not the quiz sliding away.
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

  const total = SAMPLE_QUESTIONS.length;
  const progressLabel = `${String(index + 1).padStart(2, "0")}/${String(total).padStart(2, "0")}`;

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.screen, screenStyle]}>
        <Text style={[styles.progress, { top: insets.top + Spacing.md }]}>
          {progressLabel}
        </Text>

        <View
          style={[
            styles.body,
            {
              // Clears the progress label and the exit tab, both absolute.
              paddingTop: insets.top + PULL_TAB_HEIGHT + Spacing.lg,
              paddingBottom: insets.bottom + Spacing.lg,
            },
          ]}
        >
          <Animated.View key={index} entering={FadeIn.duration(220)}>
            <Text style={styles.question}>{question.prompt}</Text>

            <View style={styles.options}>
              {question.choices.map((choice, i) => (
                <OptionRow
                  key={i}
                  index={i}
                  label={choice}
                  verdictIndex={verdictIndex}
                  verdictCorrect={verdictCorrect}
                  revealCorrect={revealCorrect}
                />
              ))}
            </View>
          </Animated.View>

          <View style={styles.compassWrap}>
            <View style={{ width: COMPASS_SIZE, height: COMPASS_SIZE }}>
              <BgGrid
                width={COMPASS_SIZE * 1.2}
                height={COMPASS_SIZE * 1.2}
                style={[
                  styles.grid,
                  { left: -COMPASS_SIZE * 0.1, top: -COMPASS_SIZE * 0.1 },
                ]}
              />

              <Svg
                width={RING_RADIUS * 2 + 2}
                height={RING_RADIUS * 2 + 2}
                style={[
                  styles.ring,
                  boxAt({ x: CENTRE, y: CENTRE }, RING_RADIUS * 2 + 2),
                ]}
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

              {/* Direction glows sit behind the tokens, so render them first. */}
              {(["north", "south", "east", "west"] as const).map((d) => (
                <DirectionGlow
                  key={d}
                  direction={d}
                  dx={dx}
                  dy={dy}
                  {...boxAt(CENTRES[d], CARD_SIZE * 1.6)}
                />
              ))}

              {LETTERS.map((_, i) => (
                <AnswerToken
                  key={i}
                  index={i}
                  verdictIndex={verdictIndex}
                  verdictCorrect={verdictCorrect}
                  revealCorrect={revealCorrect}
                  {...boxAt(CENTRES[CHOICE_DIRECTION[i]], TOKEN_SIZE)}
                />
              ))}

              <View
                style={[styles.passToken, boxAt(CENTRES.south, TOKEN_SIZE)]}
              >
                <Svg width={20} height={20}>
                  <Path
                    d="M3 3 L17 17 M17 3 L3 17"
                    stroke={Colors.bone}
                    strokeWidth={2.5}
                    strokeLinecap="round"
                  />
                </Svg>
              </View>

              {/* Furthest ghost first, so the nearer brighter ones paint over it. */}
              {[2, 1, 0].map((i) => (
                <Ghost
                  key={i}
                  index={i}
                  dx={dx}
                  dy={dy}
                  left={cardLeft}
                  top={cardTop}
                  characterId={equippedId}
                />
              ))}

              <GestureDetector gesture={drag}>
                <Animated.View
                  style={[styles.card, { left: cardLeft, top: cardTop }, cardStyle]}
                >
                  <CharacterMark characterId={equippedId} size={CARD_SIZE} />
                </Animated.View>
              </GestureDetector>
            </View>
          </View>
        </View>

        {/* The way out, built exactly like the settings tab on home: one wide
            sled with the tab on the left and the screen it reveals attached to
            its right. The tab belongs to the surface it brings in, so dragging
            it pulls home across the quiz rather than shoving the quiz aside. */}
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
 * One lettered option in the list under the question. At rest it is a plain
 * surface row; on a verdict it fills blue for correct or rust for wrong. The
 * fill carries the colour rather than the text so the label stays bone —
 * legible against charcoal and against either verdict colour.
 */
function OptionRow({
  index,
  label,
  verdictIndex,
  verdictCorrect,
  revealCorrect,
}: {
  index: number;
  label: string;
  verdictIndex: SharedValue<number>;
  verdictCorrect: SharedValue<boolean>;
  revealCorrect: SharedValue<number>;
}) {
  const rowStyle = useAnimatedStyle(() => {
    const active = verdictIndex.value === index;
    const revealed = revealCorrect.value === index;
    // Wrong pick shows rust on the picked row AND blue on the right one, so a
    // miss still teaches the answer.
    return {
      backgroundColor: withTiming(
        active
          ? verdictCorrect.value
            ? Theme.correct
            : Theme.incorrect
          : revealed
            ? Theme.correct
            : Theme.surface,
        { duration: 150 },
      ),
    };
  });

  return (
    <Animated.View style={[styles.optionRow, rowStyle]}>
      <Text style={styles.optionLetter}>{LETTERS[index]}</Text>
      <Text style={styles.optionLabel} numberOfLines={1} adjustsFontSizeToFit>
        {label}
      </Text>
    </Animated.View>
  );
}

/**
 * A lettered compass target. Bone until the drag commits to it, then it flips
 * blue for correct or rust for wrong — the only place in the app blue appears,
 * so it has to read as the payoff.
 */
function AnswerToken({
  index,
  verdictIndex,
  verdictCorrect,
  revealCorrect,
  left,
  top,
}: {
  index: number;
  verdictIndex: SharedValue<number>;
  verdictCorrect: SharedValue<boolean>;
  revealCorrect: SharedValue<number>;
  left: number;
  top: number;
}) {
  const tokenStyle = useAnimatedStyle(() => {
    const active = verdictIndex.value === index;
    const revealed = revealCorrect.value === index;
    return {
      backgroundColor: withTiming(
        active
          ? verdictCorrect.value
            ? Theme.correct
            : Theme.incorrect
          : revealed
            ? Theme.correct
            : Colors.bone,
        { duration: 150 },
      ),
    };
  });

  const textStyle = useAnimatedStyle(() => {
    const active = verdictIndex.value === index;
    const revealed = revealCorrect.value === index;
    return {
      color: withTiming(active || revealed ? Colors.bone : Colors.charcoal, {
        duration: 150,
      }),
    };
  });

  return (
    <Animated.View style={[styles.token, { left, top }, tokenStyle]}>
      <Animated.Text style={[styles.tokenText, textStyle]}>
        {LETTERS[index]}
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
  direction: "north" | "south" | "east" | "west";
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
    if (horizontal && direction === "east" && dx.value > 0) {
      progress = Math.min(1, absX / Gestures.commitDistance);
    } else if (horizontal && direction === "west" && dx.value < 0) {
      progress = Math.min(1, absX / Gestures.commitDistance);
    } else if (vertical && direction === "south" && dy.value > 0) {
      progress = Math.min(1, absY / Gestures.commitDistance);
    } else if (vertical && direction === "north" && dy.value < 0) {
      progress = Math.min(1, absY / Gestures.commitDistance);
    }

    return { opacity: 0.18 * progress };
  });

  return <Animated.View style={[styles.glow, { left, top }, style]} />;
}

/**
 * Motion trail behind the draggable card, exactly like the onboarding ball's.
 * Ghosts sit progressively further back along the drag vector, so the trail
 * always points home to the compass centre whichever way the card is pulled.
 */
function Ghost({
  index,
  dx,
  dy,
  left,
  top,
  characterId,
}: {
  index: number;
  dx: SharedValue<number>;
  dy: SharedValue<number>;
  left: number;
  top: number;
  characterId: string;
}) {
  const style = useAnimatedStyle(() => {
    const k = 1 - TRAIL_LAG * (index + 1);
    return {
      transform: [
        { translateX: dx.value * k },
        { translateY: dy.value * k },
        // Each ghost is turned to where the character actually was at that
        // point in the drag, so the trail smears the silhouette instead of
        // stamping the same orientation three times.
        { rotateZ: `${(dx.value + dy.value) * k * ROLL_PER_PX}deg` },
        { scale: 1 - index * 0.06 },
      ],
    };
  });

  return (
    <Animated.View style={[styles.card, { left, top }, style]}>
      <CharacterMark
        characterId={characterId}
        size={CARD_SIZE}
        color={TrailDark[index]}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    // Home's rust, showing through in the gap the quiz has not covered yet
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
  body: {
    flex: 1,
    // Question and options ride at the top, compass at the foot; whatever slack
    // the device has opens up between them rather than squeezing either.
    justifyContent: "space-between",
  },
  question: {
    paddingHorizontal: Spacing.lg,
    fontFamily: Fonts.body,
    fontSize: 22,
    lineHeight: 30,
    color: Theme.text,
    textAlign: "center",
    letterSpacing: 0.5,
    marginTop: Spacing.lg,
  },
  options: {
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    gap: Spacing.sm,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: 999,
  },
  optionLetter: {
    // Fixed width so every label starts on the same line, whatever the letter.
    width: 26,
    fontFamily: Fonts.display,
    fontSize: 17,
    color: Colors.bone,
  },
  optionLabel: {
    flex: 1,
    fontFamily: Fonts.bodyBold,
    fontSize: 17,
    letterSpacing: 1,
    color: Colors.bone,
  },
  compassWrap: {
    alignItems: "center",
    // Only a floor. `space-between` on the body opens up whatever slack the
    // device actually has, so a fixed gap here would just crowd short screens.
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
  },
  grid: {
    position: "absolute",
  },
  ring: {
    position: "absolute",
  },
  glow: {
    position: "absolute",
    width: CARD_SIZE * 1.6,
    height: CARD_SIZE * 1.6,
    borderRadius: 999,
    backgroundColor: Colors.bone,
  },
  token: {
    position: "absolute",
    width: TOKEN_SIZE,
    height: TOKEN_SIZE,
    borderRadius: TOKEN_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  tokenText: {
    fontFamily: Fonts.display,
    fontSize: 22,
    letterSpacing: 1,
  },
  passToken: {
    position: "absolute",
    width: TOKEN_SIZE,
    height: TOKEN_SIZE,
    borderRadius: TOKEN_SIZE / 2,
    backgroundColor: Colors.rust,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    position: "absolute",
    width: CARD_SIZE,
    height: CARD_SIZE,
    borderRadius: CARD_SIZE / 2,
  },
});
