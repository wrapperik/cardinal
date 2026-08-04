import * as Haptics from "expo-haptics";
import { StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { DirectionKey } from "@/constants/theme";
import { Fonts, Gestures, Spacing, Theme } from "@/constants/theme";

/**
 * Scaffold screen. It exists to prove the stack is wired end to end —
 * Reanimated on the UI thread, Gesture Handler resolving a dominant axis,
 * and Haptics firing on commit. The real templates replace it.
 */
export default function Home() {
  const insets = useSafeAreaInsets();
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const committed = useSharedValue<DirectionKey | null>(null);

  const onCommit = (direction: DirectionKey) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    console.log("committed:", direction);
  };

  const pan = Gesture.Pan()
    .onChange((event) => {
      translateX.value = event.translationX;
      translateY.value = event.translationY;
    })
    .onEnd((event) => {
      const { translationX: dx, translationY: dy } = event;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);

      // Dominant-axis thresholding: a diagonal that does not clearly favour
      // one axis is ambiguous, and ambiguous swipes snap back.
      const horizontal = absX > absY * Gestures.dominantAxisRatio;
      const vertical = absY > absX * Gestures.dominantAxisRatio;
      const travel = horizontal ? absX : absY;
      const velocity = horizontal
        ? Math.abs(event.velocityX)
        : Math.abs(event.velocityY);

      const passes =
        (horizontal || vertical) &&
        (travel > Gestures.commitDistance ||
          velocity > Gestures.commitVelocity);

      if (passes) {
        const direction: DirectionKey = horizontal
          ? dx > 0
            ? "east"
            : "west"
          : dy > 0
            ? "south"
            : "north";
        committed.value = direction;
        runOnJS(onCommit)(direction);
      }

      translateX.value = withSpring(0, { damping: 18 });
      translateY.value = withSpring(0, { damping: 18 });
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }));

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Text style={styles.wordmark}>CARDINAL</Text>
      <Text style={styles.tagline}>The direction you swipe is the answer.</Text>

      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.card, cardStyle]}>
          <Text style={styles.cardLabel}>Flick me in any direction</Text>
        </Animated.View>
      </GestureDetector>

      <Text style={styles.hint}>
        © Cardinal 2026
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.background,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  wordmark: {
    fontFamily: Fonts.display,
    fontSize: 60,
    color: Theme.text,
    letterSpacing: 2,
  },
  tagline: {
    fontFamily: Fonts.body,
    fontSize: 18,
    color: Theme.textMuted,
    marginBottom: Spacing.xl,
  },
  card: {
    width: 160,
    height: 160,
    borderRadius: 100,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  cardLabel: {
    fontFamily: Fonts.bodyMedium,
    fontSize: 15,
    color: Theme.text,
  },
  hint: {
    fontFamily: Fonts.body,
    fontSize: 14,
    color: Theme.textMuted,
    marginTop: Spacing.xl,
    textAlign: "center",
  },
});
