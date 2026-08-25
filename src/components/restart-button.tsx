import { StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HoldButton } from "@/components/hold-button";
import { Colors, Spacing } from "@/constants/theme";

interface RestartButtonProps {
  onRestart: () => void;
}

/**
 * The glyph's geometry, all measured from the centre of the 24-unit viewBox —
 * same convention as nav-bar.tsx's buildGearPath.
 */
const CENTRE = 12;
const RADIUS = 7;
/** Where the arc begins, in radians, using the same point-on-circle
 *  convention as buildGearPath: point = centre + r*(cos theta, sin theta).
 *  Because the viewBox's y-axis points down, increasing theta sweeps
 *  clockwise on screen. */
const START_ANGLE = -Math.PI / 3;
/** Leaves a 90° gap open rather than closing the loop — a closed circle
 *  reads as a stop sign, not a restart. */
const SWEEP_ANGLE = (3 / 2) * Math.PI;
const ARROW_LEN = 4.5;
/** Half-angle of the arrowhead's V, measured off the tangent it points along. */
const ARROW_SPREAD = (28 * Math.PI) / 180;

function point(radius: number, theta: number) {
  const x = Math.round((CENTRE + radius * Math.cos(theta)) * 100) / 100;
  const y = Math.round((CENTRE + radius * Math.sin(theta)) * 100) / 100;
  return { x, y };
}

/** The open ring: an arc from START_ANGLE sweeping SWEEP_ANGLE clockwise. */
function buildRestartArcPath(): string {
  const start = point(RADIUS, START_ANGLE);
  const end = point(RADIUS, START_ANGLE + SWEEP_ANGLE);
  const largeArc = SWEEP_ANGLE > Math.PI ? 1 : 0;
  return `M ${start.x} ${start.y} A ${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

/**
 * The arrowhead sits exactly at the arc's own end point (not a separately
 * guessed coordinate) and points along the tangent of continued clockwise
 * travel — the direction the ring would keep sweeping if the gap weren't
 * there — so it reads as the ring's own motion, not a decoration bolted on.
 */
function buildRestartArrowPath(): string {
  const endAngle = START_ANGLE + SWEEP_ANGLE;
  const end = point(RADIUS, endAngle);
  // d/dtheta (cos theta, sin theta) = (-sin theta, cos theta): the direction
  // of travel at `end` for increasing theta, i.e. clockwise continuation.
  const tangentAngle = Math.atan2(Math.cos(endAngle), -Math.sin(endAngle));

  const wing = (sign: 1 | -1) => {
    const wingAngle = tangentAngle + Math.PI + sign * ARROW_SPREAD;
    const x = Math.round((end.x + ARROW_LEN * Math.cos(wingAngle)) * 100) / 100;
    const y = Math.round((end.y + ARROW_LEN * Math.sin(wingAngle)) * 100) / 100;
    return { x, y };
  };

  const wingA = wing(-1);
  const wingB = wing(1);
  return `M ${wingA.x} ${wingA.y} L ${end.x} ${end.y} L ${wingB.x} ${wingB.y}`;
}

const ARC_PATH = buildRestartArcPath();
const ARROW_PATH = buildRestartArrowPath();

/**
 * The restart control: a circular-arrow glyph that starts the current
 * course's recap over from its first card.
 *
 * Always rust, for the same reason BackButton always is — see its doc
 * comment. Restart shares BackButton's weight: both are commitments a stray
 * touch must not trigger, so both hold rather than tap, and both claim the
 * same rust the app reserves for an active edge.
 */
export function RestartButton({ onRestart }: RestartButtonProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.button, { top: insets.top + Spacing.md }]}>
      <HoldButton
        glyph={<RestartGlyph />}
        label="RESTART"
        hint="Hold to start this deck again from the first card"
        onHold={onRestart}
        backgroundColor={Colors.rust}
      />
    </View>
  );
}

function RestartGlyph() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path
        d={ARC_PATH}
        stroke={Colors.bone}
        strokeWidth={2}
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d={ARROW_PATH}
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
    right: Spacing.md,
    zIndex: 10,
  },
});
