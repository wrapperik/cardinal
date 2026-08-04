import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
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
import Svg, { Path } from "react-native-svg";

import { GAME_HEADER_H, GameShell } from "@/components/game-shell";
import { PULL_TAB_HEIGHT } from "@/components/pull-tab";
import { Colors, Fonts, Gestures, Spacing, Theme } from "@/constants/theme";
import {
  SAMPLE_ROUNDS,
  type MatchPair,
  type MatchRound,
} from "@/features/match/rounds";

/** Zone footprint — fixed rather than measured, so a worklet can hit-test a
 *  drop the instant a finger lifts instead of waiting on onLayout. */
const ZONE_H = 84;
const ZONE_GAP = 14;

/** Resting card height. Width is left to the text — see termCard's style. */
const TERM_CARD_H = 56;

/** Room reserved below the header for the prompt, whether it wraps to one
 *  line or two. Fixed for the same reason the zones are: zone math below it
 *  must never depend on how today's prompt happens to wrap. */
const PROMPT_RESERVED_H = 56;

/** Gentle settle — mirrors the spring used everywhere else a drag snaps home. */
const SETTLE_SPRING = { damping: 16, stiffness: 140, mass: 0.9 } as const;

/** How long a miss stays lit before the zone fades back to resting. */
const WRONG_FLASH_MS = 400;
/** Hold on a fully-matched board before moving on — long enough for the
 *  third match to register as a win, not so long it stalls the pace. */
const ROUND_HOLD_MS = 700;

/** The pass pill only ever inches down — a small cap keeps the "follow the
 *  finger" feel without letting the pill wander far from its dock. */
const PASS_FOLLOW_CAP = 60;
const PASS_FOLLOW_DAMPING = 0.4;

/**
 * Match & Release. Three definitions sit fixed on the field; the current
 * term rides near the bottom and gets dragged onto whichever one it names.
 * Zones are shuffled per round so the term list and the zone list never line
 * up — the whole point is reading the definitions, not the order.
 *
 * Landing zone is decided the instant a finger lifts, from a hit-test against
 * rectangles computed from layout constants, not from onLayout — so the same
 * frame that ends the drag already knows the answer.
 */
