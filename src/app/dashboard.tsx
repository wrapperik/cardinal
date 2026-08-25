import { useRouter } from "expo-router";
import { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BackButton } from "@/components/back-button";
import { HOLD_BUTTON_SIZE } from "@/components/hold-button";
import { SkeletonBlock } from "@/components/skeleton-block";
import { Fonts, Spacing, Theme } from "@/constants/theme";
import { useAdminRoleHydrated, useIsAdmin } from "@/features/admin/role";
import type { DashboardActivity, DashboardAlert } from "@/features/admin/dashboard";
import { DashboardCard } from "@/features/admin/dashboard-card";
import { formatCount, formatGeneratedAt, formatPercent, formatRelativeTime } from "@/features/admin/dashboard-format";
import { useDashboard } from "@/features/admin/use-dashboard";
import { SwipeAction } from "@/features/upload/swipe-action";
import { useDelayedSkeleton } from "@/lib/loading";

const CONTENT_TOP_CLEARANCE = HOLD_BUTTON_SIZE + Spacing.lg;

/**
 * The DASHBOARD destination, reached by holding the ADMIN row on settings.
 * Admin-only, so this screen is one of the few in the app that can fail to
 * load through no fault of the network — the caller behind it is allowed to
 * refuse.
 */
export default function Dashboard() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const roleHydrated = useAdminRoleHydrated();
  const isAdmin = useIsAdmin();
  const { snapshot, status, error, refresh } = useDashboard();
  // useDelayedSkeleton takes a "hydrated" boolean, matching progress.tsx's
  // shape, so "ready" and "error" both count as settled and only "loading"
  // starts the delay clock.
  const showSkeleton = useDelayedSkeleton(status !== "loading");

  // A single instant for the whole render pass rather than each row calling
  // Date.now() independently — keyed on the snapshot so a fresh fetch reads
  // its own "now" once refresh lands, instead of every row on screen slowly
  // drifting out of sync with each other as the clock ticks between them.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- snapshot is the recompute trigger, not a value the callback reads.
  const now = useMemo(() => Date.now(), [snapshot]);

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + CONTENT_TOP_CLEARANCE,
          paddingHorizontal: Spacing.lg,
          // Clears the home indicator, so the last row is never sitting in
          // the strip iOS reserves for its own swipe.
          paddingBottom: insets.bottom + Spacing.xl,
        }}
      >
        {roleHydrated && !isAdmin ? (
          // Defence in depth, not the real gate: the callable behind
          // useDashboard already refuses a non-admin caller server-side.
          // This exists purely so a stale route or a demoted account lands
          // on an honest screen instead of a spinner waiting on a request
          // that was always going to fail.
          <DashboardEmpty
            title="NOT AUTHORISED"
            message="THIS AREA IS FOR ADMIN ACCOUNTS."
          />
        ) : showSkeleton ? (
          <DashboardSkeleton />
        ) : status === "error" ? (
          <DashboardEmpty
            title="DASHBOARD UNAVAILABLE"
            message={error ?? "COULDN'T LOAD THE DASHBOARD. TRY AGAIN."}
            actionLabel="TRY AGAIN"
            onAction={refresh}
          />
        ) : snapshot ? (
          <>
            <Text style={styles.heading}>DASHBOARD</Text>
            <Text style={styles.sectionLabel}>OVERVIEW</Text>
            <Text style={styles.generatedAt}>{formatGeneratedAt(snapshot.generatedAt, now)}</Text>
            {snapshot.truncated && (
              <Text style={styles.truncatedNote}>
                FIGURES ARE CAPPED AT THE FIRST RECORDS READ.
              </Text>
            )}

            <View style={styles.card}>
              <DashboardCard
                items={[
                  { label: "USERS", value: formatCount(snapshot.users.total) },
                  { label: "SESSIONS", value: formatCount(snapshot.study.sessions) },
                  { label: "ACCURACY", value: formatPercent(snapshot.study.accuracy) },
                ]}
              />
            </View>

            {/* Rendered first among the groups, ahead of even OVERVIEW's own
                heading rhythm — an alert is the thing an admin opened this
                screen to find, so it shouldn't wait behind five screens of
                otherwise-healthy counts. */}
            <Text style={styles.groupLabel}>ALERTS</Text>
            {snapshot.alerts.length === 0 ? (
              <Text style={styles.emptyGroupCopy}>NOTHING NEEDS ATTENTION.</Text>
            ) : (
              snapshot.alerts.map((alert) => <AlertRow key={alert.id} alert={alert} />)
            )}

            <Text style={styles.groupLabel}>PEOPLE</Text>
            <StatRow label="TOTAL USERS" value={formatCount(snapshot.users.total)} />
            <StatRow label="NEW (7D)" value={formatCount(snapshot.users.newLast7Days)} />
            <StatRow label="NEW (30D)" value={formatCount(snapshot.users.newLast30Days)} />
            <StatRow label="ACTIVE (7D)" value={formatCount(snapshot.users.activeLast7Days)} />
            <StatRow label="ADMINS" value={formatCount(snapshot.users.admins)} />
            <StatRow label="LONGEST STREAK" value={formatCount(snapshot.users.longestStreak)} />

            <Text style={styles.groupLabel}>CONTENT</Text>
            <StatRow label="COURSES" value={formatCount(snapshot.content.courses)} />
            <StatRow label="DECKS" value={formatCount(snapshot.content.decks)} />
            <StatRow label="CARDS" value={formatCount(snapshot.content.cards)} />
            <StatRow label="UPLOADS" value={formatCount(snapshot.content.uploads)} />

            <Text style={styles.groupLabel}>STUDY</Text>
            <StatRow label="SESSIONS" value={formatCount(snapshot.study.sessions)} />
            <StatRow label="CARDS STUDIED" value={formatCount(snapshot.study.cardsStudied)} />
            <StatRow label="CORRECT" value={formatCount(snapshot.study.correct)} />
            <StatRow label="WRONG" value={formatCount(snapshot.study.wrong)} />
            <StatRow label="ACCURACY" value={formatPercent(snapshot.study.accuracy)} />
            <StatRow label="DUE TODAY" value={formatCount(snapshot.study.cardsDueToday)} />

            <Text style={styles.groupLabel}>UPLOADS</Text>
            <StatRow label="PROCESSING" value={formatCount(snapshot.uploads.processing)} />
            <StatRow label="DONE" value={formatCount(snapshot.uploads.done)} />
            <StatRow label="FAILED" value={formatCount(snapshot.uploads.failed)} />
            <StatRow label="FAILURE RATE" value={formatPercent(snapshot.uploads.failureRate)} />
            <StatRow label="STUCK" value={formatCount(snapshot.uploads.stuck)} />

            <Text style={styles.groupLabel}>RECENT ACTIVITY</Text>
            {snapshot.activity.length === 0 ? (
              <Text style={styles.emptyGroupCopy}>NO RECENT ACTIVITY.</Text>
            ) : (
              snapshot.activity.map((item) => <ActivityRow key={item.id} activity={item} now={now} />)
            )}

            <View style={styles.refresh}>
              <SwipeAction label="REFRESH" tone="accent" onConfirm={refresh} />
            </View>
          </>
        ) : null}
      </ScrollView>

      {/* Sibling of the ScrollView, not inside it — same reasoning
          progress.tsx documents for its own BackButton: riding inside would
          scroll the back button away with the content instead of leaving it
          pinned. */}
      <BackButton label="BACK" side="right" onBack={() => router.back()} />
    </View>
  );
}

