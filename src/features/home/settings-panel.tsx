import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Fonts, Spacing, Theme } from '@/constants/theme';

/** How far the tab pokes into the screen when the panel is closed. */
const TAB_PEEK = 132;
/** Extra width tucked under the panel edge so the tab never shows a seam. */
const TAB_TUCK = 40;

const PANEL_SPRING = { damping: 18, stiffness: 140, mass: 0.9 } as const;

/**
 * Full-screen settings panel, dragged into view by the tab peeking in from the
 * right edge. There is no tap target anywhere — the tab and the open panel share
 * one Pan gesture, so pulling either direction is what opens and closes it.
 *
 * The whole thing is one wide sled: tab on the left, panel to its right. The tab
 * has to live INSIDE the dragged view's bounds rather than hanging off its left
 * edge, because Android clips children that overflow their parent — a tab
 * positioned outside would neither draw nor take touches there.
 */
export function SettingsPanel() {
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();

  // 0 = closed, 1 = open.
  const progress = useSharedValue(0);

  const sledStyle = useAnimatedStyle(() => ({
    // Closed, the sled sits one tab-width short of the right edge, so only the
    // tab shows. Open, it has travelled a full screen width to the left.
    transform: [{ translateX: screenW - TAB_PEEK - progress.value * screenW }],
  }));

  // Two instances of the same pan, because one Gesture object cannot be attached
  // to two views. The tab carries one; the open panel carries the other so it can
  // be pushed back. The sled itself stays untouchable, or its full-height column
  // down the right edge would swallow every gesture that started there.
  const makeDrag = () =>
    Gesture.Pan()
      // Deliberate: a dozen pixels of sideways travel before this takes over, so
      // brushing past the tab never drags the settings screen out.
      .activeOffsetX([-12, 12])
      .onChange((e) => {
        // Dragging left (negative changeX) opens it.
        progress.value = Math.min(1, Math.max(0, progress.value - e.changeX / screenW));
      })
      .onEnd((e) => {
        // A decisive flick wins over position, so a short fast pull still opens it.
        const open =
          e.velocityX < -600 ? true : e.velocityX > 600 ? false : progress.value > 0.4;
        progress.value = withSpring(open ? 1 : 0, PANEL_SPRING);
      });

  return (
    <Animated.View
      style={[styles.sled, { width: screenW + TAB_PEEK }, sledStyle]}
      pointerEvents="box-none"
    >
      <GestureDetector gesture={makeDrag()}>
        <View style={[styles.tab, { top: insets.top + Spacing.md }]}>
          <Text style={styles.tabChevron}>‹</Text>
          <Text style={styles.tabLabel}>SETTINGS</Text>
        </View>
      </GestureDetector>

      <GestureDetector gesture={makeDrag()}>
        <View style={[styles.panel, { width: screenW }]}>
          <View style={{ paddingTop: insets.top + Spacing.xl }}>
            <Text style={styles.heading}>SETTINGS</Text>
            <Text style={styles.row}>ACCOUNT</Text>
            <Text style={styles.row}>ACCESSIBILITY</Text>
            <Text style={styles.row}>ABOUT</Text>
          </View>

          <Text style={[styles.hint, { bottom: insets.bottom + Spacing.xl }]}>
            DRAG RIGHT TO CLOSE
          </Text>
        </View>
      </GestureDetector>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sled: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    zIndex: 10,
  },
  tab: {
    position: 'absolute',
    left: 0,
    width: TAB_PEEK + TAB_TUCK,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderTopLeftRadius: 999,
    borderBottomLeftRadius: 999,
    // Same charcoal as the panel, so the tucked-under portion shows no seam.
    backgroundColor: Colors.charcoal,
  },
  panel: {
    position: 'absolute',
    left: TAB_PEEK,
    top: 0,
    bottom: 0,
    backgroundColor: Theme.background,
    paddingHorizontal: Spacing.lg,
  },
  tabChevron: {
    fontFamily: Fonts.body,
    fontSize: 20,
    color: Theme.text,
  },
  tabLabel: {
    fontFamily: Fonts.bodyBold,
    fontSize: 15,
    letterSpacing: 1,
    color: Theme.text,
  },
  heading: {
    fontFamily: Fonts.display,
    fontSize: 24,
    color: Theme.text,
  },
  row: {
    marginTop: Spacing.lg,
    fontFamily: Fonts.body,
    fontSize: 16,
    color: Theme.textMuted,
  },
  hint: {
    position: 'absolute',
    left: Spacing.lg,
    right: Spacing.lg,
    fontFamily: Fonts.body,
    fontSize: 13,
    color: Theme.textMuted,
  },
});
