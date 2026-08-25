import { StyleSheet, Text, View } from "react-native";

import { Fonts, Radius, Spacing, Theme } from "@/constants/theme";

export interface DashboardCardItem {
  label: string;
  value: string;
}

/**
 * A sibling of HomeSummaryCard, not a reuse of it: that component is typed
 * to the fixed daily streak/cards/score triple and derives its own values
 * through homeSummaryValues, so its shape is home's alone. Generalising it
 * to take arbitrary items would mean rewriting home's summary — and the
 * type it exports — to serve a screen home has no reason to know exists.
 * Duplicating the small amount of layout here keeps that coupling out.
 */
export function DashboardCard({ items }: { items: DashboardCardItem[] }) {
  return (
    <View
      style={styles.card}
      accessible
      accessibilityLabel={items.map((item) => `${item.value} ${item.label}`).join(", ")}
    >
      {items.map((item, index) => (
        <View key={item.label} style={styles.statGroup}>
          {index > 0 ? <View style={styles.divider} /> : null}
          <View style={styles.stat}>
            <Text style={styles.value}>{item.value}</Text>
            <Text style={styles.label} numberOfLines={2}>{item.label}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 152,
    flexDirection: "row",
    alignItems: "stretch",
    paddingVertical: Spacing.lg,
    backgroundColor: Theme.surface,
    borderRadius: Radius.card,
  },
  statGroup: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    backgroundColor: Theme.hairline,
  },
  stat: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xs,
  },
  value: {
    color: Theme.text,
    fontFamily: Fonts.display,
    fontSize: 31,
    lineHeight: 36,
    textAlign: "center",
  },
  label: {
    color: Theme.textMuted,
    fontFamily: Fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 0.7,
    lineHeight: 13,
    textAlign: "center",
  },
});