export default function Match() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width: screenW, height: screenH } = useWindowDimensions();

  const [roundIndex, setRoundIndex] = useState(0);
  const [matchedAt, setMatchedAt] = useState<(number | null)[]>([
    null,
    null,
    null,
  ]);

  const round: MatchRound = SAMPLE_ROUNDS[roundIndex];
  const total = SAMPLE_ROUNDS.length;

  // Shuffled once per round, not per render — re-shuffling on every match
  // would move zones the player already read and memorised.
  const zoneOrder = useMemo(
    () => shuffleZoneOrder(round.pairs.length),
    [roundIndex, round.pairs.length],
  );

  const matchedPairIndices = new Set(
    matchedAt.filter((m): m is number => m !== null),
  );
  // Terms present in data order — the first pair not yet claimed by a zone.
  const currentPairIndex = round.pairs.findIndex(
    (_, i) => !matchedPairIndices.has(i),
  );

  // Three explicit hooks rather than an array built in a loop, so hook order
  // never depends on how many zones happen to be filled.
  const matched0 = useSharedValue(false);
  const matched1 = useSharedValue(false);
  const matched2 = useSharedValue(false);
  const wrong0 = useSharedValue(false);
  const wrong1 = useSharedValue(false);
  const wrong2 = useSharedValue(false);
  const matchedFlags = [matched0, matched1, matched2];
  const wrongFlags = [wrong0, wrong1, wrong2];
  // Which zone the card in flight is currently over. -1 = none. Lives here,
  // not on the card, because the zones need to read it too.
  const hoverZone = useSharedValue(-1);

  // Blocks a second round advance from stacking while the completed board
  // is still holding on screen.
  const committing = useRef(false);
  const advanceTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (advanceTimeout.current) clearTimeout(advanceTimeout.current);
    };
  }, []);

  function resetZoneVisuals() {
    matched0.value = false;
    matched1.value = false;
    matched2.value = false;
    wrong0.value = false;
    wrong1.value = false;
    wrong2.value = false;
    hoverZone.value = -1;
  }

  function advanceRound() {
    if (roundIndex + 1 >= total) {
      router.back();
      return;
    }
    setRoundIndex((i) => i + 1);
  }

  function handleCorrect(zonePos: number, pairIndex: number) {
    setMatchedAt((prev) => {
      const next = [...prev];
      next[zonePos] = pairIndex;
      return next;
    });
  }

  // Dragged, not tapped — skips with no verdict, same as true-false's Pass.
  function skipRound() {
    if (committing.current) return;
    resetZoneVisuals();
    setMatchedAt([null, null, null]);
    advanceRound();
  }

  // All three zones filled — hold on the win a moment, then move on.
  useEffect(() => {
    if (committing.current) return;
    if (matchedAt.every((m) => m !== null)) {
      committing.current = true;
      advanceTimeout.current = setTimeout(() => {
        committing.current = false;
        resetZoneVisuals();
        setMatchedAt([null, null, null]);
        advanceRound();
      }, ROUND_HOLD_MS);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchedAt]);

  // Everything below is deterministic from insets/screen size, never from
  // onLayout — the drag's hit-test has to be able to trust it mid-gesture.
  const promptTop = insets.top + GAME_HEADER_H + Spacing.lg;
  const promptBottom = promptTop + PROMPT_RESERVED_H;

  const passPillTop = screenH - (insets.bottom + Spacing.xl) - PULL_TAB_HEIGHT;
  const termCardTop = passPillTop - Spacing.lg - TERM_CARD_H;

  const zonesBlockH = ZONE_H * 3 + ZONE_GAP * 2;
  const availableH = termCardTop - promptBottom;
  // Centred in the gap between the prompt and the term card, per the brief —
  // not pinned to the top of that gap.
  const zonesTop = promptBottom + Math.max(0, (availableH - zonesBlockH) / 2);

  const zoneLeft = Spacing.lg;
  const zoneWidth = screenW - Spacing.lg * 2;
  const zoneTops = [0, 1, 2].map((i) => zonesTop + i * (ZONE_H + ZONE_GAP));

  const passDy = useSharedValue(0);
  const passDrag = Gesture.Pan()
    .onChange((e) => {
      passDy.value += e.changeY;
    })
    .onEnd((e) => {
      const dragged = passDy.value;
      const commits =
        dragged > 0 &&
        (dragged > Gestures.commitDistance ||
          e.velocityY > Gestures.commitVelocity);
      if (commits) runOnJS(skipRound)();
      passDy.value = withSpring(0, SETTLE_SPRING);
    });

  const passStyle = useAnimatedStyle(() => {
    const followed = Math.min(Math.max(passDy.value, 0), PASS_FOLLOW_CAP);
    return {
      transform: [{ translateY: followed * PASS_FOLLOW_DAMPING }],
    };
  });

  return (
    <GameShell step={roundIndex + 1} total={total}>
      <Text style={[styles.prompt, { top: promptTop }]}>{round.prompt}</Text>

      {[0, 1, 2].map((i) => (
        <Zone
          key={i}
          index={i}
          top={zoneTops[i]}
          left={zoneLeft}
          width={zoneWidth}
          pair={round.pairs[zoneOrder[i]]}
          matchedPairIndex={matchedAt[i]}
          matched={matchedFlags[i]}
          wrong={wrongFlags[i]}
          hoverZone={hoverZone}
        />
      ))}

      {currentPairIndex !== -1 && (
        <DraggableTerm
          key={`${roundIndex}-${currentPairIndex}`}
          term={round.pairs[currentPairIndex].term}
          pairIndex={currentPairIndex}
          zoneOrder={zoneOrder}
          restCenterX={screenW / 2}
          top={termCardTop}
          height={TERM_CARD_H}
          zoneLeft={zoneLeft}
          zoneWidth={zoneWidth}
          zoneTops={zoneTops}
          zoneHeight={ZONE_H}
          matchedFlags={matchedFlags}
          wrongFlags={wrongFlags}
          hoverZone={hoverZone}
          onCorrect={handleCorrect}
        />
      )}

      <View
        style={[styles.passWrap, { bottom: insets.bottom + Spacing.xl }]}
        pointerEvents="box-none"
      >
        <GestureDetector gesture={passDrag}>
          <Animated.View style={[styles.passPill, passStyle]}>
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
          </Animated.View>
        </GestureDetector>
      </View>
    </GameShell>
  );
}

