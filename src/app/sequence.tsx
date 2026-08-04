import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
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

import { GameShell, GAME_HEADER_H } from "@/components/game-shell";
import { PULL_TAB_HEIGHT } from "@/components/pull-tab";
import { Colors, Fonts, Gestures, Spacing, Theme } from "@/constants/theme";
import { SAMPLE_ROUNDS, type SequenceRound } from "@/features/sequence/rounds";

/** Row card footprint. Fixed rather than derived from screen height — four
 *  of these plus their gaps have to fit the same on every device, and a
 *  card that resizes per-screen would throw off the (ROW_H + ROW_GAP)
 *  arithmetic the drag math depends on. */
const ROW_H = 64;
const ROW_GAP = 12;
const STEP = ROW_H + ROW_GAP;
const STACK_H = ROW_H * 4 + ROW_GAP * 3;

/** Slot numerals live in the card's own left inset rather than stealing width
 *  from it — the brief fixes the card at full width minus Spacing.lg each
 *  side, so the numeral has to fit inside that margin, not beside it. A
 *  single Fonts.display digit at this size clears a 20px column easily. */
const NUMERAL_LEFT = Spacing.xs;
const NUMERAL_W = Spacing.lg - Spacing.xs;

/** Matches the row-shift spring specified in the brief: springy enough to
 *  read as cards gliding past each other, damped enough not to overshoot
 *  into the next slot. */
const SLOT_SPRING = { damping: 18, stiffness: 220, mass: 0.7 } as const;
/** Reused for the exit-drag-style settle on the Pass pill and its badge. */
const SETTLE_SPRING = { damping: 16, stiffness: 140, mass: 0.9 } as const;

/** How long a solved board sits fully blue before the round advances — the
 *  correct arrangement is its own reward, so this is a beat to register it,
 *  not a countdown. */
const RESOLVE_HOLD_MS = 700;

/**
 * Fisher-Yates over the round's item indices. Re-rolls on the rare shuffle
 * that lands back on identity — an already-solved board would resolve with
 * zero moves, which reads as broken rather than lucky.
 */
function shuffleIndices(length: number): number[] {
  const indices = Array.from({ length }, (_, i) => i);
  do {
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
  } while (indices.every((value, i) => value === i));
  return indices;
}

function clamp(value: number, min: number, max: number) {
  "worklet";
  return Math.min(max, Math.max(min, value));
}

/**
 * Sequence Swipe. Four bone cards sit in a fixed stack, one per slot; the
 * player drags a card up or down and the rest glide aside to open its gap.
 * There is no submit — the moment the stack reads correctly against the
 * round's stored order, every card turns blue and the round advances on
 * its own. Passing is a drag too: pull the pill down past the same
 * distance/velocity thresholds every other commit in this app uses.
 */
