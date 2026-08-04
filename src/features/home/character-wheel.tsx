import * as Haptics from "expo-haptics";
import { useState } from "react";
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
import Svg, { Path, Rect } from "react-native-svg";

import { CharacterMark } from "@/components/character-mark";
import { Colors, Fonts, Spacing, Theme } from "@/constants/theme";
import { ROSTER } from "@/features/character/roster";
import { claimAndEquip, useCharacter } from "@/features/character/store";

/** The always-visible puck in the corner, showing what is equipped. */
const KNOB = 64;
/**
 * Centre-to-centre distance out to each sector, and the sector's own size.
 *
 * Five discs across a quarter turn leaves a chord of only 2·R·sin(18°/2)
 * between neighbours, so the radius has to carry the spacing — at anything
 * under ~190 they overlap. Reaching this far costs nothing: selection is by
 * the ANGLE of the thumb vector, not by touching the disc, so a short flick
 * out of the dead zone already picks a sector.
 */
const RADIUS = 205;
const SECTOR = 52;
/** Slack around the wheel box for the labels that hang below each disc. */
const PAD = 24;
/** Big enough to contain the whole bloom — Android clips children that spill
 *  past their parent, so the box cannot just be knob-sized. */
const WHEEL_SIZE = 300;

/** Every character gets a sector, the plain orb included, so equipping one of
 *  the others is never a one-way door. */
const SECTORS = ROSTER;

const OPEN_SPRING = { damping: 15, stiffness: 190, mass: 0.8 } as const;

/**
 * Character select. Held, not tapped: the wheel blooms out of the corner
 * knob, the thumb slides to a sector to highlight it, and releasing claims
 * it. Exactly the grammar the topic pills already use on this screen, so
 * there is still nothing on home that responds to a tap.
 *
 * The wheel opens up and to the LEFT because it lives in the bottom-right
 * corner — a full circle would put half its sectors off-screen, so the
 * sectors are spread across the quarter-turn that is actually reachable.
 */
export function CharacterWheel({ bottom }: { bottom: number }) {
  const { equippedId, claimed } = useCharacter();
  const [open, setOpen] = useState(false);

  const progress = useSharedValue(0);
  const held = useSharedValue(0);
  // Index of the sector the thumb is currently over, -1 for none.
  const hover = useSharedValue(-1);

  function onRelease(index: number) {
    setOpen(false);
    if (index < 0) return;
    const character = SECTORS[index];
    if (character.locked) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    claimAndEquip(character.id);
  }

  function onOpen() {
    setOpen(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }

  const wheel = Gesture.Pan()
    .minDistance(0)
    .shouldCancelWhenOutside(false)
    .onBegin(() => {
      held.value = withTiming(1, { duration: 140 });
      progress.value = withSpring(1, OPEN_SPRING);
      hover.value = -1;
      runOnJS(onOpen)();
    })
    .onChange((e) => {
      // The thumb travels up and left from the knob, so a sector is picked by
      // the angle of that vector. Both axes are negated to put 0° pointing
      // straight up and sweep anticlockwise toward the left edge.
      const vx = -e.translationX;
      const vy = -e.translationY;
      const dist = Math.sqrt(vx * vx + vy * vy);
      // Too close to the knob to mean anything — the angle is noise down here.
      if (dist < KNOB * 0.6) {
        hover.value = -1;
        return;
      }
      const angle = Math.atan2(vx, vy); // 0 = straight up, grows toward the left
      const quarter = Math.PI / 2;
      // A sixth of a turn of slack past each end of the arc, then clamped.
      // Without it the two extreme sectors are unreachable: dragging exactly
      // left lands one index past the last one, and anything a few degrees
      // beyond vertical falls off the front — so the outermost choices would
      // only ever be selectable from inside a narrow wedge.
      const slack = quarter / 3;
      if (angle < -slack || angle > quarter + slack) {
        hover.value = -1;
        return;
      }
      const step = quarter / SECTORS.length;
      hover.value = Math.min(
        SECTORS.length - 1,
        Math.max(0, Math.floor(angle / step)),
      );
    })
    .onFinalize(() => {
      held.value = withTiming(0, { duration: 200 });
      progress.value = withSpring(0, OPEN_SPRING);
      runOnJS(onRelease)(hover.value);
      hover.value = -1;
    });

  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - held.value * 0.08 }],
  }));

  return (
    <View style={[styles.anchor, { bottom }]} pointerEvents="box-none">
      {open &&
        SECTORS.map((character, i) => {
          // Sectors are laid out along the quarter-turn from straight up to
          // straight left, centred in their own slice of it.
          const step = Math.PI / 2 / SECTORS.length;
          const angle = step * (i + 0.5);
          return (
            <Sector
              key={character.id}
              index={i}
              label={character.name}
              characterId={character.id}
              locked={character.locked}
              owned={claimed.includes(character.id)}
              dx={-Math.sin(angle) * RADIUS}
              dy={-Math.cos(angle) * RADIUS}
              progress={progress}
              hover={hover}
            />
          );
        })}

      <GestureDetector gesture={wheel}>
        <Animated.View style={[styles.knob, knobStyle]} hitSlop={16}>
          <CharacterMark characterId={equippedId} size={KNOB * 0.62} />
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

function Sector({
  index,
  label,
  characterId,
  locked,
  owned,
  dx,
  dy,
  progress,
  hover,
}: {
  index: number;
  label: string;
  characterId: string;
  locked: boolean;
  owned: boolean;
  dx: number;
  dy: number;
  progress: SharedValue<number>;
  hover: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    const on = hover.value === index;
    return {
      opacity: progress.value,
      transform: [
        { translateX: dx * progress.value },
        { translateY: dy * progress.value },
        { scale: progress.value * (on ? 1.14 : 1) },
      ],
    };
  });

  const fillStyle = useAnimatedStyle(() => ({
    backgroundColor: withTiming(
      hover.value === index
        ? locked
          ? Theme.incorrect
          : Colors.bone
        : Theme.surface,
      { duration: 120 },
    ),
  }));

  return (
    <Animated.View style={[styles.sector, style]} pointerEvents="none">
      <Animated.View style={[styles.sectorDisc, fillStyle]}>
        <CharacterMark
          characterId={characterId}
          size={SECTOR * 0.5}
          // A locked character is a silhouette, not a colour: dimming it keeps
          // it recognisably the same shape family as the one you own.
          opacity={locked ? 0.35 : 1}
        />
        {locked && <Padlock />}
      </Animated.View>
      <Text style={[styles.sectorLabel, owned && styles.sectorLabelOwned]}>
        {label}
      </Text>
    </Animated.View>
  );
}

