import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { selection } from '@/lib/haptics';
import { useReducedMotion } from '@/lib/accessibility';

/**
 * Horizontal inset of the pill track. A single constant because the snap
 * offsets are computed by subtracting it back off each pill's measured x —
 * a padding and a subtraction that drifted apart would park every pill one
 * inset off, which is exactly the kind of bug two literals invite.
 */
const EDGE_INSET = Spacing.md;

/** Where a pill sits and how wide it is. The width is only needed for the
 *  last pill, to work out how much empty track has to follow it. */
interface Measurement {
  offset: number;
  width: number;
}

export interface PillNavItem {
  id: string;
  title: string;
}

interface PillNavProps {
  items: PillNavItem[];
  activeId: string | null;
  onChange: (id: string) => void;
}

/**
 * Course navigation, not ambience. The old marquee pill row used to loop
 * forever because nothing could touch it — it existed purely to make the screen feel alive
 * above the rows the player actually used. This row IS what the player
 * uses now: it drives which course the rest of the screen shows, so an
 * animation that kept the pills moving under a finger trying to land on one
 * would actively fight the thing this row has become.
 */
export function PillNav({ items, activeId, onChange }: PillNavProps) {
  const reducedMotion = useReducedMotion();
  const scrollRef = useRef<ScrollView>(null);
  const measured = useRef<(Measurement | undefined)[]>([]);
  const [layout, setLayout] = useState<Measurement[]>([]);
  const [viewportWidth, setViewportWidth] = useState(0);
  const activeIndexRef = useRef(0);

  /**
   * Publishes the measurements only once every pill has actually reported
   * one. A partly-filled array must never reach snapToOffsets: the holes
   * cross the bridge as `null`, and RCTScrollView rejects a null where it
   * wants a number, which takes the whole screen down.
   *
   * The emptiness test is an indexed loop rather than `.some()` on purpose.
   * Setting `.length` on an array leaves HOLES, not `undefined` entries, and
   * every iteration method — `some`, `map`, `forEach`, `filter` — skips holes
   * outright. `some(v => v === undefined)` therefore visits nothing and
   * cheerfully reports a completely empty array as complete. Reading
   * `current[i]` is the one form that does see a hole, as `undefined`.
   */
  const publishIfComplete = useCallback((count: number) => {
    const current = measured.current;
    if (current.length !== count) return;
    for (let i = 0; i < count; i += 1) {
      if (current[i] === undefined) return;
    }
    // Copied, not handed over: `measured` is a ref this component keeps
    // mutating in place, and passing it straight to state would let a later
    // measurement edit the array React is already holding — changing what
    // the offsets memo derives from without ever changing its identity, so
    // it would never recompute.
    setLayout(current.slice() as Measurement[]);
  }, []);

  // Trimmed to the new length, NOT cleared. onLayout only fires for a pill
  // whose own layout actually changed, so appending a course (which is what
  // an upload does) leaves every existing pill silent — clearing the cache
  // here would strand the array one measurement short of complete forever,
  // and with it snapping and selection for the rest of the session.
  useEffect(() => {
    measured.current.length = items.length;
    publishIfComplete(items.length);
  }, [items.length, publishIfComplete]);

  const handleLayout = useCallback(
    (index: number) => (event: LayoutChangeEvent) => {
      const { x, width } = event.nativeEvent.layout;
      // The content is inset by EDGE_INSET, so a pill's own x already
      // includes that padding — subtracting it here is what makes the pill
      // land flush against the row's left edge instead of one inset short.
      measured.current[index] = { offset: x - EDGE_INSET, width };
      publishIfComplete(items.length);
    },
    [items.length, publishIfComplete],
  );

  const offsets = useMemo(() => layout.map((entry) => entry.offset), [layout]);

  /**
   * Trailing space past the last pill.
   *
   * Without it the last pill can never actually snap, and the row stops
   * feeling like navigation right where it matters most. A ScrollView cannot
   * scroll further than `contentWidth - viewportWidth`, so bringing the LAST
   * pill flush against the left inset requires roughly a viewport's worth of
   * emptiness behind it — otherwise its snap offset simply lies past the end
   * of the scrollable range and the row drifts to a stop short of it.
   */
  const trailingSpace = useMemo(() => {
    const lastPill = layout[layout.length - 1];
    if (!lastPill || viewportWidth === 0) return EDGE_INSET;
    return Math.max(EDGE_INSET, viewportWidth - lastPill.width - EDGE_INSET);
  }, [layout, viewportWidth]);

  // Mirrors whatever the parent currently considers active, so the ref that
  // suppresses duplicate onChange calls is comparing against the real
  // selection rather than against its own initial guess of index 0.
  useEffect(() => {
    const index = items.findIndex((item) => item.id === activeId);
    if (index >= 0) activeIndexRef.current = index;
  }, [activeId, items]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (offsets.length === 0) return;
      const x = event.nativeEvent.contentOffset.x;
      let nearestIndex = 0;
      let nearestDistance = Infinity;
      for (let i = 0; i < offsets.length; i += 1) {
        const distance = Math.abs(offsets[i] - x);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = i;
        }
      }
      // Derived live off the scroll offset rather than waiting for
      // onMomentumScrollEnd — that's what makes the rows below feel
      // attached to the finger instead of catching up a beat late.
      if (nearestIndex !== activeIndexRef.current) {
        activeIndexRef.current = nearestIndex;
        selection();
        onChange(items[nearestIndex].id);
      }
    },
    [offsets, items, onChange],
  );

  const handlePress = useCallback(
    (index: number) => {
      const offset = offsets[index];
      if (offset === undefined) return;
      // Only moves the scroll position — the scroll handler above is the
      // single place selection happens, so a press can't select once by
      // its own logic and again when the resulting scroll settles.
      scrollRef.current?.scrollTo({ x: offset, animated: !reducedMotion });
    },
    [offsets, reducedMotion],
  );

  if (items.length === 0) return null;

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.content, { paddingRight: trailingSpace }]}
      // Omitted entirely until the pills have been measured, rather than
      // passed as an empty array — there is nothing to snap to before the
      // first layout pass, and this keeps the crash above impossible to
      // reintroduce from the render side as well as the state side.
      snapToOffsets={offsets.length > 0 ? offsets : undefined}
      // "fast" plus disableIntervalMomentum is what makes one swipe move
      // exactly one pill: without the second, a flick coasts through several
      // snap points before settling, which reads as the row overshooting
      // rather than as navigating.
      decelerationRate="fast"
      disableIntervalMomentum
      snapToAlignment="start"
      scrollEventThrottle={16}
      onScroll={handleScroll}
      onLayout={(event) => setViewportWidth(event.nativeEvent.layout.width)}
    >
      {items.map((item, index) => (
        <Pill
          key={item.id}
          title={item.title}
          active={item.id === activeId}
          onLayout={handleLayout(index)}
          onPress={() => handlePress(index)}
        />
      ))}
    </ScrollView>
  );
}

function Pill({
  title,
  active,
  onLayout,
  onPress,
}: {
  title: string;
  active: boolean;
  onLayout: (event: LayoutChangeEvent) => void;
  onPress: () => void;
}) {
  return (
    <Pressable
      onLayout={onLayout}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      style={[styles.pill, active ? styles.pillActive : styles.pillInactive]}
    >
      <Text
        style={[styles.pillText, active ? styles.pillTextActive : styles.pillTextInactive]}
        numberOfLines={1}
      >
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: EDGE_INSET,
    gap: Spacing.md,
  },
  pill: {
    borderWidth: 2,
    borderColor: Colors.bone,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    // Course titles are user-supplied and unbounded; without a cap a long
    // one can produce a pill wider than the screen, which also breaks
    // snapping since its snap offset would exceed the scrollable range.
    maxWidth: 260,
  },
  pillActive: {
    backgroundColor: Colors.bone,
  },
  pillInactive: {
    backgroundColor: 'transparent',
  },
  pillText: {
    fontFamily: Fonts.bodyBold,
    fontSize: 18,
    letterSpacing: 1,
  },
  pillTextActive: {
    color: Colors.charcoal,
  },
  pillTextInactive: {
    color: Colors.bone,
  },
});
