import { useRouter } from "expo-router";
import { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Fonts, Radius, Spacing, Theme } from "@/constants/theme";
import { gameHref } from "@/features/home/topics";
import { runAt } from "@/features/recap/recap-rules";
import { endRecap, useActiveRecap } from "@/features/recap/session";
import { accuracyOf, formatDuration, scoreForTally } from "@/features/score/score";
import { useSessions } from "@/features/sessions/sessions";
import { SwipeAction } from "@/features/upload/swipe-action";

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/**
 * A deliberate junction after every ten cards. The recap remains active while
 * this is visible, so Continue can resume from its current index; Stop ends
 * the session while leaving the already-persisted checkpoint available.
 */
export default function Checkpoint() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const recap = useActiveRecap();
  const sessions = useSessions();
  const startedAt = useMemo(
    () => sessions.find((session) => session.id === recap?.sessionId)?.startedAt ?? Date.now(),
    [recap?.sessionId, sessions],
  );

  if (recap === null) {
    return (
      <View style={styles.container}>
        <View style={[styles.content, { paddingTop: insets.top + Spacing.xl, paddingBottom: insets.bottom + Spacing.xl }]}>
          <Text style={styles.unavailable}>THIS CHECKPOINT IS NO LONGER AVAILABLE.</Text>
          <View style={styles.gap} />
          <SwipeAction label="DONE" onConfirm={() => (router.canGoBack() ? router.back() : router.replace("/home"))} />
        </View>
      </View>
    );
  }

  const { index, plan, tally } = recap;
  const courseId = recap.courseId;
  const total = plan.cards.length;
  const progress = total === 0 ? 0 : index / total;
  const accuracy = accuracyOf(tally.correctCount, tally.wrongCount);
  const elapsed = Date.now() - startedAt;

  function continueRecap() {
    const run = runAt(plan, index);
    if (run) router.replace(gameHref(run.gameType, courseId, true));
  }

  function stopForNow() {
    endRecap();
    if (router.canGoBack()) router.back();
    else router.replace("/home");
  }

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.xl, paddingBottom: insets.bottom + Spacing.xl }]}
      >
        <Text style={styles.label}>CHECKPOINT</Text>
        <Text style={styles.position}>{index} OF {total}</Text>
        <Text style={styles.score}>{scoreForTally(tally)}</Text>
        <Text style={styles.scoreLabel}>POINTS SO FAR</Text>

        <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: total, now: index }}>
          <View style={[styles.fill, { width: `${progress * 100}%` }]} />
        </View>

        <StatRow label="ACCURACY" value={pct(accuracy)} />
        <StatRow label="BEST STREAK" value={String(tally.bestStreakInSession)} />
        <StatRow label="TIME" value={formatDuration(elapsed)} />

        <View style={styles.gap} />
        <SwipeAction label="CONTINUE" hint="SWIPE RIGHT" tone="accent" onConfirm={continueRecap} />
        <View style={styles.gapSmall} />
        <Text style={styles.stopHint}>STOPPING NOW SAVES YOUR PLACE FOR THIS DECK.</Text>
        <View style={styles.gapSmall} />
        <SwipeAction label="STOP FOR NOW" hint="SWIPE RIGHT" onConfirm={stopForNow} />
      </ScrollView>
    </View>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.background },
  content: { paddingHorizontal: Spacing.lg },
  unavailable: { fontFamily: Fonts.body, fontSize: 15, color: Theme.textMuted, marginTop: Spacing.xl },
  label: { fontFamily: Fonts.bodyBold, fontSize: 12, letterSpacing: 2, color: Theme.textMuted },
  position: { fontFamily: Fonts.bodyBold, fontSize: 15, color: Theme.text, marginTop: Spacing.xs },
  score: { fontFamily: Fonts.display, fontSize: 72, color: Theme.text, marginTop: Spacing.sm },
  scoreLabel: { fontFamily: Fonts.bodyBold, fontSize: 12, letterSpacing: 2, color: Theme.textMuted },
  track: { height: 8, borderRadius: Radius.pill, backgroundColor: Theme.surface, overflow: "hidden", marginTop: Spacing.xl, marginBottom: Spacing.md },
  fill: { height: "100%", borderRadius: Radius.pill, backgroundColor: Theme.accent },
  statRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: Spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Theme.glassEdge },
  statLabel: { fontFamily: Fonts.body, fontSize: 15, color: Theme.text },
  statValue: { fontFamily: Fonts.bodyBold, fontSize: 15, color: Theme.textMuted },
  stopHint: { fontFamily: Fonts.body, fontSize: 13, color: Theme.textMuted },
  gap: { height: Spacing.xl },
  gapSmall: { height: Spacing.sm },
});
