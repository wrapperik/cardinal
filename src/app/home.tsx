import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useMemo, useRef, useState } from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Colors, Fonts, Spacing } from "@/constants/theme";
// Character selector disabled — see @/features/home/character-wheel and
// @/features/character/store, both commented out wholesale.
// import { CharacterWheel } from "@/features/home/character-wheel";
import { PillMenu } from "@/features/home/pill-menu";
import { PillRow } from "@/features/home/pill-row";
import { SettingsPanel } from "@/features/home/settings-panel";
import { gameHref, rotate, type Topic } from "@/features/home/topics";
import { useCourses } from "@/features/upload/courses";
import {
  UploadSheet,
  type UploadSheetHandle,
} from "@/features/upload/upload-sheet";
import type { GameType } from "@/types/cardinal";

/**
 * The home screen. Nothing here is tappable — the pill rows are pure
 * ambience and the only interaction is dragging the settings tab in from
 * the right edge, in keeping with the gesture-only premise.
 */
export default function Home() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { height: screenH } = useWindowDimensions();

  // The pills are the course list itself, so a course created from an upload
  // shows up here without a second source of truth to keep in step.
  const courses = useCourses();
  const rowTwo = useMemo(() => rotate(courses, 2), [courses]);

  // The held pill, kept whole rather than as a title: committing needs its
  // gameType to know which template to open.
  const [activeTopic, setActiveTopic] = useState<Topic | null>(null);
  const upload = useRef<UploadSheetHandle>(null);
  const paused = useSharedValue(0);
  const selection = useSharedValue(0);

  const handleOpen = (title: string, gameType: GameType) => {
    // A second finger on the other row must not steal the open menu.
    if (activeTopic !== null) return;
    setActiveTopic({ title, gameType });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  // TODO(week5): route the recap and scores rows once those screens exist.
  const handleCommit = (index: number) => {
    // Read before clearing — the state is gone by the time we navigate.
    const chosen = activeTopic;
    setActiveTopic(null);
    // A cancelled hold arrives as -1 and must never navigate anywhere.
    if (index < 0 || chosen === null) return;
    Haptics.selectionAsync();
    // Matched by title rather than threaded through the pill: only primitives
    // cross the worklet boundary on touch, and titles are unique by
    // construction — the course store folds a duplicate into the original.
    const course = courses.find((c) => c.title === chosen.title);
    if (index === 1) {
      router.push(gameHref(chosen.gameType, course?.id));
      return;
    }
    if (index === 2) upload.current?.open(course?.id);
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.wordmark, { paddingTop: insets.top + Spacing.md }]}>
        CARDINAL
      </Text>

      {/* Padded at the foot rather than centred outright: the design sits the
          rows above the middle of the screen, not in it. */}
      <View style={[styles.pillBlock, { paddingBottom: screenH * 0.28 }]}>
        <PillRow
          topics={courses}
          direction={1}
          paused={paused}
          selection={selection}
          onOpen={handleOpen}
          onCommit={handleCommit}
        />
        <PillRow
          topics={rowTwo}
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

      {/* <CharacterWheel bottom={insets.bottom + Spacing.lg} /> */}

      {activeTopic !== null && (
        <PillMenu title={activeTopic.title} selection={selection} />
      )}

      <UploadSheet ref={upload} />
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
    marginTop: 8,
    color: Colors.bone,
    letterSpacing: 2,
    fontSize: 40,
  },
  pillBlock: {
    flex: 1,
    justifyContent: "center",
    gap: Spacing.md,
  },
  dots: {
    position: "absolute",
    width: DOT_SIZE * 2 + DOT_GAP,
    height: DOT_SIZE * 2 + DOT_GAP,
  },
  dot: {
    position: "absolute",
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
