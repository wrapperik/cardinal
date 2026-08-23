import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";

import { Colors } from "@/constants/theme";
import { gameHref } from "@/features/home/topics";
import { runAt } from "@/features/recap/recap-rules";
import { beginRecap } from "@/features/recap/session";
import { courseById } from "@/features/upload/courses";
import { useDecks } from "@/features/upload/decks";

/**
 * Renders nothing meaningful — this route exists purely to decide where the
 * player is actually headed, then get out of the way. Reads courseId from
 * params, builds (or resumes) the recap for it, and replaces itself with the
 * first leg's game route.
 */
export default function Recap() {
  const router = useRouter();
  const { courseId } = useLocalSearchParams<{ courseId?: string }>();
  const decks = useDecks();

  useEffect(() => {
    if (!courseId) {
      router.replace("/home");
      return;
    }

    const state = beginRecap(decks, courseId);
    const run = state && runAt(state.plan, state.index);
    if (run) {
      router.replace(gameHref(run.gameType, courseId, true));
      return;
    }

    // beginRecap returns null when the course has nothing stored to recap —
    // every seeded/SAMPLE course today. This is the deliberate fallback that
    // keeps those courses playable on their shipped fixtures exactly as they
    // are now, not a failure path: without it, every course on a fresh
    // install would dead-end here instead of opening its demo deck.
    const course = courseById(courseId);
    router.replace(course ? gameHref(course.gameType, courseId) : "/home");
    // Deliberately once-at-mount: this screen redirects away immediately and
    // never has anything of its own to re-render for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <View style={styles.root} />;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    // Rust, matching the game screens' own root while they slide in — this
    // route never paints anything else, so there is nothing to flash white
    // behind while the redirect above resolves.
    backgroundColor: Colors.rust,
  },
});