export default function Sequence() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [roundIndex, setRoundIndex] = useState(0);
  const round: SequenceRound = SAMPLE_ROUNDS[roundIndex];

  // itemOrder[k] is the correct-order index of whichever item landed at
  // shuffled position k. Reshuffled only when the round changes, never on
  // re-render, so mid-round drags aren't fighting a moving target.
  const itemOrder = useMemo(
    () => shuffleIndices(round.orderedItems.length),
    [round],
  );
  const shuffledItems = useMemo(
    () => itemOrder.map((i) => round.orderedItems[i]),
    [itemOrder, round],
  );

  // order[slot] = index into shuffledItems/itemOrder currently sitting in
  // that slot. Starts identity each round; commitMove below is the only
  // thing that ever permutes it.
  //
  // The round it belongs to is bundled INTO the state rather than tracked
  // beside it. Advancing re-memoises itemOrder immediately, but this state
  // still holds the previous round's solved permutation until its own reset
  // lands a render later — and the solve check runs in between. Pairing them
  // makes that stale combination detectable, instead of leaving it to be read
  // as a fresh board that happens to already be solved.
  const [board, setBoard] = useState({ round: 0, order: [0, 1, 2, 3] });

  const activeSlot = useSharedValue(-1);
  const dragY = useSharedValue(0);
  const hoverSlot = useSharedValue(-1);
  // Drives every row's fill colour at once — one shared value rather than
  // four, since all four always resolve together.
  const solved = useSharedValue(false);
  const passY = useSharedValue(0);

  // Blocks a second drag from landing while a solved board is holding, same
  // guard true-false.tsx uses to stop a verdict being clobbered mid-reveal.
  const committing = useRef(false);
  const resolveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resolveTimeout.current) clearTimeout(resolveTimeout.current);
    };
  }, []);

  // Fresh round: reset the board before the new shuffle's first paint, not
  // after — otherwise the outgoing solved-blue stack would flash back to
  // bone for a frame under the new items.
  useEffect(() => {
    setBoard({ round: roundIndex, order: [0, 1, 2, 3] });
    solved.value = false;
    committing.current = false;
  }, [roundIndex, solved]);

  function advanceRound() {
    if (roundIndex + 1 >= SAMPLE_ROUNDS.length) {
      router.back();
      return;
    }
    setRoundIndex((i) => i + 1);
  }

  // Plain JS, called via runOnJS from a row's onEnd. Guarded on committing
  // first so a drag that ends after the board has already resolved can't
  // scramble a stack that's mid-celebration.
  function commitMove(from: number, to: number) {
    if (committing.current) return;
    if (from === to || from < 0 || to < 0) return;
    setBoard((prev) => {
      if (prev.round !== roundIndex) return prev;
      const next = [...prev.order];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return { round: prev.round, order: next };
    });
  }

  function skipRound() {
    if (committing.current) return;
    advanceRound();
  }

  // Checks the board every time it changes — there's no submit, so this IS
  // the submit.
  useEffect(() => {
    if (committing.current) return;
    // The board has not caught up with the new round yet, so its order and
    // this round's itemOrder describe different shuffles. Comparing them
    // would declare a board solved that the player has not touched.
    if (board.round !== roundIndex) return;
    const isSolved = board.order.every(
      (itemIndex, slot) => itemOrder[itemIndex] === slot,
    );
    if (!isSolved) return;

    committing.current = true;
    solved.value = true;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    resolveTimeout.current = setTimeout(() => {
      committing.current = false;
      advanceRound();
    }, RESOLVE_HOLD_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, itemOrder, roundIndex, solved]);

  const passDrag = Gesture.Pan()
    .onChange((e) => {
      // Follows the finger at a fraction of real distance — enough to read
      // as picked up, not so much it looks detached from the touch point.
      passY.value = Math.max(0, e.translationY) * 0.4;
    })
    .onEnd((e) => {
      const commits =
        e.translationY > Gestures.commitDistance ||
        e.velocityY > Gestures.commitVelocity;
      if (commits) runOnJS(skipRound)();
    })
    .onFinalize(() => {
      passY.value = withSpring(0, SETTLE_SPRING);
    });

  const passPillStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: passY.value }],
  }));

  return (
    <GameShell step={roundIndex + 1} total={SAMPLE_ROUNDS.length}>
      <View style={styles.fill}>
        <View style={{ height: insets.top + GAME_HEADER_H }} />

        <Text style={styles.prompt}>{round.prompt}</Text>

        <View style={styles.stackCentre}>
          <View style={styles.stackWrap}>
            {[0, 1, 2, 3].map((slot) => (
              <View
                key={`numeral-${slot}`}
                style={[styles.numeralSlot, { top: slot * STEP }]}
              >
                <Text style={styles.numeral}>{slot + 1}</Text>
              </View>
            ))}
            {shuffledItems.map((label, itemIndex) => (
              <SequenceRow
                key={`item-${itemIndex}`}
                slot={board.order.indexOf(itemIndex)}
                label={label}
                activeSlot={activeSlot}
                dragY={dragY}
                hoverSlot={hoverSlot}
                solved={solved}
                onDrop={commitMove}
              />
            ))}
          </View>
        </View>

        <View style={styles.passWrap}>
          <GestureDetector gesture={passDrag}>
            <Animated.View style={[styles.passPill, passPillStyle]}>
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

        {/* Below the pill, not above it — leading with this spacer pushed the
            pill onto the home indicator at the very bottom of the screen. */}
        <View style={{ height: insets.bottom + Spacing.xl }} />
      </View>
    </GameShell>
  );
}

/**
 * One draggable row, mounted per ITEM and told which slot it currently
 * occupies. That distinction is the entire mechanic: keyed by slot instead,
 * a card released in a new position would snap home and merely swap the word
 * printed on it, so nothing would appear to have moved at all. Keyed by item,
 * the card itself travels to its new slot and the others glide around it.
 *
 * Only the numerals are fixed to slots — a card sliding past a stationary
 * numeral is what makes the reordering legible.
 */
