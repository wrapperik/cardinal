import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

import { Colors, Fonts, Spacing } from '@/constants/theme';
import { MENU_ITEMS, type Topic } from '@/features/home/topics';

const REPEATS = 3;
/** Pixels per second the pills drift. Slow — this is ambience, not motion. */
const MARQUEE_SPEED = 28;

/** Finger travel per menu item. */
export const ITEM_STEP = 56;

interface PillRowProps {
  topics: Topic[];
  /** +1 drifts left, -1 drifts right. */
  direction: 1 | -1;
  /** 1 = frozen. Set while a pill is held so the menu underneath holds still. */
  paused: SharedValue<number>;
  /** Index of the currently highlighted menu row while a pill is held. */
  selection: SharedValue<number>;
  onOpen: (title: string) => void;
  onCommit: (index: number) => void;
}

/**
 * An infinitely looping horizontal marquee of topic pills. The topic list is
 * rendered REPEATS times so there is always a full set covering the visible
 * track while the offset wraps, giving the illusion of endless scroll.
 */
export function PillRow({
  topics,
  direction,
  paused,
  selection,
  onOpen,
  onCommit,
}: PillRowProps) {
  const offset = useSharedValue(0);
  const setWidth = useSharedValue(0);

  useFrameCallback((frame) => {
    if (paused.value === 1) return;
    const dt = (frame.timeSincePreviousFrame ?? 16) / 1000;
    if (setWidth.value === 0) return;
    offset.value = (offset.value + MARQUEE_SPEED * dt) % setWidth.value;
  });

  const trackStyle = useAnimatedStyle(() => {
    if (setWidth.value === 0) return { transform: [{ translateX: 0 }] };
    // Drifting right means starting one set to the left and moving towards zero,
    // so there is always a rendered set covering the gap.
    const x = direction === 1 ? -offset.value : offset.value - setWidth.value;
    return { transform: [{ translateX: x }] };
  });

  return (
    <View style={styles.row}>
      <Animated.View
        style={[styles.track, trackStyle]}
        onLayout={(e) => {
          setWidth.value = e.nativeEvent.layout.width / REPEATS;
        }}
      >
        {Array.from({ length: REPEATS }).flatMap((_, r) =>
          topics.map((topic, i) => (
            <Pill
              key={`${r}-${i}`}
              title={topic.title}
              trackX={offset}
              setWidth={setWidth}
              direction={direction}
              paused={paused}
              selection={selection}
              onOpen={onOpen}
              onCommit={onCommit}
            />
          )),
        )}
      </Animated.View>
    </View>
  );
}

function Pill({
  title,
  trackX,
  setWidth,
  direction,
  paused,
  selection,
  onOpen,
  onCommit,
}: {
  title: string;
  trackX: SharedValue<number>;
  setWidth: SharedValue<number>;
  direction: 1 | -1;
  paused: SharedValue<number>;
  selection: SharedValue<number>;
  onOpen: (title: string) => void;
  onCommit: (index: number) => void;
}) {
  const { width: screenW } = useWindowDimensions();
  const x = useSharedValue(0);
  const w = useSharedValue(0);
  /** Distinguishes a real release from a cancelled gesture. */
  const ended = useSharedValue(0);

  // 1 when the screen's centre line falls within this pill's own bounds, 0
  // otherwise. This guarantees exactly one filled pill per row and a clean
  // handover, rather than a threshold that can light two pills or none.
  const filled = useDerivedValue(() => {
    if (w.value === 0) return 0;
    // Must mirror trackStyle exactly. Dropping the setWidth term on the
    // right-drifting row would offset the reading by a whole set, highlighting a
    // different copy of the same pill — usually one that is off-screen.
    const shift = direction === 1 ? -trackX.value : trackX.value - setWidth.value;
    const centre = shift + x.value + w.value / 2;
    // Half a gap of tolerance either side, so the handover between neighbours has
    // no dead moment where the centre line sits between two pills.
    return Math.abs(centre - screenW / 2) < w.value / 2 + Spacing.md / 2 ? 1 : 0;
  });

  const boxStyle = useAnimatedStyle(() => ({
    backgroundColor: filled.value === 1 ? Colors.bone : Colors.rust,
  }));

  const textStyle = useAnimatedStyle(() => ({
    color: filled.value === 1 ? Colors.rust : Colors.bone,
  }));

  const press = Gesture.Pan()
    .minDistance(0)
    .shouldCancelWhenOutside(false)
    .onBegin(() => {
      paused.value = 1;
      selection.value = 0;
      runOnJS(onOpen)(title);
    })
    .onChange((e) => {
      // translationY is cumulative from the touch-down point, which is what a
      // continuous hold-and-slide selection needs.
      const raw = Math.round(e.translationY / ITEM_STEP);
      // The clamp must derive from the data or the two silently drift apart.
      selection.value = Math.min(MENU_ITEMS.length - 1, Math.max(0, raw));
    })
    .onEnd(() => {
      // Only a clean release counts as a choice.
      ended.value = 1;
    })
    .onFinalize(() => {
      paused.value = 0;
      // onFinalize also runs when the gesture is cancelled or interrupted, which
      // must dismiss the menu without selecting anything — hence the -1.
      runOnJS(onCommit)(ended.value === 1 ? selection.value : -1);
      ended.value = 0;
    });

  return (
    <GestureDetector gesture={press}>
      <Animated.View
        style={[styles.pill, boxStyle]}
        onLayout={(e) => {
          x.value = e.nativeEvent.layout.x;
          w.value = e.nativeEvent.layout.width;
        }}
      >
        <Animated.Text style={[styles.pillText, textStyle]}>
          {title}
        </Animated.Text>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  row: {
    overflow: 'hidden',
  },
  track: {
    flexDirection: 'row',
    gap: Spacing.md,
    alignSelf: 'flex-start',
  },
  pill: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: Colors.bone,
  },
  pillText: {
    fontFamily: Fonts.bodyBold,
    fontSize: 18,
    letterSpacing: 1,
  },
});