/** Small bone padlock, pinned to the corner of a locked sector. */
function Padlock() {
  return (
    <View style={styles.padlock}>
      <Svg width={12} height={12} viewBox="0 0 12 12">
        <Path
          d="M3.5 5.5 V4 a2.5 2.5 0 0 1 5 0 V5.5"
          stroke={Colors.bone}
          strokeWidth={1.4}
          fill="none"
          strokeLinecap="round"
        />
        <Rect x={2.6} y={5.6} width={6.8} height={4.6} rx={1} fill={Colors.bone} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    // Pulled out by PAD on both sides and the knob pinned back in by the same
    // amount, so the box grows around the knob without moving it.
    position: "absolute",
    right: Spacing.lg - PAD,
    width: WHEEL_SIZE,
    height: WHEEL_SIZE,
    // Above the pill rows, below the settings sled.
    zIndex: 6,
  },
  knob: {
    position: "absolute",
    right: PAD,
    bottom: PAD,
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    backgroundColor: Theme.background,
    borderWidth: 2,
    borderColor: Colors.bone,
    alignItems: "center",
    justifyContent: "center",
  },
  sector: {
    // Pinned so its disc centre starts exactly on the knob centre; the
    // translate in the animated style then carries it out along its angle.
    position: "absolute",
    right: PAD + KNOB / 2 - SECTOR / 2,
    bottom: PAD + KNOB / 2 - SECTOR / 2,
    width: SECTOR,
    height: SECTOR,
    alignItems: "center",
  },
  sectorDisc: {
    width: SECTOR,
    height: SECTOR,
    borderRadius: SECTOR / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  sectorLabel: {
    // Absolute, so it hangs below the disc without growing the sector box the
    // positioning maths above depends on being exactly SECTOR square.
    position: "absolute",
    top: SECTOR + Spacing.xs,
    left: -Spacing.md,
    right: -Spacing.md,
    textAlign: "center",
    fontFamily: Fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 1,
    color: Theme.textMuted,
  },
  sectorLabelOwned: {
    color: Colors.bone,
  },
  padlock: {
    position: "absolute",
    right: 6,
    bottom: 6,
  },
});
