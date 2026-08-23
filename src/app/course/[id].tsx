import { useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ExitSled } from "@/components/exit-sled";
import { PULL_TAB_HEIGHT } from "@/components/pull-tab";
import { Fonts, Spacing, Theme } from "@/constants/theme";
import { courseStats } from "@/features/upload/course-stats";
import { useCourses } from "@/features/upload/courses";
import { useDecks } from "@/features/upload/decks";

/** Same clearance game screens get from GAME_HEADER_H — the BACK tab sits at
 *  insets.top + Spacing.md, PULL_TAB_HEIGHT tall, so content needs to start
 *  past that or its top edge renders hidden behind the tab. */
const CONTENT_TOP_CLEARANCE = PULL_TAB_HEIGHT + Spacing.lg;

/**
 * Course detail. Minimal for now — chunk 5 fills this in with
 * continue-from-checkpoint, uploading straight into this course, and past
 * scores read from the sessions store. Today it just proves the course is
 * real: title, stats, and whatever topics its cards actually cover.
 */
export default function CourseDetail() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const decks = useDecks();
  // Subscribed rather than read once: courses hydrate from AsyncStorage after
  // import, so a one-shot read on mount can render a heading for a course the
  // store has not caught up to yet. Decks are already subscribed just below
  // for the same reason.
  const courses = useCourses();

  const course = id ? courses.find((c) => c.id === id) : undefined;
  const stats = id ? courseStats(decks, id) : { cardCount: 0, gameTypes: [], topics: [] };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + CONTENT_TOP_CLEARANCE,
          paddingHorizontal: Spacing.lg,
        }}
      >
        <Text style={styles.heading}>{course?.title ?? "—"}</Text>
        <Text style={styles.stats}>
          {stats.cardCount} CARD{stats.cardCount === 1 ? "" : "S"} · {stats.gameTypes.length} GAME
          {stats.gameTypes.length === 1 ? "" : "S"}
        </Text>

        <Text style={styles.sectionLabel}>TOPICS</Text>
        {stats.topics.length === 0 ? (
          <Text style={styles.empty}>NO UPLOADED MATERIAL YET</Text>
        ) : (
          stats.topics.map((topic) => (
            <Text key={topic} style={styles.topic}>
              {topic}
            </Text>
          ))
        )}
      </ScrollView>

      {/* Sibling of the ScrollView, not inside it — riding inside would scroll
          the exit tab away with the content instead of leaving it pinned.
          Course detail sits to the right of Home in the app's spatial model,
          so its tab lives on the left edge: drag right, Home arrives from
          the left — the mirror of how games (right edge, drag left) exit. */}
      <ExitSled label="BACK" onLeave={() => router.back()} edge="left" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.background,
  },
  scroll: {
    flex: 1,
  },
  heading: {
    fontFamily: Fonts.display,
    color: Theme.text,
    letterSpacing: 2,
    fontSize: 40,
  },
  stats: {
    marginTop: Spacing.sm,
    fontFamily: Fonts.bodyBold,
    fontSize: 14,
    letterSpacing: 0.5,
    color: Theme.textMuted,
  },
  sectionLabel: {
    fontFamily: Fonts.bodyBold,
    fontSize: 12,
    letterSpacing: 2,
    color: Theme.textMuted,
    marginTop: Spacing.xl,
    marginBottom: Spacing.sm,
  },
  topic: {
    fontFamily: Fonts.body,
    fontSize: 15,
    color: Theme.text,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.glassEdge,
  },
  empty: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: Theme.textMuted,
  },
});
