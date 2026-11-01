import { useMemo } from "react";
import { StyleSheet, View } from "react-native";

import { ListActionRow, ListGroup, ListInfoRow } from "@/components/grouped-list";
import { PageEmpty, PageScaffold } from "@/components/page-scaffold";
import { SkeletonBlock } from "@/components/skeleton-block";
import { Spacing } from "@/constants/theme";
import { useAdminRoleHydrated, useIsAdmin } from "@/features/admin/role";
import { DashboardCard } from "@/features/admin/dashboard-card";
import { formatCount, formatGeneratedAt, formatPercent, formatRelativeTime } from "@/features/admin/dashboard-format";
import { useDashboard } from "@/features/admin/use-dashboard";
import { useDelayedSkeleton } from "@/lib/loading";

/**
 * The DASHBOARD destination, reached from the ADMIN row on settings.
 * Admin-only, so this screen is one of the few in the app that can fail to
 * load through no fault of the network — the caller behind it is allowed to
 * refuse.
 */
export default function Dashboard() {
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

  const subtitle = snapshot && status !== "error" ? formatGeneratedAt(snapshot.generatedAt, now) : undefined;

  return (
    // BACK on the left, matching settings — the screen it opens from — so
    // leaving either sits in the same spot.
    <PageScaffold title="DASHBOARD" subtitle={subtitle} backSide="left">
      {roleHydrated && !isAdmin ? (
        // Defence in depth, not the real gate: the callable behind
        // useDashboard already refuses a non-admin caller server-side.
        // This exists purely so a stale route or a demoted account lands
        // on an honest screen instead of a spinner waiting on a request
        // that was always going to fail.
        <PageEmpty title="NOT AUTHORISED" message="THIS AREA IS FOR ADMIN ACCOUNTS." />
      ) : showSkeleton ? (
        <DashboardSkeleton />
      ) : status === "error" ? (
        <PageEmpty
          title="DASHBOARD UNAVAILABLE"
          message={error ?? "COULDN'T LOAD THE DASHBOARD. TRY AGAIN."}
          actionLabel="TRY AGAIN"
          actionIcon="refresh"
          onAction={refresh}
        />
      ) : snapshot ? (
        <>
          <View style={styles.overview}>
            <DashboardCard
              items={[
                { label: "USERS", value: formatCount(snapshot.users.total) },
                { label: "SESSIONS", value: formatCount(snapshot.study.sessions) },
                { label: "ACCURACY", value: formatPercent(snapshot.study.accuracy) },
              ]}
            />
          </View>

          {/* First among the groups — an alert is the thing an admin opened
              this screen to find, so it shouldn't wait behind five groups of
              otherwise-healthy counts. Critical ones read in rust so
              severity shows before the words are read. */}
          <ListGroup
            title="ALERTS"
            iconless
            footer={snapshot.truncated ? "Figures are capped at the first records read." : undefined}
          >
            {snapshot.alerts.length === 0 ? (
              <ListInfoRow label="NOTHING NEEDS ATTENTION" />
            ) : (
              snapshot.alerts.map((alert) => (
                <ListInfoRow
                  key={alert.id}
                  label={alert.label}
                  detail={alert.detail}
                  value={formatCount(alert.count)}
                  destructive={alert.severity === "critical"}
                />
              ))
            )}
          </ListGroup>

          <ListGroup title="PEOPLE" iconless>
            <ListInfoRow label="TOTAL USERS" value={formatCount(snapshot.users.total)} />
            <ListInfoRow label="NEW (7D)" value={formatCount(snapshot.users.newLast7Days)} />
            <ListInfoRow label="NEW (30D)" value={formatCount(snapshot.users.newLast30Days)} />
            <ListInfoRow label="ACTIVE (7D)" value={formatCount(snapshot.users.activeLast7Days)} />
            <ListInfoRow label="ADMINS" value={formatCount(snapshot.users.admins)} />
            <ListInfoRow label="LONGEST STREAK" value={formatCount(snapshot.users.longestStreak)} />
          </ListGroup>

          <ListGroup title="CONTENT" iconless>
            <ListInfoRow label="COURSES" value={formatCount(snapshot.content.courses)} />
            <ListInfoRow label="DECKS" value={formatCount(snapshot.content.decks)} />
            <ListInfoRow label="CARDS" value={formatCount(snapshot.content.cards)} />
            <ListInfoRow label="UPLOADS" value={formatCount(snapshot.content.uploads)} />
          </ListGroup>

          <ListGroup title="STUDY" iconless>
            <ListInfoRow label="SESSIONS" value={formatCount(snapshot.study.sessions)} />
            <ListInfoRow label="CARDS STUDIED" value={formatCount(snapshot.study.cardsStudied)} />
            <ListInfoRow label="CORRECT" value={formatCount(snapshot.study.correct)} />
            <ListInfoRow label="WRONG" value={formatCount(snapshot.study.wrong)} />
            <ListInfoRow label="ACCURACY" value={formatPercent(snapshot.study.accuracy)} />
            <ListInfoRow label="DUE TODAY" value={formatCount(snapshot.study.cardsDueToday)} />
          </ListGroup>

          <ListGroup title="UPLOADS" iconless>
            <ListInfoRow label="PROCESSING" value={formatCount(snapshot.uploads.processing)} />
            <ListInfoRow label="DONE" value={formatCount(snapshot.uploads.done)} />
            <ListInfoRow label="FAILED" value={formatCount(snapshot.uploads.failed)} />
            <ListInfoRow label="FAILURE RATE" value={formatPercent(snapshot.uploads.failureRate)} />
            <ListInfoRow label="STUCK" value={formatCount(snapshot.uploads.stuck)} />
          </ListGroup>

          <ListGroup title="RECENT ACTIVITY" iconless>
            {snapshot.activity.length === 0 ? (
              <ListInfoRow label="NO RECENT ACTIVITY" />
            ) : (
              snapshot.activity.map((item) => (
                <ListInfoRow key={item.id} label={item.label} value={formatRelativeTime(item.at, now)} />
              ))
            )}
          </ListGroup>

          <ListGroup>
            <ListActionRow icon="refresh" label="REFRESH" onPress={refresh} />
          </ListGroup>
        </>
      ) : null}
    </PageScaffold>
  );
}

function DashboardSkeleton() {
  return (
    <View style={styles.skeleton}>
      <SkeletonBlock style={styles.cardSkeleton} />
      <SkeletonBlock style={styles.groupSkeleton} />
      <SkeletonBlock style={styles.groupSkeleton} />
    </View>
  );
}

const styles = StyleSheet.create({
  overview: { marginTop: Spacing.sm },
  skeleton: { marginTop: Spacing.sm, gap: Spacing.lg },
  cardSkeleton: { height: 128 },
  groupSkeleton: { height: 240 },
});
