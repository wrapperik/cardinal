import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

import { Colors, Fonts, Spacing, Theme } from '@/constants/theme';
import { selection } from '@/lib/haptics';
import type { TemplateChoice } from '@/features/upload/types';
import type { GameType } from '@/types/cardinal';

/** Display order and label for every chip. AUTO carries no GameType — it is
 *  the one choice that hands the decision to the model, per card. */
const CHIPS: { value: TemplateChoice; label: string }[] = [
  { value: 'auto', label: 'AUTO' },
  { value: 'compassQuiz', label: 'COMPASS QUIZ' },
  { value: 'trueFalseDuel', label: 'TRUE / FALSE' },
  { value: 'sequenceSwipe', label: 'SEQUENCE' },
  { value: 'matchRelease', label: 'MATCH' },
];

/** Reused by upload.tsx for the review stage's per-template card
 *  breakdown, so the two surfaces never disagree about what to call a
 *  template. */
export const TEMPLATE_LABELS: Record<GameType, string> = {
  compassQuiz: 'COMPASS QUIZ',
  trueFalseDuel: 'TRUE / FALSE',
  sequenceSwipe: 'SEQUENCE',
  matchRelease: 'MATCH',
};

interface TemplatePickerProps {
  value: TemplateChoice;
  onChange: (value: TemplateChoice) => void;
}

/**
 * Which game template the extracted cards become. The same hold-and-slide
 * grammar as DestinationPicker, turned sideways: one Gesture.Pan over the
 * whole chip row, the chip under the finger highlights, releasing commits
 * it. Horizontal rather than vertical because five short chips read
 * naturally left to right, the same way the home screen's own pill rows do.
 */
export function TemplatePicker({ value, onChange }: TemplatePickerProps) {
  const hover = useSharedValue(-1);
  const width = useSharedValue(0);

  function release(index: number) {
    if (index < 0) return;
    selection();
    onChange(CHIPS[index].value);
  }

  const indexAt = (x: number) => {
    'worklet';
    if (width.value === 0) return -1;
    const step = width.value / CHIPS.length;
    return Math.min(CHIPS.length - 1, Math.max(0, Math.floor(x / step)));
  };

  const gesture = Gesture.Pan()
    .minDistance(0)
    .onBegin((event) => {
      hover.value = indexAt(event.x);
    })
    .onChange((event) => {
      hover.value = indexAt(event.x);
    })
    .onEnd(() => {
      runOnJS(release)(hover.value);
    })
    .onFinalize(() => {
      hover.value = -1;
    });

  const selectedIndex = CHIPS.findIndex((chip) => chip.value === value);

  return (
    <GestureDetector gesture={gesture}>
      <View
        style={styles.row}
        onLayout={(event) => {
          width.value = event.nativeEvent.layout.width;
        }}
      >
        {CHIPS.map((chip, index) => (
          <Chip
            key={chip.value}
            label={chip.label}
            index={index}
            hover={hover}
            selected={index === selectedIndex}
          />
        ))}
      </View>
    </GestureDetector>
  );
}

function Chip({
  label,
  index,
  hover,
  selected,
}: {
  label: string;
  index: number;
  hover: SharedValue<number>;
  selected: boolean;
}) {
  const style = useAnimatedStyle(() => {
    // Same rule as DestinationPicker's rows: a live hold always overrides
    // the persisted choice, so dragging across the chips previews every
    // option in turn rather than just nudging the current one.
    const on = hover.value === -1 ? selected : hover.value === index;
    return { backgroundColor: on ? Colors.bone : 'transparent' };
  });

  const textStyle = useAnimatedStyle(() => {
    const on = hover.value === -1 ? selected : hover.value === index;
    return { color: on ? Colors.rust : Colors.bone };
  });

  return (
    <Animated.View style={[styles.chip, style]}>
      <Animated.Text numberOfLines={2} style={[styles.chipLabel, textStyle]}>
        {label}
      </Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.bone,
    overflow: 'hidden',
  },
  chip: {
    flex: 1,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xs,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: Theme.glassEdge,
  },
  chipLabel: {
    fontFamily: Fonts.bodyBold,
    fontSize: 9,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
});
