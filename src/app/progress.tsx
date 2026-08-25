import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BackButton } from "@/components/back-button";
import { HOLD_BUTTON_SIZE } from "@/components/hold-button";
import { Fonts, Spacing, Theme } from "@/constants/theme";
import { useProgress } from "@/features/progress/progress";
import { dailyStats, formatDuration, studyStreakDays } from "@/features/score/score";
import { summariseSessions } from "@/features/sessions/session-rules";
import { sessionsForCourse, useSessions } from "@/features/sessions/sessions";
import { useCourses } from "@/features/upload/courses";
import { useDecks } from "@/features/upload/decks";

const CONTENT_TOP_CLEARANCE = HOLD_BUTTON_SIZE + Spacing.lg;

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
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { courseId } = useLocalSearchParams<{ courseId?: string }>();
  const courses = useCourses();
  const decks = useDecks();
  const sessions = useSessions();
  const progress = useProgress();

  const course = courseId ? courses.find((c) => c.id === courseId) : undefined;

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
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + CONTENT_TOP_CLEARANCE,
          paddingHorizontal: Spacing.lg,
          // Clears the home indicator, so the last stat row is never sitting
          // in the strip iOS reserves for its own swipe.
          paddingBottom: insets.bottom + Spacing.xl,
        }}
      >
        <Text style={styles.heading}>{course?.title ?? "—"}</Text>
        <Text style={styles.sectionLabel}>PROGRESS</Text>

        <Text style={styles.groupLabel}>TODAY</Text>
        <StatRow label="SCORE" value={String(today.score)} />
        <StatRow label="CARDS STUDIED" value={String(today.cardsStudied)} />
        <StatRow label="TIME STUDIED" value={formatDuration(today.studyMillis)} />
        <StatRow label="ACCURACY" value={pct(today.accuracy)} />
        <StatRow label="BEST STREAK" value={String(today.bestStreak)} />

        <Text style={styles.groupLabel}>ALL TIME</Text>
        <StatRow label="SESSIONS" value={String(allTime.sessionCount)} />
        <StatRow label="CORRECT" value={String(allTime.totalCorrect)} />
        <StatRow label="WRONG" value={String(allTime.totalWrong)} />
        <StatRow label="ACCURACY" value={pct(allTime.accuracy)} />
        <StatRow label="BEST STREAK" value={String(allTime.bestStreak)} />
        <StatRow
          label="LAST STUDIED"
          value={allTime.lastStudiedAt ? new Date(allTime.lastStudiedAt).toLocaleDateString() : "—"}
        />

        <Text style={styles.groupLabel}>OVERALL</Text>
        <StatRow label="STUDY STREAK" value={`${streak} DAY${streak === 1 ? "" : "S"}`} />
        <StatRow label="CARDS DUE" value={String(dueCount)} />
      </ScrollView>

      {/* Sibling of the ScrollView, not inside it — riding inside would
          scroll the back button away with the content instead of leaving it
          pinned, exactly as course/[id].tsx documents for its own. */}
      <BackButton label="BACK" onBack={() => router.back()} />
    </View>
  );
}

/** A static label/value line, in the shape settings.tsx's InfoRow already
 *  established for this app — kept local rather than promoted to a shared
 *  component, since nothing outside this screen needs it yet. */
function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text numberOfLines={1} ellipsizeMode="middle" style={styles.statValue}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.background,
  },
  heading: {
    fontFamily: Fonts.display,
    color: Theme.text,
    letterSpacing: 2,
    fontSize: 40,
  },
  sectionLabel: {
    fontFamily: Fonts.bodyBold,
    fontSize: 12,
    letterSpacing: 2,
    color: Theme.textMuted,
    marginTop: Spacing.sm,
  },
  groupLabel: {
    fontFamily: Fonts.bodyBold,
    fontSize: 12,
    letterSpacing: 2,
    color: Theme.textMuted,
    marginTop: Spacing.xl,
    marginBottom: Spacing.sm,
  },
  statRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.glassEdge,
  },
  statLabel: {
    fontFamily: Fonts.body,
    fontSize: 15,
    color: Theme.text,
  },
  statValue: {
    flex: 1,
    marginLeft: Spacing.lg,
    textAlign: "right",
    fontFamily: Fonts.bodyBold,
    fontSize: 15,
    color: Theme.textMuted,
  },
});
