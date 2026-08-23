import * as Haptics from 'expo-haptics';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { Colors, Fonts, Spacing } from '@/constants/theme';

/**
 * Same 88 / 112 pair as SwipeAction (swipe-action.tsx) and SignOutRow
 * (settings-panel.tsx) — every swipe-to-confirm row in the app shares this
 * weight so a course row feels like the same gesture as the rest of the
 * house, just able to fire in either direction instead of one.
 */
const COMMIT_DISTANCE = 88;
const MAX_DRAG = 112;

const SPRING = { damping: 18, stiffness: 220, mass: 0.7 } as const;

interface CourseRowProps {
  title: string;
  cardCount: number;
  gameCount: number;
  seeded: boolean;
  /** Right swipe. */
  onPlay: () => void;
  /** Left swipe. */
  onDetail: () => void;
}

/**
 * A bidirectional swipe row: the content is the only interaction, so both
 * edges have to earn their keep. Right reads as "forward" (play), left as
 * "back" (detail) — the same forward/away split SwipeAction and SignOutRow
 * establish, just both directions live on the one row instead of split
 * across two.
 */
export function CourseRow({ title, cardCount, gameCount, seeded, onPlay, onDetail }: CourseRowProps) {
  const drag = useSharedValue(0);

  const play = () => {
    Haptics.selectionAsync();
    onPlay();
  };

  const detail = () => {
    Haptics.selectionAsync();
    onDetail();
  };

  const gesture = Gesture.Pan()
    // Matches SwipeAction's own threshold: enough sideways travel to tell a
    // deliberate swipe from a vertical scroll, so the enclosing ScrollView
    // still wins a drag that reads as vertical.
    .activeOffsetX([-8, 8])
    .onChange((event) => {
      drag.value = Math.max(-MAX_DRAG, Math.min(MAX_DRAG, drag.value + event.changeX));
    })
    .onEnd(() => {
      if (drag.value > COMMIT_DISTANCE) runOnJS(play)();
      else if (drag.value < -COMMIT_DISTANCE) runOnJS(detail)();
      drag.value = withSpring(0, SPRING);
    });

  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: drag.value }],
  }));

  // Scaled against COMMIT_DISTANCE rather than MAX_DRAG, so a fill reads
  // full exactly when the drag has travelled far enough to fire — the same
  // reasoning SwipeAction documents for its own fill bar.
  const playFillStyle = useAnimatedStyle(() => ({
    width: `${Math.max(0, Math.min(100, (drag.value / COMMIT_DISTANCE) * 100))}%`,
  }));

  const detailFillStyle = useAnimatedStyle(() => ({
    width: `${Math.max(0, Math.min(100, (-drag.value / COMMIT_DISTANCE) * 100))}%`,
  }));

  return (
    <View style={styles.row}>
      {/* Two fills rather than one that slides sides: a swipe that overshoots
          and springs back must never leave the wrong edge lit, and animating
          a position swap on direction change reads as a stutter a plain
          width tween does not have. */}
      <Animated.View style={[styles.fill, styles.fillLeft, playFillStyle]} />
      <Animated.View style={[styles.fill, styles.fillRight, detailFillStyle]} />

      <GestureDetector gesture={gesture}>
        <Animated.View style={[styles.content, contentStyle]}>
          {/* PLAY sits on the LEFT because a right swipe is what fires it,
              and a right swipe grows the left-hand fill. The label has to
              live on the edge that lights up for its own gesture, or the row
              tells you one thing and shows you another. DETAIL mirrors it. */}
          <Text style={styles.playHint}>PLAY ›</Text>

          <View style={styles.body}>
            <View style={styles.titleLine}>
              <Text style={styles.title} numberOfLines={1}>
                {title}
              </Text>
              {seeded && <Text style={styles.sample}>SAMPLE</Text>}
            </View>
            <Text style={styles.meta} numberOfLines={1}>
              {cardCount} CARD{cardCount === 1 ? '' : 'S'} · {gameCount} GAME{gameCount === 1 ? '' : 'S'}
            </Text>
          </View>

          <Text style={styles.detailHint}>‹ DETAIL</Text>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    height: 72,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: Colors.bone,
    // Clips both fill bars to the row's own rounded corners — exactly
    // SwipeAction's construction.
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    // Charcoal, NOT bone. SwipeAction can fill bone-ward because it sits on
    // a charcoal panel, but this row sits on rust and carries bone text and
    // a bone border — a bone fill would slide underneath its own label and
    // erase it exactly as the drag approaches the commit point, which is the
    // one moment the row has to stay readable. Charcoal is the app's third
    // core colour, so the row still arms itself in the palette rather than
    // borrowing something new.
    backgroundColor: Colors.charcoal,
  },
  fillLeft: {
    left: 0,
  },
  fillRight: {
    right: 0,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
  },
  // Left-aligned, not centred: the two hints already anchor the row's own
  // edges, so the title reads naturally against the left one rather than
  // floating in the middle of the space between them.
  body: {
    flex: 1,
    marginHorizontal: Spacing.md,
  },
  titleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  title: {
    // Shrinks first, so a long title truncates instead of shoving the
    // SAMPLE tag it shares the row with off the edge.
    flexShrink: 1,
    fontFamily: Fonts.bodyBold,
    fontSize: 17,
    letterSpacing: 1,
    color: Colors.bone,
  },
  sample: {
    fontFamily: Fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 1,
    color: Colors.bone,
    opacity: 0.6,
  },
  meta: {
    marginTop: 2,
    fontFamily: Fonts.body,
    fontSize: 12,
    letterSpacing: 0.5,
    color: Colors.bone,
    opacity: 0.6,
  },
  // Hints stay visible rather than fading in on drag — this app labels every
  // gesture on the surface itself, never behind a reveal, or nobody would
  // guess a bare row swipes at all.
  detailHint: {
    fontFamily: Fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 1,
    color: Colors.bone,
    opacity: 0.5,
  },
  playHint: {
    fontFamily: Fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 1,
    color: Colors.bone,
    opacity: 0.5,
  },
});
