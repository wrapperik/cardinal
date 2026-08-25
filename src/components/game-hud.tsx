import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BackButton } from "@/components/back-button";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { RestartButton } from "@/components/restart-button";
import { Colors, Fonts, Motion, Spacing, Theme } from "@/constants/theme";
import { useReducedMotion } from "@/lib/accessibility";
import type { RecapRunner } from "@/features/recap/runner";

/** Same dim used by the (now-retired) course row's meta text — the one other
 *  place in the app that needed a bone label reading as secondary. */
const MUTED_BONE_OPACITY = 0.6;

interface GameHUDProps {
  /** 1-based position in the deck; rendered as the NN/NN readout. */
  step: number;
  total: number;
  /** The same runner that records answers for the game screen. */
  runner: RecapRunner;
}

/**
 * The progress readout, the running score, the points-earned flyer, and the
 * two hold buttons — every game template's header, in one place.
 *
 * Split out of GameShell rather than left inline, because two of the four
 * templates (Quiz, True/False) position their own field against the full
 * viewport instead of nesting inside GameShell's children slot, so they
 * cannot reach GameShell's header at all. Both need the exact same HUD, so
 * this is the one component that actually owns it — GameShell is now just
 * one of two places that mount it.
 */
export function GameHUD({ step, total, runner }: GameHUDProps) {
  const insets = useSafeAreaInsets();
  const [confirmRestart, setConfirmRestart] = useState(false);
  const reducedMotion = useReducedMotion();

  const progressLabel = `${String(step).padStart(2, "0")}/${String(total).padStart(2, "0")}`;

  const scorePulse = useSharedValue(1);
  useEffect(() => {
    scorePulse.value = reducedMotion
      ? 1
      : withSequence(withSpring(1.15, Motion.press), withSpring(1, Motion.press));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion, runner.score]);
  const scoreStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scorePulse.value }],
  }));

  const awardOpacity = useSharedValue(0);
  const awardRise = useSharedValue(0);
  useEffect(() => {
    if (!runner.lastAward) return;
    awardOpacity.value = 0;
    awardRise.value = 0;
    awardOpacity.value = reducedMotion ? 1 : withTiming(1, { duration: 600 });
    awardRise.value = reducedMotion ? -24 : withTiming(-24, { duration: 600 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion, runner.lastAward?.key]);
  const awardStyle = useAnimatedStyle(() => ({
    opacity: awardOpacity.value,
    transform: [{ translateY: awardRise.value }],
  }));

  return (
    <>
      <Text style={[styles.progress, { top: insets.top + Spacing.md }]}>{progressLabel}</Text>

      <View style={[styles.scoreRow, { top: insets.top + Spacing.md + 38 }]}>
        <View style={styles.scoreInner}>
          <Animated.Text style={[styles.score, scoreStyle]}>{`${runner.score} PTS`}</Animated.Text>
          {runner.lastAward && (
            <Animated.Text
              key={runner.lastAward.key}
              style={[
                styles.award,
                { color: runner.lastAward.correct ? Colors.blue : Colors.bone },
                !runner.lastAward.correct && styles.awardMuted,
                awardStyle,
              ]}
            >
              {`+${runner.lastAward.amount}`}
            </Animated.Text>
          )}
        </View>
      </View>

      <BackButton
        label="EXIT"
        side="right"
        hint={runner.active ? "Hold to leave. Your progress is saved at the last checkpoint." : undefined}
        onBack={() => runner.abandon()}
      />
      {runner.active && (
        <Text style={[styles.exitHint, { top: insets.top + Spacing.md + 58 }]}>
          PROGRESS SAVES AT YOUR LAST CHECKPOINT
        </Text>
      )}
      {/* Nothing to restart from on the very first card. */}
      {step > 1 && !confirmRestart && <RestartButton onRestart={() => setConfirmRestart(true)} />}
      <ConfirmationDialog
        visible={confirmRestart}
        title="START AGAIN?"
        message="This attempt will close and the deck will restart from its first card."
        confirmLabel="RESTART"
        onCancel={() => setConfirmRestart(false)}
        onConfirm={() => { setConfirmRestart(false); runner.restart(); }}
      />
    </>
  );
}

const styles = StyleSheet.create({
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
  scoreRow: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  scoreInner: {
    flexDirection: "row",
  },
  score: {
    fontFamily: Fonts.bodyBold,
    fontSize: 16,
    letterSpacing: 1,
    color: Colors.bone,
    opacity: MUTED_BONE_OPACITY,
  },
  award: {
    position: "absolute",
    left: "100%",
    marginLeft: Spacing.xs,
    fontFamily: Fonts.bodyBold,
    fontSize: 16,
    letterSpacing: 1,
  },
  awardMuted: {
    opacity: MUTED_BONE_OPACITY,
  },
  exitHint: {
    position: "absolute",
    right: Spacing.md,
    width: 170,
    textAlign: "right",
    fontFamily: Fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 0.7,
    color: Theme.textMuted,
  },
});
