import { useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { BlurView } from "expo-blur";
import { GlassView } from "expo-glass-effect";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SkeletonBlock } from "@/components/skeleton-block";
import { Colors, Fonts, Radius, Spacing, Theme } from "@/constants/theme";
import { HelpButton } from "@/features/home/help-button";
import { HomeNavBar } from "@/features/home/nav-bar";
import { MenuRow } from "@/features/home/menu-row";
import { HomeSummaryCard } from "@/features/home/home-summary-card";
import { PillNav } from "@/features/home/pill-nav";
import { dailyStats, estimateRecapMinutes, EMPTY_DAILY, studyStreakDays } from "@/features/score/score";
import { sessionsForCourse, useSessions, useSessionsHydrated } from "@/features/sessions/sessions";
import { courseStats } from "@/features/upload/course-stats";
import { useCourses, useCoursesHydrated } from "@/features/upload/courses";
import { useDecks, useDecksHydrated } from "@/features/upload/decks";
import { hideDrafts, useDraftIds } from "@/features/upload/drafts";
import { useTraditionalUx } from "@/features/preferences/preferences";
import { useDelayedSkeleton } from "@/lib/loading";
import { useLiquidGlass } from "@/lib/liquid-glass";

/**
 * Home: a rust header (wordmark, the two hold-to-activate icons, the course
 * pills) over a charcoal body (the daily snapshot, then the four-row menu). The
 * pills are the only navigation on the screen — whichever course they have
 * selected drives every badge and every destination below, so there is
 * exactly one source of "which course" for the whole screen to read from.
 */
