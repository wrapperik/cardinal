import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { Icon, type IconName } from '@/components/icons';
import { Colors, Fonts, Motion, Radius, Spacing, Theme } from '@/constants/theme';
import { DELAYED_FILL_SPRING, SWIPE_COMMIT_DISTANCE, SWIPE_MAX_DRAG } from '@/constants/gestures';
import { useTraditionalUx } from '@/features/preferences/preferences';
import { useReducedMotion } from '@/lib/accessibility';
import { selection } from '@/lib/haptics';

/**
 * The same 88 / 112 pair every swipe-to-confirm surface in the app uses —
 * SwipeAction and the sign-out row both carry it — so a menu row commits
 * with exactly the weight the rest of the house does.
 */
interface MenuRowProps {
  label: string;
  /** Small capsule on the right. Omitted or null renders no badge at all, rather than an empty one. */
  badge?: string | null;
  /** Fires when a left-to-right swipe travels past COMMIT_DISTANCE. */
  onPress: () => void;
  /** Suppresses the bottom hairline, for the last row in a stack. */
  last?: boolean;
  /** Leading icon in traditional UX, where it replaces the swipe chevron. Legacy ignores it. */
  icon?: IconName;
  /**
   * Whatever the row's content currently describes — home passes the active
   * course id. When it changes the row shimmers and its badge rolls in, so a
   * course switch visibly lands on the rows rather than silently swapping
   * their numbers.
   */
  refreshKey?: string;
  /** Stagger for that refresh, so a stack of rows ripples instead of flashing at once. */
  refreshDelay?: number;
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
export function MenuRow(props: MenuRowProps) {
  const traditional = useTraditionalUx();
  return traditional ? <TapMenuRow {...props} /> : <SwipeMenuRow {...props} />;
}

/**
 * Traditional UX: an ordinary tappable row. The rust fill floods the whole
 * row while pressed. The swipe chevron has nothing to mark here, so a
 * leading icon for the destination takes its place.
 */
function TapMenuRow({ label, badge, onPress, last, icon, refreshKey, refreshDelay = 0 }: MenuRowProps) {
  const accessibilityLabel = badge ? `${label}, ${badge}` : label;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={() => {
        selection();
        onPress();
      }}
      style={[styles.row, !last && styles.hairline]}
    >
      {({ pressed }) => (
        <>
          <View style={[styles.fill, styles.fillFull, { opacity: pressed ? 1 : 0 }]} />
          <RowShimmer refreshKey={refreshKey} delay={refreshDelay} />
          <View style={styles.content}>
            {icon && (
              <View style={styles.glyph}>
                <Icon name={icon} size={22} color={Colors.bone} />
              </View>
            )}
            <Text style={styles.label} numberOfLines={1}>
              {label}
            </Text>
            {badge != null && <RowBadge badge={badge} refreshKey={refreshKey} delay={refreshDelay} />}
          </View>
        </>
      )}
    </Pressable>
  );
}

