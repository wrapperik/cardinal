import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Fonts, Spacing } from '@/constants/theme';
import { PillMenu } from '@/features/home/pill-menu';
import { PillRow } from '@/features/home/pill-row';
import { SettingsPanel } from '@/features/home/settings-panel';
import { TOPICS, TOPICS_ROW_TWO } from '@/features/home/topics';

/**
 * The home screen. Nothing here is tappable — the pill rows are pure
 * ambience and the only interaction is dragging the settings tab in from
 * the right edge, in keeping with the gesture-only premise.
 */
export default function Home() {
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();

  const [activeTopic, setActiveTopic] = useState<string | null>(null);
  const paused = useSharedValue(0);
  const selection = useSharedValue(0);

  const handleOpen = (t: string) => {
    setActiveTopic(t);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  // TODO(week5): route to the recap / quiz / upload / scores screens using
  // MENU_ITEMS[index] once they exist. Guard on index >= 0 there too — a
  // cancelled hold arrives as -1 and must never navigate anywhere.
  const handleCommit = (index: number) => {
    setActiveTopic(null);
    if (index >= 0) Haptics.selectionAsync();
  };

  return (
    <View style={styles.container}>
      <Text
        style={[styles.wordmark, { paddingTop: insets.top + Spacing.md }]}
      >
        CARDINAL
      </Text>

      {/* Padded at the foot rather than centred outright: the design sits the
          rows above the middle of the screen, not in it. */}
      <View style={[styles.pillBlock, { paddingBottom: screenH * 0.28 }]}>
        <PillRow
          topics={TOPICS}
          direction={1}
          paused={paused}
          selection={selection}
          onOpen={handleOpen}
          onCommit={handleCommit}
        />
        <PillRow
          topics={TOPICS_ROW_TWO}
          direction={-1}
          paused={paused}
          selection={selection}
          onOpen={handleOpen}
          onCommit={handleCommit}
        />
      </View>

      <View
        style={[
          styles.dots,
          { left: Spacing.lg, bottom: insets.bottom + Spacing.lg },
        ]}
      >
        <View style={[styles.dot, styles.dotTopLeft]} />
        <View style={[styles.dot, styles.dotBottomLeft]} />
        <View style={[styles.dot, styles.dotBottomRight]} />
      </View>

      {activeTopic !== null && <PillMenu title={activeTopic} selection={selection} />}

      <SettingsPanel />
    </View>
  );
}

const DOT_SIZE = 10;
const DOT_GAP = 8;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.rust,
  },
  wordmark: {
    paddingLeft: Spacing.lg,
    fontFamily: Fonts.display,
    fontSize: 28,
    color: Colors.bone,
    letterSpacing: 2,
  },
  pillBlock: {
    flex: 1,
    justifyContent: 'center',
    gap: Spacing.md,
  },
  dots: {
    position: 'absolute',
    width: DOT_SIZE * 2 + DOT_GAP,
    height: DOT_SIZE * 2 + DOT_GAP,
  },
  dot: {
    position: 'absolute',
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: Colors.bone,
    opacity: 0.9,
  },
  dotTopLeft: {
    left: 0,
    top: 0,
  },
  dotBottomLeft: {
    left: 0,
    top: DOT_SIZE + DOT_GAP,
  },
  dotBottomRight: {
    left: DOT_SIZE + DOT_GAP,
    top: DOT_SIZE + DOT_GAP,
  },
});