export default function Home() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const traditional = useTraditionalUx();
  const liquidGlass = useLiquidGlass();

  // An upload writes its course and deck to Firestore before anyone confirms
  // it, and the sheet sits over this screen while that happens — so the pills
  // behind it would otherwise announce a course the user has not accepted and
  // may yet discard. The library only shows what an upload has finished with.
  const draftIds = useDraftIds();
  const allCourses = useCourses();
  const allDecks = useDecks();
  const courses = useMemo(() => hideDrafts(allCourses, draftIds), [allCourses, draftIds]);
  const decks = useMemo(() => hideDrafts(allDecks, draftIds), [allDecks, draftIds]);
  const sessions = useSessions();
  const coursesHydrated = useCoursesHydrated();
  const decksHydrated = useDecksHydrated();
  const sessionsHydrated = useSessionsHydrated();
  const hydrated = coursesHydrated && decksHydrated && sessionsHydrated;
  const showSkeleton = useDelayedSkeleton(hydrated);

  const [activeId, setActiveId] = useState<string | null>(null);
  // Measured rather than assumed, since the dock's height follows the pill
  // text and the device's bottom inset.
  const [dockHeight, setDockHeight] = useState(0);
  // Resolved with a fallback rather than synced via an effect: the screen
  // renders the right course on the very first frame, before any pill has
  // been touched, and can never point at a course that has since vanished
  // from the list — an effect syncing activeId would render one frame with
  // the stale id before catching up.
  const active = courses.find((course) => course.id === activeId) ?? courses[0];
  // Pulled out as its own binding so the memos below can depend on the id
  // itself rather than on the course object. The id is what actually
  // identifies "which course"; depending on the object would rebuild both
  // memos every time the store hands back a fresh array, even though the
  // selection has not moved. It also keeps the dependency arrays honest —
  // naming the value they really use means neither needs a lint suppression
  // to hide a dependency it deliberately omits.
  const activeCourseId = active?.id;

  // courseStats walks every deck a course owns, so it runs once here per
  // active-course change rather than once per row rendered below.
  const stats = useMemo(
    () =>
      activeCourseId
        ? courseStats(decks, activeCourseId)
        : { cardCount: 0, gameTypes: [], topics: [] },
    [decks, activeCourseId],
  );

  const courseDaily = useMemo(
    () =>
      activeCourseId ? dailyStats(sessionsForCourse(sessions, activeCourseId)) : EMPTY_DAILY,
    [sessions, activeCourseId],
  );

  // The summary is global rather than course-specific: it answers "how did I
  // do today?" independently of whichever course a person is browsing.
  const today = useMemo(() => dailyStats(sessions), [sessions]);
  const streak = useMemo(() => studyStreakDays(sessions), [sessions]);

  // PillNav keeps this in a useCallback dependency array of its own — an
  // inline arrow here would rebuild its scroll handler on every render this
  // screen produces, not just on an actual selection change.
  const handleChange = useCallback((id: string) => setActiveId(id), []);
  const onUpload = useCallback(() => router.push("/upload"), [router]);
  const onSettings = useCallback(() => router.push("/settings"), [router]);

  const dockContent = (
    <>
      <Text style={styles.dockLabel} accessibilityRole="header">COURSE</Text>
      <View style={styles.dockDivider} />
      <View style={styles.dockTrack}>
        {showSkeleton ? <PillSkeleton /> : <PillNav items={courses} activeId={active?.id ?? null} onChange={handleChange} />}
      </View>
    </>
  );

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <HomeNavBar onUpload={onUpload} onSettings={onSettings} />
        {/* Whole-app daily totals, deliberately independent of the selected
            course — so they sit up here as the overview, above the course
            picker, rather than among the rows that follow the selection. */}
        <View style={styles.cardWrap}>
          {showSkeleton ? (
            <SkeletonBlock style={styles.summarySkeleton} />
          ) : (
            <HomeSummaryCard
              streak={streak}
              cardsPlayed={today.cardsStudied}
              dailyScore={today.score}
            />
          )}
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.body, { paddingBottom: dockHeight + Spacing.xl }]}
      >
        {showSkeleton ? <HomeSkeleton /> : active ? (
          <View>
            <MenuRow
              label="QUICK RECAP"
              refreshKey={active.id}
              refreshDelay={3 * ROW_RIPPLE_MS}
              icon="play"
              // SAMPLE courses ship with no stored cards, so a cardCount of
              // zero means "plays its shipped fixtures" rather than "empty"
              // — see gameHref's fallback in topics.ts. 0MIN would read as
              // broken for a course that plays fine; DEMO reads as intended.
              badge={stats.cardCount === 0 ? "DEMO" : `${estimateRecapMinutes(stats.cardCount)}MIN`}
              onPress={() => router.push({ pathname: "/recap", params: { courseId: active.id } })}
            />
            <MenuRow
              label="TOPICS"
              refreshKey={active.id}
              refreshDelay={2 * ROW_RIPPLE_MS}
              icon="list"
              badge={stats.topics.length > 0 ? String(stats.topics.length) : null}
              onPress={() => router.push({ pathname: "/course/[id]", params: { id: active.id } })}
            />
            <MenuRow
              label="VIEW PROGRESS"
              refreshKey={active.id}
              refreshDelay={1 * ROW_RIPPLE_MS}
              icon="chart"
              badge={courseDaily.score > 0 ? `+${courseDaily.score}` : "0"}
              onPress={() => router.push({ pathname: "/progress", params: { courseId: active.id } })}
            />
            <MenuRow
              label="COURSE SETTINGS"
              refreshKey={active.id}
              refreshDelay={0 * ROW_RIPPLE_MS}
              icon="sliders"
              badge={null}
              onPress={() => router.push({ pathname: "/course-settings", params: { courseId: active.id } })}
              last
            />
          </View>
        ) : (
          // Unreachable in practice — the seeded courses mean courses.length
          // is never 0 — but the row stack must not render broken if that
          // ever changes.
          <Text style={styles.empty}>{traditional ? "TAP" : "HOLD"} THE PLUS TO ADD YOUR FIRST COURSE</Text>
        )}

        {!showSkeleton && <HelpButton />}
      </ScrollView>

      {/* A floating glass bar in thumb reach, like a tab bar, rather than a
          full-width slab: the rows stay visible behind it and it reads as a
          control, not a second screen. The fixed COURSE label names what the
          pills are without spending a row on a heading. Each switch ripples
          a shimmer up through the rows (see ROW_RIPPLE_MS), so it reads as
          driving them. */}
      <View
        style={[styles.dockWrap, { bottom: insets.bottom + Spacing.sm }]}
        onLayout={(event) => setDockHeight(event.nativeEvent.layout.height + insets.bottom + Spacing.sm)}
      >
        {/* Liquid Glass on iOS 26+ unless switched off in Settings; the
            frosted blur everywhere else, so older devices look as before. */}
        {liquidGlass ? (
          <GlassView
            glassEffectStyle="regular"
            colorScheme="dark"
            // Without a tint the glass picks up the bone rows behind it and
            // reads near-white; a charcoal tint keeps it a dark grey that
            // sits with the rest of the screen.
            tintColor={GLASS_TINT}
            style={styles.dock}
          >
            {dockContent}
          </GlassView>
        ) : (
          <BlurView intensity={30} tint="dark" style={[styles.dock, styles.dockFrosted]}>
            {dockContent}
          </BlurView>
        )}
      </View>
    </View>
  );
}

