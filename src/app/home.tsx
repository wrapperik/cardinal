import { useRouter } from "expo-router";
import { useMemo, useRef } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BOTTOM_TAB_HEIGHT } from "@/components/bottom-pull-tab";
import { Colors, Fonts, Spacing } from "@/constants/theme";
import { CourseRow } from "@/features/home/course-row";
import { PillRow } from "@/features/home/pill-row";
import { SettingsPanel } from "@/features/home/settings-panel";
import { useCourses } from "@/features/upload/courses";
import { courseStats } from "@/features/upload/course-stats";
import { useDecks } from "@/features/upload/decks";
import {
  UploadSheet,
  type UploadSheetHandle,
} from "@/features/upload/upload-sheet";

const PILL_ROW_HEIGHT = 68;

/**
 * The home screen. The wordmark and a single decorative pill row sit up top
 * — ambience, nothing underneath them responds to touch — and everything
 * below is the actual content: one swipeable row per course, right for a
 * quick recap and left for its detail screen. Settings still lives behind
 * the tab dragged in from the right edge.
 */
export default function Home() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // The pill row and the course list are the same data, so a course created
  // from an upload shows up in both without a second source of truth to
  // keep in step.
  const courses = useCourses();
  const decks = useDecks();
  const upload = useRef<UploadSheetHandle>(null);

  // Computed once per courses/decks change rather than per row: courseStats
  // walks every deck, and doing that inside each CourseRow would repeat the
  // same full scan once per course instead of once for the screen.
  const stats = useMemo(
    () => new Map(courses.map((course) => [course.id, courseStats(decks, course.id)])),
    [courses, decks],
  );

  return (
    <View style={styles.container}>
      <Text style={[styles.wordmark, { paddingTop: insets.top + Spacing.md }]}>
        CARDINAL
      </Text>

      <View style={styles.pillBand}>
        <PillRow topics={courses} direction={1} />
      </View>

      <ScrollView
        style={styles.list}
        contentContainerStyle={[
          styles.listContent,
          // flexGrow + flex-end bottom-aligns the rows while the list is
          // shorter than the viewport, and gets out of the way the moment
          // there are enough courses to actually scroll.
          styles.listBottomAligned,
          // Clears both the corner dots and the upload tab peeking up from
          // the bottom edge, so the last row is never sitting under either.
          { paddingBottom: BOTTOM_TAB_HEIGHT + DOT_SIZE * 2 + DOT_GAP + insets.bottom + Spacing.lg },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {courses.map((course) => {
          const courseStatsEntry = stats.get(course.id);
          return (
            <CourseRow
              key={course.id}
              title={course.title}
              cardCount={courseStatsEntry?.cardCount ?? 0}
              gameCount={courseStatsEntry?.gameTypes.length ?? 0}
              seeded={course.seeded}
              onPlay={() =>
                router.push({ pathname: "/recap", params: { courseId: course.id } })
              }
              onDetail={() =>
                router.push({ pathname: "/course/[id]", params: { id: course.id } })
              }
            />
          );
        })}
      </ScrollView>

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
  pillBand: {
    height: PILL_ROW_HEIGHT,
    justifyContent: "center",
    marginTop: Spacing.lg,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    gap: Spacing.md,
  },
  listBottomAligned: {
    flexGrow: 1,
    justifyContent: "flex-end",
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
