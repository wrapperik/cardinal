import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

import { Colors, Fonts, Spacing, Theme } from '@/constants/theme';
import { selection } from '@/lib/haptics';
import type { Course } from '@/features/upload/types';

/**
 * Finger travel per row. Unlike ITEM_STEP in the home screen's course pill
 * strip — which measures cumulative translation from wherever the hold
 * began, because that pill is reached by pressing a completely different
 * row first — this list is
 * touched directly, so the index comes from the finger's absolute position
 * inside the list rather than how far it has moved since touch-down.
 */
const ROW_HEIGHT = 44;
/**
 * Caps how many COURSE rows show at once, without a scroll view — the sheet
 * can't host one, it would fight the sled's own vertical pan.
 *
 * The create row is deliberately not counted against this and lives outside
 * the capped window entirely. Counting it in is what broke this picker
 * before: four seeded courses plus the create row is five, the window clipped
 * at four, and since the hovered index is derived from the finger's position
 * inside that window, the clipped row was not merely invisible but
 * unreachable — making a new course impossible on a fresh install.
 *
 * Past this many courses the overflow is still unreachable, which is a real
 * limit rather than a hidden one: a library that large wants a proper browse
 * screen, not a taller hold-and-slide strip.
 */
const MAX_VISIBLE_ROWS = 5;

interface DestinationPickerProps {
  courses: Course[];
  selectedId: string | null;
  suggestedId?: string | null;
  onSelect: (id: string) => void;
  onCreate: (title: string) => void;
}

/**
 * Where the upload gets filed. Same hold-and-slide grammar as PillMenu —
 * one Gesture.Pan, the row under the finger highlights as it
 * moves, releasing chooses it — but computed from one Pan over the whole
 * list rather than a GestureDetector per row, per the index-from-position
 * approach above.
 */
export function DestinationPicker({
  courses,
  selectedId,
  suggestedId = null,
  onSelect,
  onCreate,
}: DestinationPickerProps) {
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  // -1 = no active hold. While a hold is active this is the only thing that
  // decides the highlighted row; once it lifts, the row rendering falls
  // back to the persisted `selectedId` prop instead.
  const hover = useSharedValue(-1);
  // The create row sits outside the capped window on its own, so it needs its
  // own hover: one shared value cannot describe two separate strips.
  const createHover = useSharedValue(-1);

  const visibleRows = Math.min(courses.length, MAX_VISIBLE_ROWS);

  function release(index: number) {
    if (index < 0 || index >= courses.length) return;
    selection();
    onSelect(courses[index].id);
  }

  function beginCreate() {
    selection();
    setCreating(true);
  }

  const gesture = Gesture.Pan()
    .minDistance(0)
    // Disabled while typing a new title, so the gesture hands the view back
    // to the TextInput instead of hijacking touches meant for the cursor.
    .enabled(!creating)
    .onBegin((event) => {
      hover.value = Math.min(visibleRows - 1, Math.max(0, Math.floor(event.y / ROW_HEIGHT)));
    })
    .onChange((event) => {
      hover.value = Math.min(visibleRows - 1, Math.max(0, Math.floor(event.y / ROW_HEIGHT)));
    })
    .onEnd(() => {
      runOnJS(release)(hover.value);
    })
    .onFinalize(() => {
      hover.value = -1;
    });

  // A hold anywhere on the create row is the whole gesture — there is only one
  // row here, so there is no index to track, just whether the finger is down.
  const createGesture = Gesture.Pan()
    .minDistance(0)
    .enabled(!creating)
    .onBegin(() => {
      createHover.value = 0;
    })
    .onEnd(() => {
      runOnJS(beginCreate)();
    })
    .onFinalize(() => {
      createHover.value = -1;
    });

  function submitCreate() {
    const trimmed = title.trim();
    setCreating(false);
    setTitle('');
    if (trimmed) onCreate(trimmed);
  }

  return (
    <View style={styles.wrap}>
      {/* Exactly as tall as the rows it shows, so the window never clips a
          row it would then refuse to select. */}
      <View style={{ height: ROW_HEIGHT * visibleRows }}>
        <GestureDetector gesture={gesture}>
          <View>
            {courses.map((course, index) => (
              <Row
                key={course.id}
                label={course.title}
                index={index}
                hover={hover}
                selected={selectedId === course.id}
                suggested={suggestedId === course.id}
              />
            ))}
          </View>
        </GestureDetector>
      </View>

      {creating ? (
        <View style={styles.createField}>
          <TextInput
            value={title}
            onChangeText={setTitle}
            onSubmitEditing={submitCreate}
            onBlur={submitCreate}
            placeholder="COURSE TITLE"
            placeholderTextColor={Theme.textMuted}
            autoFocus
            returnKeyType="done"
            selectionColor={Theme.accent}
            style={styles.createInput}
          />
        </View>
      ) : (
        <GestureDetector gesture={createGesture}>
          <View>
            <Row
              label="+ NEW COURSE"
              index={0}
              hover={createHover}
              selected={false}
              suggested={false}
            />
          </View>
        </GestureDetector>
      )}
    </View>
  );
}

function Row({
  label,
  index,
  hover,
  selected,
  suggested,
}: {
  label: string;
  index: number;
  hover: SharedValue<number>;
  selected: boolean;
  suggested: boolean;
}) {
  const style = useAnimatedStyle(() => {
    // While a hold is active, hover always wins — even over the row the
    // user had previously chosen — matching PillMenu's own behaviour of the
    // live gesture overriding whatever was true before it started.
    const on = hover.value === -1 ? selected : hover.value === index;
    return {
      backgroundColor: on ? Colors.bone : 'transparent',
    };
  });

  const textStyle = useAnimatedStyle(() => {
    const on = hover.value === -1 ? selected : hover.value === index;
    return { color: on ? Colors.rust : Theme.text };
  });

  return (
    <Animated.View style={[styles.row, style]}>
      <Animated.Text numberOfLines={1} style={[styles.rowLabel, textStyle]}>
        {label}
      </Animated.Text>
      {suggested && (
        <View style={styles.tag}>
          <Text style={styles.tagText}>SUGGESTED</Text>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 16,
    backgroundColor: Theme.surface,
    overflow: 'hidden',
  },
  row: {
    height: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
  },
  rowLabel: {
    flex: 1,
    fontFamily: Fonts.bodyBold,
    fontSize: 14,
    letterSpacing: 0.5,
  },
  tag: {
    borderRadius: 999,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    backgroundColor: Colors.rust,
  },
  tagText: {
    fontFamily: Fonts.bodyBold,
    fontSize: 9,
    letterSpacing: 1,
    color: Colors.bone,
  },
  createField: {
    height: ROW_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
  },
  createInput: {
    fontFamily: Fonts.bodyMedium,
    fontSize: 14,
    color: Theme.text,
    padding: 0,
  },
});
