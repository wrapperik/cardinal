import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ListActionRow, ListGroup } from "@/components/grouped-list";
import { PageEmpty, PageScaffold } from "@/components/page-scaffold";
import { SkeletonBlock } from "@/components/skeleton-block";
import { Fonts, Spacing, Theme } from "@/constants/theme";
import { ScoreHero, StatTile, WeekChart } from "@/features/progress/progress-widgets";
import { useProgress, useProgressHydrated } from "@/features/progress/progress";
import { dailyStats, formatDuration, lastSevenDays, studyStreakDays } from "@/features/score/score";
import { summariseSessions } from "@/features/sessions/session-rules";
import { sessionsForCourse, useSessions, useSessionsHydrated } from "@/features/sessions/sessions";
import { courseStats } from "@/features/upload/course-stats";
import { useCourses, useCoursesHydrated } from "@/features/upload/courses";
import { useDecks, useDecksHydrated } from "@/features/upload/decks";
import { useDelayedSkeleton } from "@/lib/loading";

/**
 * The VIEW PROGRESS destination. A missing or unknown courseId (deep link,
 * stale param, whatever) is handled by falling through to the empty-string
 * id every stat function here already treats as "matches nothing" — that
 * zeroes every course-scoped figure for free, without a separate branch to
 * keep in sync with the real one.
 */
export default function Progress() {
  const router = useRouter();
  const { courseId } = useLocalSearchParams<{ courseId?: string }>();
  const courses = useCourses();
  const decks = useDecks();
  const sessions = useSessions();
  const progress = useProgress();
  const coursesHydrated = useCoursesHydrated();
  const decksHydrated = useDecksHydrated();
  const sessionsHydrated = useSessionsHydrated();
  const progressHydrated = useProgressHydrated();
  const hydrated = coursesHydrated && decksHydrated && sessionsHydrated && progressHydrated;
  const showSkeleton = useDelayedSkeleton(hydrated);

  const course = courseId ? courses.find((c) => c.id === courseId) : undefined;
  const cardCount = useMemo(
    () => (courseId ? courseStats(decks, courseId).cardCount : 0),
    [courseId, decks],
  );

  const today = useMemo(
    () => dailyStats(sessionsForCourse(sessions, courseId ?? "")),
    [sessions, courseId],
  );
  const allTime = useMemo(() => summariseSessions(sessions, courseId ?? ""), [sessions, courseId]);
  const week = useMemo(() => lastSevenDays(sessionsForCourse(sessions, courseId ?? "")), [sessions, courseId]);
  const studiedToday = today.cardsStudied > 0;

  // Deliberately global, not scoped to this course: a streak is about
  // whether the player showed up today at all, not which subject they
  // happened to open, so it reads the same on every course's progress page.
  const streak = studyStreakDays(sessions);

  const dueCount = useMemo(() => {
    if (!courseId) return 0;
    const deckIds = new Set(decks.filter((deck) => deck.courseId === courseId).map((deck) => deck.id));
    const now = Date.now();
    return progress.filter((record) => deckIds.has(record.deckId) && record.dueDate <= now).length;
  }, [progress, decks, courseId]);

  return (
    <PageScaffold title="PROGRESS" subtitle={course?.title}>
      {showSkeleton ? (
        <ProgressSkeleton />
      ) : !course ? (
        <PageEmpty title="COURSE NOT FOUND" message="RETURN HOME TO CHOOSE A COURSE." />
      ) : cardCount === 0 && !course.seeded ? (
        <PageEmpty
          title="NO CARDS YET"
          message="UPLOAD MATERIAL TO BUILD YOUR FIRST RECAP."
          actionLabel="UPLOAD MATERIAL"
          actionIcon="plus"
          onAction={() => router.replace({ pathname: "/upload", params: { courseId: course.id } })}
        />
      ) : allTime.sessionCount === 0 ? (
        <PageEmpty
          title={course.seeded ? "TRY THE DEMO" : "READY FOR YOUR FIRST RECAP"}
          message={course.seeded ? "QUICK RECAP STARTS THE SAMPLE DECK." : "QUICK RECAP WILL START YOUR STUDY HISTORY."}
          actionLabel="QUICK RECAP"
          actionIcon="play"
          onAction={() => router.replace({ pathname: "/recap", params: { courseId: course.id } })}
        />
      ) : (
        <>
          <ScoreHero
            score={today.score}
            accuracy={studiedToday ? today.accuracy : allTime.accuracy}
            accuracyLabel={studiedToday ? "ACCURACY" : "ALL TIME"}
            stats={[
              { label: "CARDS", value: String(today.cardsStudied) },
              { label: "TIME", value: formatDuration(today.studyMillis) },
              { label: "BEST RUN", value: String(today.bestStreak) },
            ]}
          />

          <View style={styles.tileRow}>
            <StatTile icon="flame" value={streak} label="DAY STREAK" accent />
            <StatTile icon="refresh" value={dueCount} label="CARDS DUE" accent={dueCount > 0} />
          </View>

          <ListGroup>
            <ListActionRow
              icon="play"
              label="QUICK RECAP"
              detail={dueCount > 0 ? `${dueCount} card${dueCount === 1 ? "" : "s"} waiting for review` : "Keep the streak going"}
              onPress={() => router.replace({ pathname: "/recap", params: { courseId: course.id } })}
            />
          </ListGroup>

          <Text style={styles.sectionTitle}>THIS WEEK</Text>
          <WeekChart days={week} />

          <Text style={styles.sectionTitle}>ALL TIME</Text>
          <View style={styles.tileRow}>
            <StatTile icon="list" value={allTime.sessionCount} label="SESSIONS" />
            <StatTile icon="sparkle" value={allTime.bestStreak} label="BEST RUN" />
          </View>
          <View style={styles.tileRow}>
            <StatTile icon="check" value={allTime.totalCorrect} label="CORRECT" />
            <StatTile icon="close" value={allTime.totalWrong} label="WRONG" />
          </View>
          <Text style={styles.footnote}>
            {`${Math.round(allTime.accuracy * 100)}% accuracy overall`}
            {allTime.lastStudiedAt ? ` · last studied ${new Date(allTime.lastStudiedAt).toLocaleDateString()}` : ""}
            {". Your streak counts every course."}
          </Text>
        </>
      )}
    </PageScaffold>
  );
}

function ProgressSkeleton() {
  return (
    <View style={styles.skeleton}>
      <SkeletonBlock style={styles.groupSkeleton} />
      <SkeletonBlock style={styles.groupSkeleton} />
    </View>
  );
}

const styles = StyleSheet.create({
  tileRow: { flexDirection: "row", gap: Spacing.sm, marginTop: Spacing.sm },
  sectionTitle: {
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
    marginLeft: Spacing.xs,
    fontFamily: Fonts.bodyBold,
    fontSize: 12,
    letterSpacing: 2,
    color: Theme.textMuted,
  },
  footnote: {
    marginTop: Spacing.sm,
    marginHorizontal: Spacing.xs,
    fontFamily: Fonts.body,
    fontSize: 13,
    lineHeight: 18,
    color: Theme.textMuted,
  },
  skeleton: { marginTop: Spacing.lg, gap: Spacing.lg },
  groupSkeleton: { height: 280 },
});
