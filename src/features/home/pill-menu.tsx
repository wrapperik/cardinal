import { BlurView } from "expo-blur";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  withSpring,
  type SharedValue,
} from "react-native-reanimated";

import { Colors, Fonts, Spacing } from "@/constants/theme";
import { ITEM_STEP } from "@/features/home/pill-row";
import { MENU_ITEMS } from "@/features/home/topics";

/**
 * Full-screen overlay shown while a pill is held. The finger stays down on
 * the pill underneath, so this must never intercept touches — hence
 * pointerEvents="none" on the outermost view.
 */
export function PillMenu({
  title,
  selection,
}: {
  title: string;
  selection: SharedValue<number>;
}) {
  return (
    <View style={styles.overlay} pointerEvents="none">
      <BlurView style={StyleSheet.absoluteFill} intensity={40} tint="dark" />

      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>
        {MENU_ITEMS.map((label, index) => (
          <MenuRow
            key={label}
            label={label}
            index={index}
            selection={selection}
          />
        ))}
      </View>
    </View>
  );
}

function MenuRow({
  label,
  index,
  selection,
}: {
  label: string;
  index: number;
  selection: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    const on = selection.value === index;
    return {
      backgroundColor: on ? Colors.bone : Colors.charcoal,
      transform: [
        {
          scale: withSpring(on ? 1.06 : 1, {
            damping: 18,
            stiffness: 220,
            mass: 0.7,
          }),
        },
      ],
    };
  });

  const textStyle = useAnimatedStyle(() => ({
    color: selection.value === index ? Colors.rust : Colors.bone,
  }));

  return (
    <Animated.View style={[styles.row, style]}>
      <Animated.Text style={[styles.rowText, textStyle]}>{label}</Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 5,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontFamily: Fonts.display,
    fontSize: 30,
    color: Colors.bone,
    letterSpacing: 2,
    marginBottom: Spacing.xl,
  },
  row: {
    height: ITEM_STEP,
    minWidth: 240,
    paddingHorizontal: Spacing.lg,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.sm,
  },
  rowText: {
    fontFamily: Fonts.bodyBold,
    fontSize: 17,
    letterSpacing: 1,
  },
});
