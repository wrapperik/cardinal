import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { SwipeAction } from "@/components/swipe-action";
import { Fonts, Radius, Spacing, Theme } from "@/constants/theme";
import { useTraditionalUx } from "@/features/preferences/preferences";

const BUTTON_SIZE = 28;

/**
 * A tap target even in legacy UX: a help affordance that itself demanded a
 * deliberate gesture would expect someone who doesn't know the app's grammar
 * yet to already know it just to ask what it is.
 *
 * Sits in the flow at the foot of home's menu rows rather than floating in
 * a corner, where it used to land on top of the last row's badge and fight
 * the course bar for the bottom edge.
 */
export function HelpButton() {
  const [visible, setVisible] = useState(false);
  const traditional = useTraditionalUx();

  return (
    <>
      <Pressable
        onPress={() => setVisible(true)}
        style={({ pressed }) => [styles.link, pressed && styles.linkPressed]}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="HELP"
        accessibilityHint="Explains how to use Cardinal"
      >
        <View style={styles.button}>
          <Text style={styles.glyph}>?</Text>
        </View>
        <Text style={styles.linkText}>HOW CARDINAL WORKS</Text>
      </Pressable>

      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <Pressable
          style={styles.backdrop}
          onPress={() => setVisible(false)}
          accessibilityRole="button"
          accessibilityLabel="CLOSE"
        >
          <Pressable style={styles.card} onPress={() => {}}>
            <Text style={styles.title}>HOW TO USE CARDINAL</Text>
            <Text style={styles.message}>
              {traditional
                ? "TAP THE PLUS ICON IN THE TOP NAV TO UPLOAD YOUR OWN MATERIAL AND STUDY IT HERE."
                : "HOLD THE PLUS ICON IN THE TOP NAV TO UPLOAD YOUR OWN MATERIAL AND STUDY IT HERE."}
            </Text>
            <Text style={styles.message}>
              {traditional
                ? "TAP BUTTONS AND ROWS TO USE THEM. THE GAMES STILL USE HOLDS AND SWIPES."
                : "NOTHING IN CARDINAL RESPONDS TO A TAP. EVERY ACTION IS A HOLD OR A SWIPE."}
            </Text>
            <SwipeAction label="GOT IT" icon="check" tone="calm" onConfirm={() => setVisible(false)} />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  link: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  linkPressed: { opacity: 0.6 },
  linkText: {
    fontFamily: Fonts.bodyBold,
    fontSize: 12,
    letterSpacing: 1.5,
    color: Theme.textMuted,
  },
  button: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: Radius.pill,
    backgroundColor: Theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.glassEdge,
    alignItems: "center",
    justifyContent: "center",
  },
  glyph: {
    fontFamily: Fonts.display,
    fontSize: 15,
    color: Theme.textMuted,
  },
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
  title: {
    fontFamily: Fonts.display,
    fontSize: 30,
    letterSpacing: 1.5,
    color: Theme.text,
  },
  message: {
    fontFamily: Fonts.body,
    fontSize: 15,
    lineHeight: 22,
    color: Theme.textMuted,
  },
});
