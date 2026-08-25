import { Pressable, StyleSheet, Text, View } from "react-native";

import { Colors, Fonts, Radius, Spacing, Theme } from "@/constants/theme";
import { selection } from "@/lib/haptics";

export interface ChoiceOption<T extends string> { value: T; label: string; meta?: string }

interface Props<T extends string> {
  options: ChoiceOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  suggestedValue?: T | null;
  layout?: "row" | "column";
}

/** Stable, discrete selection controls; each option owns its full 44pt target. */
export function ChoiceList<T extends string>({ options, value, onChange, suggestedValue = null, layout = "column" }: Props<T>) {
  return (
    <View style={[styles.list, layout === "row" && styles.rowList]}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => { selection(); onChange(option.value); }}
            style={({ pressed }) => [styles.option, layout === "row" && styles.rowOption, selected && styles.selected, pressed && styles.pressed]}
          >
            <Text numberOfLines={2} style={[styles.label, selected && styles.selectedLabel]}>{option.label}</Text>
            {(option.meta || suggestedValue === option.value) && (
              <Text style={[styles.meta, selected && styles.selectedLabel]}>{option.meta ?? "SUGGESTED"}</Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.sm },
  rowList: { flexDirection: "row", flexWrap: "wrap" },
  option: { minHeight: 48, borderRadius: Radius.card, backgroundColor: Theme.surface, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, justifyContent: "center" },
  rowOption: { flexGrow: 1, flexBasis: "30%", alignItems: "center" },
  selected: { backgroundColor: Colors.bone },
  pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
  label: { fontFamily: Fonts.bodyBold, fontSize: 13, letterSpacing: 0.5, color: Theme.text },
  selectedLabel: { color: Colors.rust },
  meta: { marginTop: 2, fontFamily: Fonts.bodyBold, fontSize: 9, letterSpacing: 1, color: Theme.textMuted },
});
