import { StyleSheet, Text, View } from "react-native";

import { Fonts, Radius, Spacing, Theme } from "@/constants/theme";
import { homeSummaryValues, type HomeSummaryInput } from "@/features/home/home-summary";

/** A single daily snapshot, so home presents one clear block instead of a stack of competing cards. */
export function HomeSummaryCard({ streak, cardsPlayed, dailyScore }: HomeSummaryInput) {
  const values = homeSummaryValues({ streak, cardsPlayed, dailyScore });

  return (
    <View
      style={styles.card}
      accessible
      accessibilityLabel={`${streak} day streak, ${cardsPlayed} cards played, ${dailyScore} daily score`}
    >
      {values.map((item, index) => (
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