function SequenceRow({
  slot,
  label,
  activeSlot,
  dragY,
  hoverSlot,
  solved,
  onDrop,
}: {
  slot: number;
  label: string;
  activeSlot: SharedValue<number>;
  dragY: SharedValue<number>;
  hoverSlot: SharedValue<number>;
  solved: SharedValue<boolean>;
  onDrop: (from: number, to: number) => void;
}) {
  const drag = Gesture.Pan()
    .onBegin(() => {
      activeSlot.value = slot;
      hoverSlot.value = slot;
    })
    .onChange((e) => {
      dragY.value = e.translationY;
      hoverSlot.value = clamp(
        Math.round(slot + dragY.value / STEP),
        0,
        3,
      );
    })
    .onEnd(() => {
      runOnJS(onDrop)(activeSlot.value, hoverSlot.value);
    })
    .onFinalize(() => {
      activeSlot.value = -1;
      dragY.value = 0;
    });

  // Transform only — kept separate from the colour style below so a solved
  // toggle never re-runs the drag maths, and a drag frame never re-runs the
  // colour interpolation.
  const cardStyle = useAnimatedStyle(() => {
    const isActive = activeSlot.value === slot;

    if (isActive) {
      return {
        transform: [{ translateY: slot * STEP + dragY.value }, { scale: 1.04 }],
        zIndex: 2,
        shadowOpacity: withTiming(0.3, { duration: 120 }),
        elevation: 10,
      };
    }

    // Every card between the lifted slot and where it's hovering shifts by
    // exactly one row height to open (or close) the gap — the same slot can
    // be "between" whether the drag is heading down or up, so both
    // directions get their own branch rather than one signed formula.
    let visual = slot;
    if (
      activeSlot.value !== -1 &&
      activeSlot.value < hoverSlot.value &&
      slot > activeSlot.value &&
      slot <= hoverSlot.value
    ) {
      visual = slot - 1;
    } else if (
      activeSlot.value !== -1 &&
      activeSlot.value > hoverSlot.value &&
      slot < activeSlot.value &&
      slot >= hoverSlot.value
    ) {
      visual = slot + 1;
    }

    // Springing to an absolute slot, not a relative shift: when the drop
    // lands and `slot` becomes the new real position, the target is the one
    // this card was already heading for, so the handover is invisible. A
    // spring also just retargets if the new prop arrives a frame late.
    return {
      transform: [
        { translateY: withSpring(visual * STEP, SLOT_SPRING) },
        { scale: 1 },
      ],
      zIndex: 1,
      shadowOpacity: withTiming(0, { duration: 120 }),
      elevation: 0,
    };
  });

  const fillStyle = useAnimatedStyle(() => ({
    backgroundColor: withTiming(solved.value ? Theme.correct : Colors.bone, {
      duration: 150,
    }),
  }));

  const textStyle = useAnimatedStyle(() => ({
    color: withTiming(solved.value ? Colors.bone : Colors.charcoal, {
      duration: 150,
    }),
  }));

  return (
    <GestureDetector gesture={drag}>
      <Animated.View
        style={[styles.card, cardStyle, fillStyle]}
      >
        <Animated.Text
          style={[styles.itemText, textStyle]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {label}
        </Animated.Text>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  prompt: {
    textAlign: "center",
    fontFamily: Fonts.body,
    fontSize: 19,
    color: Theme.text,
    paddingHorizontal: Spacing.lg,
  },
  stackCentre: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  stackWrap: {
    width: "100%",
    height: STACK_H,
  },
  numeralSlot: {
    position: "absolute",
    left: NUMERAL_LEFT,
    width: NUMERAL_W,
    height: ROW_H,
    // Centred by the container, not by textAlignVertical — that prop is
    // Android-only, so on iOS the numeral would ride at the top of the row
    // it is meant to be labelling.
    alignItems: "center",
    justifyContent: "center",
  },
  numeral: {
    fontFamily: Fonts.display,
    fontSize: 18,
    color: Theme.textMuted,
  },
  card: {
    position: "absolute",
    top: 0,
    left: Spacing.lg,
    right: Spacing.lg,
    height: ROW_H,
    borderRadius: 14,
    backgroundColor: Colors.bone,
    alignItems: "center",
    justifyContent: "center",
    // Static shadow shape; only opacity/elevation animate between resting
    // and lifted, mirroring true-false.tsx's card.
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
  },
  itemText: {
    paddingHorizontal: Spacing.md,
    fontFamily: Fonts.bodyBold,
    fontSize: 17,
    letterSpacing: 1,
    color: Colors.charcoal,
  },
  passWrap: {
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
