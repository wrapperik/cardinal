import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { Colors, Fonts, Motion, Radius, Spacing, Theme } from '@/constants/theme';
import { selection } from '@/lib/haptics';

/**
 * The same 88 / 112 pair every swipe-to-confirm surface in the app uses —
 * SwipeAction and the sign-out row both carry it — so a menu row commits
 * with exactly the weight the rest of the house does.
 */
const COMMIT_DISTANCE = 88;
const MAX_DRAG = 112;

/**
 * Deliberately slacker than Motion.snap: this spring is not trying to settle
 * the fill, it is trying to make the fill arrive a beat after the finger.
 * Low stiffness against a heavier mass is what produces the lag — retargeted
 * every frame from useDerivedValue below, so the fill is always chasing the
 * drag rather than tracking it exactly.
 */
const FILL_LAG = { damping: 20, stiffness: 90, mass: 1 } as const;

interface MenuRowProps {
  label: string;
  /** Small capsule on the right. Omitted or null renders no badge at all, rather than an empty one. */
  badge?: string | null;
  /** Fires when a left-to-right swipe travels past COMMIT_DISTANCE. */
  onPress: () => void;
  /** Suppresses the bottom hairline, for the last row in a stack. */
  last?: boolean;
}

/**
 * One row in the home menu stack: a directional glyph, a label, an optional
 * badge, and a left-to-right swipe that fires it.
 *
 * A swipe rather than a tap, for the reason every other commitment in this
 * app is a swipe — a row that navigates on touch can be fired by a thumb
 * brushing past it while scrolling, and the rows are the whole screen below
 * the score card. The glyph already points the way the swipe goes, so the
 * affordance is drawn on the row itself rather than hidden behind a reveal.
 *
 * Only rightward drags count. The row has one destination, so unlike the
 * bidirectional course rows this replaced there is no second gesture to
 * balance against, and a leftward drag should do nothing rather than arm
 * something the row cannot deliver.
 */
export function MenuRow({ label, badge, onPress, last }: MenuRowProps) {
  const drag = useSharedValue(0);

  const commit = () => {
    selection();
    onPress();
  };

  const gesture = Gesture.Pan()
    // Enough sideways travel to tell a deliberate swipe from a vertical
    // scroll, so the enclosing ScrollView still wins a drag that reads as
    // vertical — the same threshold SwipeAction uses.
    .activeOffsetX([-8, 8])
    .onChange((event) => {
      drag.value = Math.max(0, Math.min(MAX_DRAG, drag.value + event.changeX));
    })
    .onEnd(() => {
      if (drag.value > COMMIT_DISTANCE) runOnJS(commit)();
      drag.value = withSpring(0, Motion.snap);
    });

  // The fill's own position, chasing the drag rather than equal to it.
  // Returning an animation from useDerivedValue re-targets the spring every
  // time `drag` moves, which is what makes the fill trail the finger going
  // out and then catch up on the way back.
  const fillDrag = useDerivedValue(() => withSpring(drag.value, FILL_LAG));

  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: drag.value }],
  }));

  // Scaled against COMMIT_DISTANCE, not MAX_DRAG, so the fill reads as full
  // exactly when the drag has travelled far enough to fire.
  const fillStyle = useAnimatedStyle(() => ({
    width: `${Math.max(0, Math.min(100, (fillDrag.value / COMMIT_DISTANCE) * 100))}%`,
  }));

  // Folds the badge into the label rather than leaving it a second, separate
  // accessibility node — otherwise a screen reader announces "QUICK RECAP"
  // and drops the "5MIN" that gives the row its meaning.
  const accessibilityLabel = badge ? `${label}, ${badge}` : label;

  return (
    <View
      style={[styles.row, !last && styles.hairline]}
      accessible
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      // VoiceOver cannot perform a swipe, so the row keeps a direct
      // activation path for assistive tech even though there is no tap
      // target for anyone else. Without this the rows would be unreachable
      // with the screen reader on.
      onAccessibilityTap={onPress}
    >
      {/* Rust, the app's accent for an active edge, growing from the edge
          the swipe starts at. Bone text stays legible over it, which is why
          this row can fill in the accent where the old course rows — bone
          text on a rust field — had to fill in charcoal instead. */}
      <Animated.View style={[styles.fill, fillStyle]} />

      <GestureDetector gesture={gesture}>
        <Animated.View style={[styles.content, contentStyle]}>
          <ChevronGlyph drag={drag} />
          <Text style={styles.label} numberOfLines={1}>
            {label}
          </Text>
          {badge != null && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{badge}</Text>
            </View>
          )}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

/**
 * The swipe direction cue, sitting on the LEFT even though it points right.
 *
 * That is the unusual choice it looks like — a trailing chevron pointing
 * into a tap target would normally sit on the right, after the label. This
 * one isn't disclosure, it's a gesture cue: it marks where the swipe starts
 * and the way it travels, so it belongs at the edge the finger lands on,
 * not at the edge the row's content ends.
 */
function ChevronGlyph({ drag }: { drag: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({
    opacity: 0.55 + 0.45 * Math.max(0, Math.min(1, drag.value / COMMIT_DISTANCE)),
  }));

  return (
    <Animated.View style={[styles.glyph, style]}>
      <Svg width={8} height={14} viewBox="0 0 8 14" fill="none">
        <Path
          d="M1 1 L7 7 L1 13"
          stroke={Colors.bone}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    // Generous on purpose: these four rows are the whole screen below the
    // score card, so they get the height to read as destinations rather than
    // as a dense settings list.
    height: 92,
    // Clips the fill to the row, so a swipe on one row never bleeds a band
    // of rust across its neighbours.
    overflow: 'hidden',
  },
  hairline: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.hairline,
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: Colors.rust,
  },
  // The row's padding lives here rather than on the row itself: the content
  // is what translates under the finger, and padding on the clipping parent
  // would inset the fill away from the edge it has to grow from.
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
  },
  glyph: {
    marginRight: Spacing.md,
  },
  label: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: 24,
    letterSpacing: 1,
    color: Colors.bone,
  },
  badge: {
    backgroundColor: Theme.surface,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
  },
  badgeText: {
    fontFamily: Fonts.bodyMedium,
    fontSize: 13,
    letterSpacing: 1,
    color: Colors.bone,
    opacity: 0.9,
  },
});
