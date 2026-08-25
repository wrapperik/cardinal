import { useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SkeletonBlock } from "@/components/skeleton-block";
import { Colors, Fonts, Radius, Spacing, Theme } from "@/constants/theme";
import { HomeNavBar } from "@/features/home/nav-bar";
import { MenuRow } from "@/features/home/menu-row";
import { PillNav } from "@/features/home/pill-nav";
import { ScoreCard } from "@/features/home/score-card";
import { dailyStats, estimateRecapMinutes, EMPTY_DAILY } from "@/features/score/score";
import { sessionsForCourse, useSessions, useSessionsHydrated } from "@/features/sessions/sessions";
import { courseStats } from "@/features/upload/course-stats";
import { useCourses, useCoursesHydrated } from "@/features/upload/courses";
import { useDecks, useDecksHydrated } from "@/features/upload/decks";
import { useDelayedSkeleton } from "@/lib/loading";

/**
 * Home: a rust header (wordmark, the two hold-to-activate icons, the course
 * pills) over a charcoal body (the day's score, then the four-row menu). The
 * pills are the only navigation on the screen — whichever course they have
 * selected drives every badge and every destination below, so there is
 * exactly one source of "which course" for the whole screen to read from.
 */
export default function Home() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const courses = useCourses();
  const decks = useDecks();
  const sessions = useSessions();
  const coursesHydrated = useCoursesHydrated();
  const decksHydrated = useDecksHydrated();
  const sessionsHydrated = useSessionsHydrated();
  const hydrated = coursesHydrated && decksHydrated && sessionsHydrated;
  const showSkeleton = useDelayedSkeleton(hydrated);

  const [activeId, setActiveId] = useState<string | null>(null);
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

  // Memoised for the same reason as the two above, not because it is
  // expensive: dailyStats walks the whole session history, and it has no
  // business rerunning on a render caused by a pill moving.
  const todayScore = useMemo(() => dailyStats(sessions).score, [sessions]);

  // PillNav keeps this in a useCallback dependency array of its own — an
  // inline arrow here would rebuild its scroll handler on every render this
  // screen produces, not just on an actual selection change.
  const handleChange = useCallback((id: string) => setActiveId(id), []);
  const onUpload = useCallback(() => router.push("/upload"), [router]);
  const onSettings = useCallback(() => router.push("/settings"), [router]);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <HomeNavBar onUpload={onUpload} onSettings={onSettings} />
        {showSkeleton ? <PillSkeleton /> : <PillNav items={courses} activeId={active?.id ?? null} onChange={handleChange} />}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + Spacing.xl }]}
      >
        {/* The app's whole-day total, not the active course's — the label
            says DAILY SCORE, not "this course today", so it must read the
            same regardless of which pill is selected.

            Inset tighter than the rows below it, deliberately: the card is a
            single object and reads better close to the edges, while the rows
            want their separators running the full width of the screen with
            only their contents inset. */}
        {showSkeleton ? <HomeSkeleton /> : <View style={styles.cardWrap}><ScoreCard label="DAILY SCORE" value={String(todayScore)} /></View>}

        {!showSkeleton && active ? (
          <View>
            <MenuRow
              label="QUICK RECAP"
              // SAMPLE courses ship with no stored cards, so a cardCount of
              // zero means "plays its shipped fixtures" rather than "empty"
              // — see gameHref's fallback in topics.ts. 0MIN would read as
              // broken for a course that plays fine; DEMO reads as intended.
              badge={stats.cardCount === 0 ? "DEMO" : `${estimateRecapMinutes(stats.cardCount)}MIN`}
              onPress={() => router.push({ pathname: "/recap", params: { courseId: active.id } })}
            />
            <MenuRow
              label="TOPICS"
              badge={stats.topics.length > 0 ? String(stats.topics.length) : null}
              onPress={() => router.push({ pathname: "/course/[id]", params: { id: active.id } })}
            />
            <MenuRow
              label="VIEW PROGRESS"
              badge={courseDaily.score > 0 ? `+${courseDaily.score}` : "0"}
              onPress={() => router.push({ pathname: "/progress", params: { courseId: active.id } })}
            />
            <MenuRow
              label="COURSE SETTINGS"
              badge={null}
              onPress={() => router.push({ pathname: "/course-settings", params: { courseId: active.id } })}
              last
            />
          </View>
        ) : !showSkeleton ? (
          // Unreachable in practice — the seeded courses mean courses.length
          // is never 0 — but the row stack must not render broken if that
          // ever changes.
          <Text style={styles.empty}>HOLD THE PLUS TO ADD YOUR FIRST COURSE</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

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
      <View style={styles.cardWrap}>
        <SkeletonBlock style={styles.scoreSkeleton} />
      </View>
      <View style={styles.rowSkeletons}>
        {[0, 1, 2, 3].map((index) => <SkeletonBlock key={index} style={styles.rowSkeleton} />)}
      </View>
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
    paddingBottom: Spacing.lg,
    gap: Spacing.lg,
  },
  // No horizontal padding of its own: the menu rows have to reach both screen
  // edges so their separators read as full-bleed rules rather than as a
  // floating stack. Each child insets whatever it actually needs inset.
  body: {
    paddingTop: Spacing.lg,
    gap: Spacing.lg,
  },
  cardWrap: {
    paddingHorizontal: Spacing.sm,
  },
  pillSkeleton: {
    flexDirection: "row",
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  pillShort: { width: 108, height: 48, borderRadius: Radius.pill },
  pillLong: { width: 148, height: 48, borderRadius: Radius.pill },
  scoreSkeleton: { height: 96 },
  rowSkeletons: { marginTop: Spacing.lg },
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
