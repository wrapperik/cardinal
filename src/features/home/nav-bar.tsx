import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { Colors, Fonts, Spacing } from '@/constants/theme';
import { HoldButton } from '@/components/hold-button';

/**
 * The gear's geometry, all measured from the centre of the 24-unit viewBox.
 */
const CENTRE = 12;
const TEETH = 8;
const TIP_RADIUS = 10.2;
const ROOT_RADIUS = 7.4;
const HOLE_RADIUS = 3.1;

/** Builds the gear's silhouette as one closed path: eight teeth cut from a
 *  ring, alternating an arc at the tip radius with an arc at the root radius
 *  so the outline actually reads as a cog rather than a ring plus spokes. */
function buildGearPath(): string {
  const step = (2 * Math.PI) / TEETH;
  const tipHalf = step * 0.21;
  const flank = step * 0.1;

  const point = (r: number, theta: number) => {
    const x = Math.round((CENTRE + r * Math.cos(theta)) * 100) / 100;
    const y = Math.round((CENTRE + r * Math.sin(theta)) * 100) / 100;
    return `${x} ${y}`;
  };

  let d = '';
  for (let i = 0; i < TEETH; i += 1) {
    const base = i * step;
    const a = base - tipHalf;
    const b = base + tipHalf;
    const c = base + tipHalf + flank;
    const dAngle = base + step - tipHalf - flank;

    if (i === 0) d += `M ${point(TIP_RADIUS, a)} `;
    d += `A ${TIP_RADIUS} ${TIP_RADIUS} 0 0 1 ${point(TIP_RADIUS, b)} `;
    d += `L ${point(ROOT_RADIUS, c)} `;
    d += `A ${ROOT_RADIUS} ${ROOT_RADIUS} 0 0 1 ${point(ROOT_RADIUS, dAngle)} `;
    d += `L ${point(TIP_RADIUS, dAngle + flank)} `;
  }
  return `${d.trim()} Z`;
}

const GEAR_PATH = buildGearPath();

interface HomeNavBarProps {
  onUpload: () => void;
  onSettings: () => void;
}

/**
 * The wordmark and the screen's two global actions, sharing one row so
 * neither reads as more "inside" the header than the other. Upload and
 * settings are the only actions that apply to the whole app rather than to
 * whatever course is active below, which is why they live up here instead
 * of in the menu stack with everything else.
 */
export function HomeNavBar({ onUpload, onSettings }: HomeNavBarProps) {
  return (
    <View style={styles.row}>
      <Text style={styles.wordmark} numberOfLines={1}>
        CARDINAL
      </Text>
      <View style={styles.icons}>
        <HoldButton glyph={<PlusGlyph />} label="UPLOAD MATERIAL" onHold={onUpload} />
        <HoldButton glyph={<GearGlyph />} label="SETTINGS" onHold={onSettings} />
      </View>
    </View>
  );
}

function PlusGlyph() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      {/* Heavier than the gear's 1.9: a plus is a much sparser figure, so it
          needs the extra weight to read as the same optical density sitting
          next to a shape as dense as a cog. */}
      <Line x1={12} y1={4} x2={12} y2={20} stroke={Colors.bone} strokeWidth={2.4} strokeLinecap="round" />
      <Line x1={4} y1={12} x2={20} y2={12} stroke={Colors.bone} strokeWidth={2.4} strokeLinecap="round" />
    </Svg>
  );
}

/**
 * A cog: a single closed silhouette with eight teeth cut into its rim, plus
 * a hole through the middle.
 *
 * An earlier pass drew only radial spokes and a centre circle, which reads
 * as a sunburst rather than a gear — teeth are teeth because they interrupt
 * a solid rim, and there was no rim for them to interrupt. This one is a
 * real outline, computed once at module load rather than per render since
 * the geometry never changes.
 */
function GearGlyph() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path d={GEAR_PATH} stroke={Colors.bone} strokeWidth={1.9} strokeLinejoin="round" fill="none" />
      <Circle cx={CENTRE} cy={CENTRE} r={HOLE_RADIUS} stroke={Colors.bone} strokeWidth={1.9} fill="none" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    // Matches PillNav's own track inset, so the wordmark and the first pill
    // start on the same vertical line rather than on two nearby ones.
    paddingHorizontal: Spacing.md,
  },
  wordmark: {
    fontFamily: Fonts.display,
    fontSize: 40,
    letterSpacing: 2,
    color: Colors.bone,
    // Yields before the icon group on a narrow device rather than
    // overlapping it — the icons are the fixed, functional half of this row.
    flexShrink: 1,
  },
  icons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    // Never squeezed to make room for the wordmark; it's the wordmark that gives way.
    flexShrink: 0,
  },
});
