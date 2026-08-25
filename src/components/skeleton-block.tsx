import { StyleSheet, View, type ViewStyle } from "react-native";

import { Radius, Theme } from "@/constants/theme";

interface SkeletonBlockProps {
  style?: ViewStyle;
}

/** A quiet placeholder that preserves layout while local data hydrates. */
export function SkeletonBlock({ style }: SkeletonBlockProps) {
  return <View accessibilityElementsHidden style={[styles.block, style]} />;
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: Theme.surface,
    borderRadius: Radius.card,
  },
});