function SwipeMenuRow({ label, badge, onPress, last, refreshKey, refreshDelay = 0 }: MenuRowProps) {
  const reducedMotion = useReducedMotion();
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
      drag.value = Math.max(0, Math.min(SWIPE_MAX_DRAG, drag.value + event.changeX));
    })
    .onEnd(() => {
      if (drag.value > SWIPE_COMMIT_DISTANCE) runOnJS(commit)();
      drag.value = reducedMotion ? 0 : withSpring(0, Motion.snap);
    });

  // The fill's own position, chasing the drag rather than equal to it.
  // Returning an animation from useDerivedValue re-targets the spring every
  // time `drag` moves, which is what makes the fill trail the finger going
  // out and then catch up on the way back.
  const fillDrag = useDerivedValue(() => reducedMotion ? drag.value : withSpring(drag.value, DELAYED_FILL_SPRING));

  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: drag.value }],
  }));

  // Scaled against COMMIT_DISTANCE, not MAX_DRAG, so the fill reads as full
  // exactly when the drag has travelled far enough to fire.
  const fillStyle = useAnimatedStyle(() => ({
    width: `${Math.max(0, Math.min(100, (fillDrag.value / SWIPE_COMMIT_DISTANCE) * 100))}%`,
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
      <RowShimmer refreshKey={refreshKey} delay={refreshDelay} />

      <GestureDetector gesture={gesture}>
        <Animated.View style={[styles.content, contentStyle]}>
          <ChevronGlyph drag={drag} />
          <Text style={styles.label} numberOfLines={1}>
            {label}
          </Text>
          {badge != null && <RowBadge badge={badge} refreshKey={refreshKey} delay={refreshDelay} />}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

/**
 * Runs `start` whenever `refreshKey` changes, but not on first mount — the
 * rows arriving with the screen is not a course switch.
 */
function useOnRefresh(refreshKey: string | undefined, start: () => void) {
  const seen = useRef(refreshKey);
  useEffect(() => {
    if (seen.current === refreshKey) return;
    seen.current = refreshKey;
    start();
    // `start` is rebuilt every render; only the key change should fire it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);
}

/** Soft-edged band, faked with stepped slices since there is no gradient dependency. */
const SHIMMER_SLICES = [0.03, 0.07, 0.12, 0.16, 0.12, 0.07, 0.03];
const SHIMMER_SLICE_W = 14;
const SHIMMER_W = SHIMMER_SLICES.length * SHIMMER_SLICE_W;

/**
 * A band of light that sweeps across the row once its content has changed.
 * Sits under the content and inside the row's clip, so it reads as the row
 * itself catching the light rather than an overlay passing over it.
 */
function RowShimmer({ refreshKey, delay }: { refreshKey?: string; delay: number }) {
  const reducedMotion = useReducedMotion();
  const { width } = useWindowDimensions();
  const progress = useSharedValue(0);

  useOnRefresh(refreshKey, () => {
    if (reducedMotion) return;
    progress.value = 0;
    progress.value = withDelay(delay, withTiming(1, { duration: 620, easing: Easing.inOut(Easing.cubic) }));
  });

  const style = useAnimatedStyle(() => ({
    opacity: progress.value > 0 && progress.value < 1 ? 1 : 0,
    transform: [
      { translateX: -SHIMMER_W + progress.value * (width + SHIMMER_W * 2) },
      { skewX: '-18deg' },
    ],
  }));

  return (
    <Animated.View pointerEvents="none" style={[styles.shimmer, style]}>
      {SHIMMER_SLICES.map((alpha, index) => (
        <View key={index} style={[styles.shimmerSlice, { opacity: alpha }]} />
      ))}
    </Animated.View>
  );
}

/** The badge, rolling up into place when the row's content changes. */
function RowBadge({ badge, refreshKey, delay }: { badge: string; refreshKey?: string; delay: number }) {
  const reducedMotion = useReducedMotion();
  const opacity = useSharedValue(1);
  const shift = useSharedValue(0);

  useOnRefresh(refreshKey, () => {
    if (reducedMotion) {
      opacity.value = withSequence(withTiming(0.3, { duration: 0 }), withDelay(delay, withTiming(1, { duration: 200 })));
      return;
    }
    opacity.value = withSequence(withTiming(0, { duration: 0 }), withDelay(delay + 120, withTiming(1, { duration: 240 })));
    shift.value = withSequence(withTiming(10, { duration: 0 }), withDelay(delay + 120, withSpring(0, Motion.snap)));
  });

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: shift.value }],
  }));

  return (
    <Animated.View style={[styles.badge, style]}>
      <Text style={styles.badgeText}>{badge}</Text>
    </Animated.View>
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
    opacity: 0.55 + 0.45 * Math.max(0, Math.min(1, drag.value / SWIPE_COMMIT_DISTANCE)),
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
  fillFull: { right: 0 },
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
  shimmer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    flexDirection: 'row',
  },
  shimmerSlice: {
    width: SHIMMER_SLICE_W,
    height: '100%',
    backgroundColor: Colors.bone,
  },
  badgeText: {
    fontFamily: Fonts.bodyMedium,
    fontSize: 13,
    letterSpacing: 1,
    color: Colors.bone,
    opacity: 0.9,
  },
});
