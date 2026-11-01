import { type ReactNode } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { Colors, Fonts, Spacing, Theme } from "@/constants/theme";

/**
 * An error line: a solid rust "!" badge carrying the colour, and the message
 * itself in ordinary white text. Rust lettering on charcoal is too dark to
 * read, so the alarm lives in the badge and the words stay legible.
 */
export function InlineError({
  children,
  centered = false,
  style,
}: {
  children: ReactNode;
  centered?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[styles.row, centered && styles.centered, style]}
      accessible
      accessibilityRole="alert"
    >
      <View style={styles.badge}>
        <Text style={styles.mark}>!</Text>
      </View>
      <Text style={[styles.text, centered && styles.textCentered]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: Spacing.sm },
  centered: { justifyContent: "center" },
  badge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    marginTop: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.rust,
  },
  mark: {
    fontFamily: Fonts.bodyBold,
    fontSize: 12,
    lineHeight: 14,
    color: Theme.onAccent,
  },
  text: {
    flexShrink: 1,
    fontFamily: Fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 19,
    color: Theme.text,
  },
  textCentered: { textAlign: "center" },
});
