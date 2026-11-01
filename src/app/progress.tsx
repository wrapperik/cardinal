import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";

import { ListGroup, ListInfoRow } from "@/components/grouped-list";
import { PageEmpty, PageScaffold } from "@/components/page-scaffold";
import { SkeletonBlock } from "@/components/skeleton-block";
import { Spacing } from "@/constants/theme";
import { useProgress, useProgressHydrated } from "@/features/progress/progress";
import { dailyStats, formatDuration, studyStreakDays } from "@/features/score/score";
import { summariseSessions } from "@/features/sessions/session-rules";
import { sessionsForCourse, useSessions, useSessionsHydrated } from "@/features/sessions/sessions";
import { courseStats } from "@/features/upload/course-stats";
import { useCourses, useCoursesHydrated } from "@/features/upload/courses";
import { useDecks, useDecksHydrated } from "@/features/upload/decks";
import { useDelayedSkeleton } from "@/lib/loading";

/** 0–1 → a rounded whole-number percent, matching every other accuracy figure in the app. */
function pct(accuracy: number): string {
  return `${Math.round(accuracy * 100)}%`;
}

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
          <ListGroup title="TODAY" iconless>
            <ListInfoRow label="SCORE" value={String(today.score)} />
            <ListInfoRow label="CARDS STUDIED" value={String(today.cardsStudied)} />
            <ListInfoRow label="TIME STUDIED" value={formatDuration(today.studyMillis)} />
            <ListInfoRow label="ACCURACY" value={pct(today.accuracy)} />
            <ListInfoRow label="BEST STREAK" value={String(today.bestStreak)} />
          </ListGroup>

          <ListGroup title="ALL TIME" iconless>
            <ListInfoRow label="SESSIONS" value={String(allTime.sessionCount)} />
            <ListInfoRow label="CORRECT" value={String(allTime.totalCorrect)} />
            <ListInfoRow label="WRONG" value={String(allTime.totalWrong)} />
            <ListInfoRow label="ACCURACY" value={pct(allTime.accuracy)} />
            <ListInfoRow label="BEST STREAK" value={String(allTime.bestStreak)} />
            <ListInfoRow
              label="LAST STUDIED"
              value={allTime.lastStudiedAt ? new Date(allTime.lastStudiedAt).toLocaleDateString() : "—"}
            />
          </ListGroup>

          <ListGroup title="OVERALL" iconless footer="Your study streak counts every course, not just this one.">
            <ListInfoRow label="STUDY STREAK" value={`${streak} DAY${streak === 1 ? "" : "S"}`} />
            <ListInfoRow label="CARDS DUE" value={String(dueCount)} />
          </ListGroup>
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
  skeleton: { marginTop: Spacing.lg, gap: Spacing.lg },
  groupSkeleton: { height: 280 },
});