/** Charcoal, translucent enough that the glass still refracts what's behind it. */
const GLASS_TINT = "rgba(30, 30, 30, 0.72)";

/** Gap between each row's shimmer, starting from the row nearest the dock. */
const ROW_RIPPLE_MS = 70;

function PillSkeleton() {
  return (
    <View style={styles.pillSkeleton}>
      <SkeletonBlock style={styles.pillShort} />
      <SkeletonBlock style={styles.pillLong} />
    </View>
  );
}

function HomeSkeleton() {
  return (
    <View>
      {[0, 1, 2, 3].map((index) => <SkeletonBlock key={index} style={styles.rowSkeleton} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.background,
  },
  header: {
    backgroundColor: Colors.rust,
    borderBottomLeftRadius: Radius.header,
    borderBottomRightRadius: Radius.header,
    // Matches cardWrap's side inset, so the stats card sits in an even
    // frame of rust on three sides.
    paddingBottom: Spacing.sm,
    gap: Spacing.lg,
  },
  // No horizontal padding of its own: the menu rows have to reach both screen
  // edges so their separators read as full-bleed rules rather than as a
  // floating stack. Each child insets whatever it actually needs inset.
  body: {
    paddingTop: Spacing.lg,
    gap: Spacing.lg,
  },
  // Carries the shadow; the blur below has to clip to its radius, and a
  // clipping view can't cast one on iOS.
  dockWrap: {
    position: "absolute",
    left: Spacing.md,
    right: Spacing.md,
    borderRadius: Radius.pill,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  dock: {
    flexDirection: "row",
    alignItems: "center",
    height: 56,
    borderRadius: Radius.pill,
    // Required, or the blur ignores borderRadius and renders as a square.
    overflow: "hidden",
  },
  // Fallback only: Liquid Glass draws its own edge and tint, and a fill
  // under it would flatten the effect.
  dockFrosted: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.glassEdge,
    backgroundColor: "rgba(43, 43, 43, 0.82)",
  },
  dockLabel: {
    paddingLeft: Spacing.lg,
    paddingRight: Spacing.md,
    fontFamily: Fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 2,
    color: Theme.textMuted,
  },
  dockDivider: {
    width: StyleSheet.hairlineWidth,
    height: 24,
    backgroundColor: Theme.glassEdge,
  },
  dockTrack: { flex: 1 },
  cardWrap: {
    paddingHorizontal: Spacing.sm,
  },
  pillSkeleton: {
    flexDirection: "row",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  pillShort: { width: 96, height: 36, borderRadius: Radius.pill },
  pillLong: { width: 128, height: 36, borderRadius: Radius.pill },
  summarySkeleton: { height: 112, backgroundColor: "rgba(0, 0, 0, 0.16)" },
  rowSkeleton: {
    height: 92,
    borderRadius: 0,
    marginBottom: StyleSheet.hairlineWidth,
    backgroundColor: Theme.surface,
  },
  // Carries its own inset, since the body no longer pads its children.
  empty: {
    textAlign: "center",
    paddingHorizontal: Spacing.lg,
    fontFamily: Fonts.body,
    fontSize: 15,
    color: Theme.textMuted,
    marginTop: Spacing.xl,
  },
});
