import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

// Home's three-dot L motif, redeclared rather than imported from
// src/app/home.tsx — a component shouldn't reach into a screen for constants.
const DOT_SIZE = 10;
const DOT_GAP = 8;
const PITCH = DOT_SIZE + DOT_GAP;
const MOTIF_SIZE = DOT_SIZE * 2 + DOT_GAP;

export const DOT_CLUSTER_WIDTH = MOTIF_SIZE;
export const DOT_CLUSTER_HEIGHT = MOTIF_SIZE * 2 + PITCH;

interface DotClusterProps {
  color: string;
  /** Flips the motif horizontally so a left and right cluster mirror each other. */
  mirrored?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Two stacked copies of home's three-dot L motif, forming a 6-dot vertical
 * scatter. The bottom pair of each motif already spans both columns, so
 * mirroring only ever has to move the lone top dot.
 */
export function DotCluster({ color, mirrored = false, style }: DotClusterProps) {
  return (
    <View pointerEvents="none" style={[styles.root, style]}>
      <Motif color={color} mirrored={mirrored} top={0} />
      <Motif color={color} mirrored={mirrored} top={MOTIF_SIZE + PITCH} />
    </View>
  );
}

/**
 * One copy of the motif, in its own positioned box. The offset has to live on
 * a wrapper: RN styles override rather than accumulate, so pushing the second
 * copy down by overriding each dot's `top` would flatten all three onto one
 * line instead of moving the L as a unit.
 */
function Motif({
  color,
  mirrored,
  top,
}: {
  color: string;
  mirrored: boolean;
  top: number;
}) {
  const fill = { backgroundColor: color };

  return (
    <View style={[styles.motif, { top }]}>
      <View
        style={[
          styles.dot,
          mirrored ? styles.topMirrored : styles.topPlain,
          fill,
        ]}
      />
      <View style={[styles.dot, styles.bottomLeft, fill]} />
      <View style={[styles.dot, styles.bottomRight, fill]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: DOT_CLUSTER_WIDTH,
    height: DOT_CLUSTER_HEIGHT,
  },
  dot: {
    position: "absolute",
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    opacity: 0.9,
  },
  topPlain: {
    top: 0,
    left: 0,
  },
  topMirrored: {
    top: 0,
    left: PITCH,
  },
  bottomLeft: {
    top: PITCH,
    left: 0,
  },
  bottomRight: {
    top: PITCH,
    left: PITCH,
  },
  motif: {
    position: "absolute",
    left: 0,
    width: MOTIF_SIZE,
    height: MOTIF_SIZE,
  },
});
