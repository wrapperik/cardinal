import { forwardRef } from 'react';
import { StyleSheet, Text, View, type ViewProps } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Colors, Fonts, Spacing } from '@/constants/theme';

/** Fixed footprint so every edge pull-tab in the app — settings, exit,
 *  whatever comes next — reads as the same physical object, whatever it's
 *  labelled. */
export const PULL_TAB_WIDTH = 132;
export const PULL_TAB_HEIGHT = 44;

interface PullTabProps extends ViewProps {
  label: string;
  backgroundColor: string;
  /** Extra width tacked on past the label, invisible until something needs
   *  to tuck under an adjacent surface without showing a seam. */
  extraWidth?: number;
  /** Which screen edge the tab hangs off — named for where the tab lives,
   *  not for which corner rounds, because that's how callers think about it.
   *  Default 'right' is exactly today's behaviour, so every existing caller
   *  is unaffected. */
  edge?: 'left' | 'right';
}

/**
 * Visual chrome for an edge pull-tab: chevron + label. Right edge (default)
 * rounds on the left and sits flush right; left edge is a clean mirror —
 * rounds on the right, sits flush left, chevron and label swap sides. Purely
 * presentational — every tab drags differently, so callers own the
 * GestureDetector and the positioning.
 *
 * Extends ViewProps and spreads the rest onto the View deliberately: a
 * GestureDetector clones its child with `collapsable: false` so the native
 * view survives view-flattening and the detector can find a tag to attach to.
 * Swallow that prop and the gesture silently binds to nothing.
 */
export const PullTab = forwardRef<View, PullTabProps>(function PullTab(
  { label, backgroundColor, extraWidth = 0, edge = 'right', style, ...rest },
  ref,
) {
  const onLeft = edge === 'left';
  return (
    <View
      ref={ref}
      {...rest}
      style={[
        styles.tab,
        onLeft ? styles.tabLeft : styles.tabRight,
        { width: PULL_TAB_WIDTH + extraWidth, backgroundColor },
        style,
      ]}
    >
      <Svg width={14} height={24} style={onLeft ? styles.chevronLeft : styles.chevronRight}>
        <Path
          // The chevron always points the way you drag, so it has to flip
          // with the edge rather than staying decorative: a right-edge tab
          // drags left to open (point left), a left-edge tab drags right
          // (point right).
          d={onLeft ? 'M3 3 L11 12 L3 21' : 'M11 3 L3 12 L11 21'}
          stroke={Colors.bone}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  tab: {
    height: PULL_TAB_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
  },
  tabRight: {
    borderTopLeftRadius: 999,
    borderBottomLeftRadius: 999,
  },
  tabLeft: {
    // row-reverse rather than a mirrored `justifyContent`: it also flips
    // which side the chevron's margin needs to land on, so label and
    // chevron swap sides together instead of the chevron overlapping the
    // label's edge.
    flexDirection: 'row-reverse',
    borderTopRightRadius: 999,
    borderBottomRightRadius: 999,
  },
  chevronRight: {
    marginRight: Spacing.xs,
  },
  chevronLeft: {
    marginLeft: Spacing.xs,
  },
  label: {
    fontFamily: Fonts.bodyBold,
    fontSize: 15,
    letterSpacing: 1,
    color: Colors.bone,
  },
});
