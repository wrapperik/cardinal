import { StyleSheet, Text, View } from "react-native";

import { Colors, Fonts, Radius, Spacing } from "@/constants/theme";
import { homeSummaryValues, type HomeSummaryInput } from "@/features/home/home-summary";

/**
 * A single daily snapshot, so home presents one clear block instead of a
 * stack of competing cards. It lives inside home's rust header, as the
 * overview above the course picker, so it sits on a dark wash of that rust
 * rather than on the charcoal card surface used elsewhere.
 */
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
    minHeight: 112,
    flexDirection: "row",
    alignItems: "stretch",
    paddingVertical: Spacing.md,
    backgroundColor: "rgba(0, 0, 0, 0.16)",
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
    backgroundColor: "rgba(217, 217, 217, 0.28)",
  },
  stat: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xs,
  },
  value: {
    color: Colors.bone,
    fontFamily: Fonts.display,
    fontSize: 31,
    lineHeight: 36,
    textAlign: "center",
  },
  label: {
    // Full bone: any dimming on the darkened rust drops below 4.5:1. The
    // labels stay quieter than the values through size and weight instead.
    color: Colors.bone,
    fontFamily: Fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 0.7,
    lineHeight: 13,
    textAlign: "center",
  },
});
