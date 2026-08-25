import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BackButton } from "@/components/back-button";
import { HOLD_BUTTON_SIZE } from "@/components/hold-button";
import { Fonts, Spacing, Theme } from "@/constants/theme";
import { useRecapRunner } from "@/features/recap/runner";

/**
 * Vertical room the header claims below the safe area. Games pad their own
 * content down by `insets.top + GAME_HEADER_H` to clear it — the shell cannot
 * do it for them, because most of them position against the full viewport.
 */
export const GAME_HEADER_H = HOLD_BUTTON_SIZE + Spacing.lg;

interface GameShellProps {
  /** 1-based position in the deck; rendered as the NN/NN readout. */
  step: number;
  total: number;
  children: ReactNode;
}

/**
 * Everything every game template has in common: the charcoal field, the
 * progress readout, and the way out.
 *
 * The entrance and exit both belong to the stack now, not to this component
 * — expo-router pushes every game on with its own slide, and the EXIT button
 * just pops once its hold completes. There is nothing left for the shell to
 * animate itself.
 */
export function GameShell({ step, total, children }: GameShellProps) {
  const insets = useSafeAreaInsets();
  const runner = useRecapRunner();

  const progressLabel = `${String(step).padStart(2, "0")}/${String(total).padStart(2, "0")}`;

  return (
    <View style={styles.screen}>
      {children}

      <Text style={[styles.progress, { top: insets.top + Spacing.md }]}>{progressLabel}</Text>

      <BackButton label="EXIT" onBack={() => runner.abandon()} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Theme.background,
  },
  progress: {
    position: "absolute",
    left: 0,
    right: 0,
    textAlign: "center",
    fontFamily: Fonts.display,
    fontSize: 30,
    color: Theme.text,
    letterSpacing: 2,
    marginTop: 8,
  },
});
