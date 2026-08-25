import { StyleSheet, Text, View } from 'react-native';

import { Colors, Fonts, Radius, Spacing, Theme } from '@/constants/theme';

interface ScoreCardProps {
  label: string;
  value: string;
}

/**
 * A dark panel pairing a label with a headline number. Both arrive as
 * pre-formatted strings on purpose: this card has no idea what a score is,
 * how it is computed, or what units it carries — that logic lives with
 * whoever calls it, so the same component can headline a streak, a
 * percentage, or a card count without a prop to switch its behaviour.
 */
export function ScoreCard({ label, value }: ScoreCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      {/* The value is the thing this card exists to show, so it always wins
          the row's space — shrinking to fit rather than wrapping or clipping
          when the label and a wide number both want the same 96pt height. */}
      <Text
        style={styles.value}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    height: 96,
    backgroundColor: Theme.surface,
    borderRadius: Radius.card,
    paddingHorizontal: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontFamily: Fonts.body,
    fontSize: 22,
    letterSpacing: 1,
    color: Colors.bone,
    // Yields to the value, which must never wrap or clip.
    flexShrink: 1,
  },
  value: {
    fontFamily: Fonts.display,
    fontSize: 44,
    letterSpacing: 2,
    color: Colors.bone,
  },
});
