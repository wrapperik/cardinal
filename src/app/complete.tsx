import { useRouter } from "expo-router";
import { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Fonts, Spacing, Theme } from "@/constants/theme";
import { useLastRun } from "@/features/recap/last-run";
import { dailyStats, formatDuration, studyStreakDays } from "@/features/score/score";
import { useSessions } from "@/features/sessions/sessions";
import { SwipeAction } from "@/features/upload/swipe-action";

/** Score, then each breakdown row this many ms after the last — a one-line
 *  change to gate behind reduced motion once that lands (see D1). */
const SCORE_DELAY_MS = 0;
const ROW_STAGGER_MS = 40;

/** 0–1 → a rounded whole-number percent, matching progress.tsx. */
function pct(accuracy: number): string {
  return `${Math.round(accuracy * 100)}%`;
}

/**
 * The terminal junction after a recap finishes, reached only via
 * router.replace from runner.ts's finishLeg — so the stack is [home,
 * complete] and DONE can safely pop back to the Home already sitting
 * underneath, exactly as finishLeg's old comment on that hazard described.
 *
 * No BackButton: this is a two-exit junction (STUDY AGAIN or DONE), and a
 * third way out would muddle which of the two the player actually meant.
 */
export default function Complete() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const run = useLastRun();
  const sessions = useSessions();

  // Memoised for the same reason home.tsx memoises its own: both walk the
  // entire session history, and neither has any business rerunning on a
  // render caused by a swipe control settling.
  const today = useMemo(() => dailyStats(sessions), [sessions]);
  const streak = useMemo(() => studyStreakDays(sessions), [sessions]);

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + Spacing.xl,
          paddingHorizontal: Spacing.lg,
          paddingBottom: insets.bottom + Spacing.xl,
        }}
      >
        {run === null ? (
          // A reload or deep link can land here after the store's already
          // been cleared — the run is already safely recorded in sessions,
          // just not in a shape this screen can render, so say so instead of
          // crashing or showing zeros.
          <>
            <Text style={styles.unavailable}>THIS SUMMARY IS NO LONGER AVAILABLE.</Text>
            <View style={styles.gap} />
            <SwipeAction
              label="DONE"
              hint="SWIPE RIGHT"
              onConfirm={() => (router.canGoBack() ? router.back() : router.replace("/home"))}
            />
          </>
        ) : (
          <>
            <Animated.View entering={FadeInDown.delay(SCORE_DELAY_MS).duration(280)}>
              <Text style={styles.label}>COURSE COMPLETE</Text>
              <Text style={styles.courseTitle}>{run.courseTitle}</Text>
              <Text
                style={styles.score}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
              >
                {run.score}
              </Text>
            </Animated.View>

            <StatRow label="CARDS" value={String(run.cardsAnswered)} delay={ROW_STAGGER_MS} />
            <StatRow label="ACCURACY" value={pct(run.accuracy)} delay={ROW_STAGGER_MS * 2} />
            <StatRow label="BEST STREAK" value={String(run.bestStreak)} delay={ROW_STAGGER_MS * 3} />
            <StatRow label="TIME" value={formatDuration(run.millis)} delay={ROW_STAGGER_MS * 4} />

            <Text style={styles.groupLabel}>TODAY</Text>
            <StatRow label="SCORE" value={String(today.score)} delay={ROW_STAGGER_MS * 5} />
            <StatRow
              label="STUDY STREAK"
              value={`${streak} DAY${streak === 1 ? "" : "S"}`}
              delay={ROW_STAGGER_MS * 6}
            />

            <View style={styles.gap} />
            <SwipeAction
              label="STUDY AGAIN"
              hint="SWIPE RIGHT"
              tone="accent"
              onConfirm={() =>
                router.replace({ pathname: "/recap", params: { courseId: run.courseId } })
              }
            />
            <View style={styles.gapSmall} />
            <SwipeAction
              label="DONE"
              hint="SWIPE RIGHT"
              onConfirm={() => (router.canGoBack() ? router.back() : router.replace("/home"))}
            />
          </>
        )}
      </ScrollView>
    </View>
  );
}

function StatRow({ label, value, delay }: { label: string; value: string; delay: number }) {
  return (
    <Animated.View entering={FadeInDown.delay(delay).duration(280)} style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text numberOfLines={1} ellipsizeMode="middle" style={styles.statValue}>
        {value}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.background,
  },
  unavailable: {
    fontFamily: Fonts.body,
    fontSize: 15,
    color: Theme.textMuted,
    marginTop: Spacing.xl,
  },
  label: {
    fontFamily: Fonts.bodyBold,
    fontSize: 12,
    letterSpacing: 2,
    color: Theme.textMuted,
  },
  courseTitle: {
    fontFamily: Fonts.bodyBold,
    fontSize: 15,
    color: Theme.text,
    marginTop: Spacing.xs,
  },
  score: {
    fontFamily: Fonts.display,
    fontSize: 72,
    color: Theme.text,
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
  gap: {
    height: Spacing.xl,
  },
  gapSmall: {
    height: Spacing.sm,
  },
});
