import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

import { Colors, Fonts, Spacing } from '@/constants/theme';
import type { Topic } from '@/features/home/topics';

const REPEATS = 3;
/** Pixels per second the pills drift. Slow — this is ambience, not motion. */
const MARQUEE_SPEED = 28;

interface PillRowProps {
  topics: Topic[];
  /** +1 drifts left, -1 drifts right. */
  direction: 1 | -1;
}

/**
 * An infinitely looping horizontal marquee of topic pills. The topic list is
 * rendered REPEATS times so there is always a full set covering the visible
 * track while the offset wraps, giving the illusion of endless scroll.
 *
 * Pure ambience: nothing here responds to touch. The course rows below are
 * what the player actually touches — this row exists to make the screen
 * feel alive above them, nothing more.
 */
export function PillRow({ topics, direction }: PillRowProps) {
  const offset = useSharedValue(0);
  const setWidth = useSharedValue(0);

  useFrameCallback((frame) => {
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
}: {
  title: string;
  trackX: SharedValue<number>;
  setWidth: SharedValue<number>;
  direction: 1 | -1;
}) {
  const { width: screenW } = useWindowDimensions();
  const x = useSharedValue(0);
  const w = useSharedValue(0);

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

  return (
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
