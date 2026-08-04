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
}

/**
 * Visual chrome for an edge pull-tab: chevron + label, rounded on the left,
 * flush on the right. Purely presentational — every tab drags differently,
 * so callers own the GestureDetector and the positioning.
 *
 * Extends ViewProps and spreads the rest onto the View deliberately: a
 * GestureDetector clones its child with `collapsable: false` so the native
 * view survives view-flattening and the detector can find a tag to attach to.
 * Swallow that prop and the gesture silently binds to nothing.
 */
export const PullTab = forwardRef<View, PullTabProps>(function PullTab(
  { label, backgroundColor, extraWidth = 0, style, ...rest },
  ref,
) {
  return (
    <View
      ref={ref}
      {...rest}
      style={[styles.tab, { width: PULL_TAB_WIDTH + extraWidth, backgroundColor }, style]}
    >
      <Svg width={14} height={24} style={styles.chevron}>
        <Path
          d="M11 3 L3 12 L11 21"
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
    borderTopLeftRadius: 999,
    borderBottomLeftRadius: 999,
  },
  chevron: {
    marginRight: Spacing.xs,
  },
  label: {
    fontFamily: Fonts.bodyBold,
    fontSize: 15,
    letterSpacing: 1,
    color: Colors.bone,
  },
});
