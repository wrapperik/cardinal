import { forwardRef } from 'react';
import { StyleSheet, Text, View, type ViewProps } from 'react-native';
import Svg, { Line } from 'react-native-svg';

import { Colors, Fonts, Spacing } from '@/constants/theme';

/**
 * Fixed footprint for the tab that peeks up from the bottom edge. Wide
 * enough that the plus glyph and the label beneath it don't crowd each
 * other, narrow enough that it reads as a handle rather than a bar spanning
 * the screen — the same "one physical object" reasoning as PULL_TAB_WIDTH
 * in pull-tab.tsx, just sized for a vertical stack instead of a horizontal
 * chevron-plus-label row.
 *
 * The height carries real weight beyond the visual footprint: iOS reserves
 * the bottom few points of the screen for its own home-indicator swipe, and
 * a touch that starts inside that strip goes to the system, not this
 * gesture, no matter how the app's own hit-testing is configured. Sized well
 * past that reserved band so the grabbable area sits comfortably above it,
 * not flush against the one edge the OS also wants.
 */
export const BOTTOM_TAB_WIDTH = 112;
export const BOTTOM_TAB_HEIGHT = 168;

interface BottomPullTabProps extends ViewProps {
  label?: string;
  backgroundColor?: string;
  /** Extra height tacked on past the glyph, invisible until the upload
   *  sheet's panel — drawn after this in the sled — needs somewhere to tuck
   *  the seam between the two so a partial drag never shows a gap of the
   *  wrong colour. Mirrors extraWidth in pull-tab.tsx exactly, just on the
   *  axis this tab actually travels. */
  extraHeight?: number;
}

/**
 * Visual chrome for the bottom edge pull-tab: a plus glyph over a lowercase
 * label, rounded on top, flush on the bottom. Purely presentational, like
 * PullTab — the caller owns the GestureDetector and the sled positioning.
 *
 * Extends ViewProps and spreads the rest onto the View deliberately, for the
 * same reason documented in pull-tab.tsx: a GestureDetector clones its child
 * with `collapsable: false` so the native view survives view-flattening and
 * has a real tag for the detector to attach to. Swallow that prop and the
 * gesture silently binds to nothing.
 */
export const BottomPullTab = forwardRef<View, BottomPullTabProps>(function BottomPullTab(
  { label = 'upload', backgroundColor = Colors.bone, extraHeight = 0, style, ...rest },
  ref,
) {
  return (
    <View
      ref={ref}
      {...rest}
      style={[
        styles.tab,
        { height: BOTTOM_TAB_HEIGHT + extraHeight, backgroundColor },
        style,
      ]}
    >
      {/* Pinned to exactly the visible window and centred within only that,
          not the extended box above: the sled clips everything past
          BOTTOM_TAB_HEIGHT from the top, so centring across the full
          height (glyph included) would push the label down into the
          tucked, invisible region and read as cropped. The tuck instead
          falls below this box, where it belongs. */}
      <View style={styles.content}>
        <Svg width={28} height={28} style={styles.glyph}>
          <Line x1={14} y1={3} x2={14} y2={25} stroke={Colors.charcoal} strokeWidth={3} strokeLinecap="round" />
          <Line x1={3} y1={14} x2={25} y2={14} stroke={Colors.charcoal} strokeWidth={3} strokeLinecap="round" />
        </Svg>
        {/* Lowercase is deliberate: every other label in the app shouts in
            caps, so this is the one place the app asks quietly rather than
            states — it also visually distinguishes "add material" from the
            command-style verbs (UPLOAD MATERIAL, START QUIZ) already used
            elsewhere in the menu grammar. */}
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  tab: {
    width: BOTTOM_TAB_WIDTH,
    alignItems: 'center',
    // Deliberately NOT centred: the box's height includes the invisible
    // tuck (extraHeight), and centring across all of it — rather than just
    // the visible window at the top — is what let the label slip into the
    // clipped region below the screen edge. flex-start pins the content box
    // to the top and leaves the tuck as pure empty space underneath.
    justifyContent: 'flex-start',
    borderTopLeftRadius: 999,
    borderTopRightRadius: 999,
    // No bottom radius: this edge sits flush against the screen's own bottom
    // edge (closed) or flush against the panel it hands off to (open), so
    // rounding it would only ever be cut off or hidden.
  },
  content: {
    height: BOTTOM_TAB_HEIGHT,
    alignItems: 'center',
    // Pinned near the top of the visible window rather than centred within
    // it: BOTTOM_TAB_HEIGHT grew to clear the iOS home-indicator strip, not
    // to give the glyph and label more room, so dead-centring them now
    // strands them in the middle of a tall arch with empty bone below.
    // Sitting them just under the dome keeps the tab reading as a compact
    // handle rather than a panel with a floating label.
    justifyContent: 'flex-start',
    paddingTop: Spacing.xl,
  },
  glyph: {
    marginBottom: Spacing.sm,
  },
  // 15/bodyBold/1 is PullTab's own label size (its "SETTINGS" text) — this is
  // the same class of element, a primary pull-tab label, not a caption, so it
  // takes the same rung of the type scale rather than sectionLabel's 12.
  label: {
    fontFamily: Fonts.bodyBold,
    fontSize: 15,
    letterSpacing: 1,
    color: Colors.charcoal,
    textTransform: 'lowercase',
  },
});