/** Fisher-Yates, then a one-place rotation if it lands back on identity — a
 *  shuffle that reproduces the term order defeats the reason zones shuffle
 *  at all. */
function shuffleZoneOrder(count: number): number[] {
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  if (order.every((value, i) => value === i)) {
    order.push(order.shift()!);
  }
  return order;
}

interface ZoneProps {
  index: number;
  top: number;
  left: number;
  width: number;
  pair: MatchPair;
  matchedPairIndex: number | null;
  matched: SharedValue<boolean>;
  wrong: SharedValue<boolean>;
  hoverZone: SharedValue<number>;
}

/**
 * One definition zone. Colour is driven entirely off shared values so the
 * hover brighten reacts the instant hoverZone changes, with no dependency on
 * a React re-render to catch up while a finger is still down.
 */
function Zone({
  index,
  top,
  left,
  width,
  pair,
  matchedPairIndex,
  matched,
  wrong,
  hoverZone,
}: ZoneProps) {
  const zoneStyle = useAnimatedStyle(() => {
    const isMatched = matched.value;
    const isHovered = !isMatched && hoverZone.value === index;
    return {
      backgroundColor: withTiming(
        isMatched
          ? Theme.correct
          : wrong.value
            ? Theme.incorrect
            : Theme.surface,
        { duration: isMatched ? 150 : 90 },
      ),
      borderColor: withTiming(
        isMatched ? Theme.correct : isHovered ? Colors.bone : Theme.glassEdge,
        { duration: 120 },
      ),
      transform: [
        { scale: withTiming(isHovered ? 1.02 : 1, { duration: 120 }) },
      ],
    };
  });

  const isFilled = matchedPairIndex !== null;

  return (
    <Animated.View style={[styles.zone, { top, left, width }, zoneStyle]}>
      {isFilled ? (
        <View style={styles.zoneMatchedContent} pointerEvents="none">
          <Text style={styles.zoneMatchedTerm} numberOfLines={1}>
            {pair.term}
          </Text>
          <Text style={styles.zoneMatchedDefinition} numberOfLines={2}>
            {pair.definition}
          </Text>
        </View>
      ) : (
        <Text style={styles.zoneDefinition} numberOfLines={2}>
          {pair.definition}
        </Text>
      )}
    </Animated.View>
  );
}

interface DraggableTermProps {
  term: string;
  /** Index into round.pairs — what this specific card actually is. */
  pairIndex: number;
  /** Zone position -> pair index, so a hit can be checked against the term
   *  it was dropped on without the zone needing to know anything back. */
  zoneOrder: number[];
  restCenterX: number;
  top: number;
  height: number;
  zoneLeft: number;
  zoneWidth: number;
  zoneTops: number[];
  zoneHeight: number;
  matchedFlags: SharedValue<boolean>[];
  wrongFlags: SharedValue<boolean>[];
  hoverZone: SharedValue<number>;
  onCorrect: (zonePos: number, pairIndex: number) => void;
}

/**
 * The one term in play. Keyed by round + pair index at the call site, so a
 * fresh card — and fresh dx/dy — mounts for every new term rather than this
 * one being reset by hand.
 */
