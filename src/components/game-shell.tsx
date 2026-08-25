import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { GameHUD } from "@/components/game-hud";
import { HOLD_BUTTON_SIZE } from "@/components/hold-button";
import { Spacing, Theme } from "@/constants/theme";

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
 * The charcoal field for the two templates (Sequence, Match) that nest their
 * whole board inside it rather than positioning against the full viewport
 * themselves. The header itself — progress, score, both hold buttons — is
 * GameHUD, shared with Quiz and True/False, which mount it directly since
 * they have no children slot to nest inside.
 */
export function GameShell({ step, total, children }: GameShellProps) {
  return (
    <View style={styles.screen}>
      {children}
      <GameHUD step={step} total={total} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Theme.background,
  },
});
