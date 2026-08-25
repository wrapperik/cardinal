import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SwipeAction } from "@/components/swipe-action";
import { Fonts, Radius, Spacing, Theme } from "@/constants/theme";

const BUTTON_SIZE = 40;

/**
 * The one tap target in Cardinal. Every other control in the app fires on a
 * hold or a swipe — see HoldButton and SwipeAction's own doc comments — but
 * a help affordance that itself demanded a deliberate gesture would expect
 * someone who doesn't know the app's grammar yet to already know it just to
 * ask what it is. Floats over the whole screen in the bottom-right corner
 * rather than living in the nav row, so it never crowds the two hold icons
 * it explains.
 */
export function HelpButton() {
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);

  return (
    <>
      <Pressable
        onPress={() => setVisible(true)}
        style={[styles.button, { bottom: insets.bottom + Spacing.lg }]}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="HELP"
        accessibilityHint="Explains how to use Cardinal"
      >
        <Text style={styles.glyph}>?</Text>
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
              HOLD THE PLUS ICON IN THE TOP NAV TO UPLOAD YOUR OWN MATERIAL AND STUDY IT HERE.
            </Text>
            <Text style={styles.message}>
              NOTHING IN CARDINAL RESPONDS TO A TAP. EVERY ACTION IS A HOLD OR A SWIPE.
            </Text>
            <SwipeAction label="GOT IT" tone="calm" onConfirm={() => setVisible(false)} />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    position: "absolute",
    right: Spacing.lg,
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: Radius.pill,
    backgroundColor: Theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.glassEdge,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  glyph: {
    fontFamily: Fonts.display,
    fontSize: 20,
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