/** A static label/value line, in the shape progress.tsx already established
 *  for this app — kept local rather than promoted to a shared component,
 *  matching progress.tsx's own StatRow, which makes the same call for the
 *  same reason: nothing outside either screen needs it yet. */
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

/** A critical alert reads in the same rust the rest of the app reserves for
 *  a wrong answer — an admin scanning this list should be able to tell
 *  severity from colour alone, without reading the word next to it. */
function AlertRow({ alert }: { alert: DashboardAlert }) {
  const critical = alert.severity === "critical";
  return (
    <View style={styles.statRow}>
      <View style={styles.alertText}>
        <Text style={[styles.statLabel, critical && styles.alertCritical]}>{alert.label}</Text>
        <Text style={styles.alertDetail}>{alert.detail}</Text>
      </View>
      <Text numberOfLines={1} style={[styles.statValue, critical && styles.alertCritical]}>
        {formatCount(alert.count)}
      </Text>
    </View>
  );
}

function ActivityRow({ activity, now }: { activity: DashboardActivity; now: number }) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{activity.label}</Text>
      <Text numberOfLines={1} style={styles.statValue}>{formatRelativeTime(activity.at, now)}</Text>
    </View>
  );
}

/** Mirrors progress.tsx's ProgressEmpty exactly — same optional
 *  actionLabel/onAction pair, so NOT AUTHORISED (no action) and the error
 *  state (a TRY AGAIN swipe) share one component the same way progress.tsx's
 *  COURSE NOT FOUND and NO CARDS YET states do. */
function DashboardEmpty({
  title,
  message,
  actionLabel,
  onAction,
}: {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.heading}>{title}</Text>
      <Text style={styles.emptyCopy}>{message}</Text>
      {actionLabel && onAction && <SwipeAction label={actionLabel} tone="accent" onConfirm={onAction} />}
    </View>
  );
}

function DashboardSkeleton() {
  return (
    <View style={styles.skeleton}>
      <SkeletonBlock style={styles.headingSkeleton} />
      <SkeletonBlock style={styles.labelSkeleton} />
      <SkeletonBlock style={styles.cardSkeleton} />
      {[0, 1, 2, 3, 4].map((index) => <SkeletonBlock key={index} style={styles.statSkeleton} />)}
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
  generatedAt: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: Theme.textMuted,
    marginTop: Spacing.xs,
  },
  truncatedNote: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: Theme.textMuted,
    marginTop: Spacing.xs,
  },
  card: {
    marginTop: Spacing.lg,
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
  alertText: {
    flex: 1,
  },
  alertDetail: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: Theme.textMuted,
    marginTop: Spacing.xs,
  },
  alertCritical: {
    color: Theme.incorrect,
  },
  emptyGroupCopy: {
    fontFamily: Fonts.body,
    fontSize: 14,
    color: Theme.textMuted,
    paddingVertical: Spacing.sm,
  },
  refresh: {
    marginTop: Spacing.xl,
  },
  emptyState: {
    gap: Spacing.lg,
  },
  emptyCopy: {
    fontFamily: Fonts.body,
    fontSize: 16,
    lineHeight: 22,
    color: Theme.textMuted,
  },
  skeleton: { gap: Spacing.md },
  headingSkeleton: { width: 220, height: 42 },
  labelSkeleton: { width: 100, height: 14, marginBottom: Spacing.lg },
  cardSkeleton: { height: 152 },
  statSkeleton: { height: 48 },
});
