import { StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HoldButton } from "@/components/hold-button";
import { Colors, Spacing } from "@/constants/theme";

interface BackButtonProps {
  /** Announced to assistive tech. "BACK" on ordinary screens, "EXIT" in a game. */
  label: string;
  onBack: () => void;
  /** Back controls live on the right; kept as a prop for exceptional layouts. */
  side?: "left" | "right";
}

/**
 * The app's one way back, now a hold rather than a drag.
 *
 * Every other control in Cardinal converged on the same grammar — a
 * sustained hold on a circular button — and having navigation work one way
 * on home and a different way everywhere else was the inconsistency this
 * closes. The deliberate consequence: leaving a screen now costs a
 * deliberate 420ms hold, which is exactly what stops a game being abandoned
 * by a stray touch.
 *
 * Always rust, with no way to override it. Every screen that has a back
 * button is a charcoal one, and the two darker discs available — charcoal
 * itself and Theme.surface — are both close enough to that background that
 * the one control capable of leaving the screen goes hunting for. Rust is
 * the palette's accent for an active edge, it is what the games already
 * used, and one unconditional rule ("the control that leaves is rust") is
 * worth more here than a prop letting each screen answer differently. Home's
 * nav buttons invert this rather than contradict it: they are charcoal
 * because they sit ON rust.
 */
export function BackButton({ label, onBack, side = "right" }: BackButtonProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.button, { top: insets.top + Spacing.md }, side === "right" ? styles.right : styles.left]}>
      <HoldButton
        glyph={<BackChevron />}
        label={label}
        onHold={onBack}
        backgroundColor={Colors.rust}
      />
    </View>
  );
}

function BackChevron() {
  return (
    <Svg width={10} height={18} viewBox="0 0 10 18" fill="none">
      <Path
        d="M9 1 L1 9 L9 17"
        stroke={Colors.bone}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  button: {
    position: "absolute",
    zIndex: 10,
  },
  left: { left: Spacing.md },
  right: { right: Spacing.md },
});
