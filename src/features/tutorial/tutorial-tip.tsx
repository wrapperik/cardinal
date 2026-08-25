import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text } from "react-native";
import { useLocalSearchParams } from "expo-router";

import { SwipeAction } from "@/components/swipe-action";
import { Fonts, Radius, Spacing, Theme } from "@/constants/theme";
import { isTutorialCourse, tutorialTipFor } from "@/features/tutorial/tutorial";
import type { GameType } from "@/types/cardinal";

/** One instruction card per game leg, shown only while playing Learn the Games. */
export function TutorialTip({ gameType }: { gameType: GameType }) {
  const { courseId } = useLocalSearchParams<{ courseId?: string }>();
  const tutorial = isTutorialCourse(courseId);
  const [visible, setVisible] = useState(tutorial);
  const tip = tutorialTipFor(gameType);

  useEffect(() => setVisible(tutorial), [tutorial]);

  if (!tutorial) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
      <Pressable style={styles.backdrop} onPress={() => setVisible(false)} accessibilityRole="button" accessibilityLabel="DISMISS TIP">
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.eyebrow}>HOW IT WORKS</Text>
          <Text style={styles.title}>{tip.title}</Text>
          <Text style={styles.body}>{tip.body}</Text>
          <SwipeAction label="GOT IT" hint="SWIPE RIGHT" tone="accent" onConfirm={() => setVisible(false)} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "center",
    padding: Spacing.lg,
    backgroundColor: "rgba(0,0,0,0.65)",
  },
  card: {
    borderRadius: Radius.card,
    backgroundColor: Theme.background,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  eyebrow: {
    color: Theme.textMuted,
    fontFamily: Fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 1.2,
  },
  title: {
    color: Theme.text,
    fontFamily: Fonts.display,
    fontSize: 30,
    letterSpacing: 1.5,
  },
  body: {
    color: Theme.text,
    fontFamily: Fonts.body,
    fontSize: 17,
    lineHeight: 24,
  },
});
