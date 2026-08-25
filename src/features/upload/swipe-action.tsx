import * as Haptics from 'expo-haptics';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { Colors, Fonts, Spacing, Theme } from '@/constants/theme';

/**
 * Drag distance that counts as a commit. SignOutRow (settings.tsx)
 * uses this same 88 / 112 pair travelling left; reusing the numbers keeps
 * every swipe-to-confirm row in the app feeling like the same gesture at
 * the same weight, just pointed in whichever direction reads as "forward"
 * for that action.
 */
const COMMIT_DISTANCE = 88;
/** Hard stop past the commit point, so the row still gives a little travel
 *  and resistance after firing rather than snapping dead at the threshold. */
const MAX_DRAG = 112;

const SPRING = { damping: 18, stiffness: 220, mass: 0.7 } as const;

interface SwipeActionProps {
  label: string;
  hint?: string;
  onConfirm: () => void;
  tone?: 'default' | 'accent';
  disabled?: boolean;
}

/**
 * Reusable swipe-to-confirm row — SignOutRow's grammar generalised. Where
 * SignOutRow drags left because "end the session" reads as pulling away,
 * every action here (choose a file, extract, save) reads as moving forward,
 * so the drag runs right instead. The fill bar is the other addition:
 * SignOutRow never needed one because there is only one place a settings
 * row gets swiped, but a file-picking flow has several of these back to
 * back and each one benefits from showing exactly how close a drag is to
 * landing.
 */
export function SwipeAction({
  label,
  hint = 'SWIPE RIGHT',
  onConfirm,
  tone = 'default',
  disabled = false,
}: SwipeActionProps) {
  const drag = useSharedValue(0);

  const commit = () => {
    Haptics.selectionAsync();
    onConfirm();
  };

  const gesture = Gesture.Pan()
    .enabled(!disabled)
    .activeOffsetX([-8, 8])
    .onChange((event) => {
      drag.value = Math.max(0, Math.min(MAX_DRAG, drag.value + event.changeX));
    })
    .onEnd(() => {
      if (drag.value > COMMIT_DISTANCE) runOnJS(commit)();
      drag.value = withSpring(0, SPRING);
    });

  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: drag.value }],
  }));

  // Scaled against COMMIT_DISTANCE rather than MAX_DRAG, so the bar reads
  // full exactly when the drag has travelled far enough to fire — the
  // "legible commit point" the row exists to provide.
  const fillStyle = useAnimatedStyle(() => ({
    width: `${Math.min(100, (drag.value / COMMIT_DISTANCE) * 100)}%`,
  }));

  const fillColor = tone === 'accent' ? Colors.rust : Theme.surface;

  return (
    <View style={[styles.row, disabled && styles.rowDisabled]}>
      <Animated.View style={[styles.fill, fillStyle, { backgroundColor: fillColor }]} />
      <GestureDetector gesture={gesture}>
        <Animated.View style={[styles.content, contentStyle]}>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.hint}>{hint}</Text>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    height: 56,
    borderRadius: 16,
    backgroundColor: Theme.surface,
    // Clips the fill bar's square edges to the row's own rounded corners,
    // and doubles as the boundary that swallows the hint text as it drags
    // off the right edge on commit rather than spilling past the row.
    overflow: 'hidden',
  },
  rowDisabled: {
    opacity: 0.4,
  },
  fill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
  },
  label: {
    fontFamily: Fonts.bodyBold,
    fontSize: 15,
    letterSpacing: 0.5,
    color: Theme.text,
  },
  hint: {
    fontFamily: Fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 1.2,
    color: Theme.textMuted,
  },
});