function DraggableTerm({
  term,
  pairIndex,
  zoneOrder,
  restCenterX,
  top,
  height,
  zoneLeft,
  zoneWidth,
  zoneTops,
  zoneHeight,
  matchedFlags,
  wrongFlags,
  hoverZone,
  onCorrect,
}: DraggableTermProps) {
  const dx = useSharedValue(0);
  const dy = useSharedValue(0);
  const held = useSharedValue(0);

  const restCenterY = top + height / 2;

  // Plain JS, reached via runOnJS from onEnd — Haptics, setTimeout and the
  // parent's setState all need the JS thread, not the UI thread.
  function resolveDrop(zonePos: number) {
    hoverZone.value = -1;
    const correct = zoneOrder[zonePos] === pairIndex;
    if (correct) {
      matchedFlags[zonePos].value = true;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onCorrect(zonePos, pairIndex);
      // No spring-back. The card already stopped inside the zone it hit —
      // the zone's own re-render takes over that same spot with the locked
      // term + definition, so letting go here is the whole animation.
    } else {
      wrongFlags[zonePos].value = true;
      dx.value = withSpring(0, SETTLE_SPRING);
      dy.value = withSpring(0, SETTLE_SPRING);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setTimeout(() => {
        wrongFlags[zonePos].value = false;
      }, WRONG_FLASH_MS);
    }
  }

  const drag = Gesture.Pan()
    .onBegin(() => {
      held.value = withTiming(1, { duration: 140 });
    })
    .onChange((e) => {
      dx.value += e.changeX;
      dy.value += e.changeY;

      const centerX = restCenterX + dx.value;
      const centerY = restCenterY + dy.value;
      let zone = -1;
      if (centerX > zoneLeft && centerX < zoneLeft + zoneWidth) {
        for (let i = 0; i < zoneTops.length; i++) {
          if (matchedFlags[i].value) continue;
          if (centerY > zoneTops[i] && centerY < zoneTops[i] + zoneHeight) {
            zone = i;
            break;
          }
        }
      }
      hoverZone.value = zone;
    })
    .onFinalize(() => {
      held.value = withTiming(0, { duration: 220 });
    })
    .onEnd(() => {
      if (hoverZone.value === -1) {
        dx.value = withSpring(0, SETTLE_SPRING);
        dy.value = withSpring(0, SETTLE_SPRING);
      } else {
        runOnJS(resolveDrop)(hoverZone.value);
      }
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: dx.value },
      { translateY: dy.value },
      { scale: 1 + held.value * 0.05 },
    ],
    shadowOpacity: 0.15 + held.value * 0.2,
  }));

  return (
    <View style={[styles.termCardRow, { top }]} pointerEvents="box-none">
      <GestureDetector gesture={drag}>
        <Animated.View style={[styles.termCard, cardStyle]}>
          <Text style={styles.termText} numberOfLines={1}>
            {term}
          </Text>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  prompt: {
    position: "absolute",
    left: 0,
    right: 0,
    textAlign: "center",
    fontFamily: Fonts.body,
    fontSize: 19,
    color: Theme.text,
    paddingHorizontal: Spacing.lg,
  },
  zone: {
    position: "absolute",
    height: ZONE_H,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.md,
  },
  zoneDefinition: {
    fontFamily: Fonts.body,
    fontSize: 15,
    color: Theme.text,
    textAlign: "center",
  },
  zoneMatchedContent: {
    alignItems: "center",
    gap: Spacing.xs,
  },
  zoneMatchedTerm: {
    fontFamily: Fonts.bodyBold,
    fontSize: 14,
    color: Colors.bone,
    textAlign: "center",
  },
  zoneMatchedDefinition: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: Colors.bone,
    textAlign: "center",
  },
  termCardRow: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  termCard: {
    height: TERM_CARD_H,
    borderRadius: 999,
    backgroundColor: Colors.bone,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.lg,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 8,
  },
  termText: {
    fontFamily: Fonts.bodyBold,
    fontSize: 17,
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
