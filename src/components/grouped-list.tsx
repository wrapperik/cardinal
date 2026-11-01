import { Children, Fragment, isValidElement, useEffect, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";

import { Icon, type IconName } from "@/components/icons";
import { DELAYED_FILL_SPRING, SWIPE_COMMIT_DISTANCE, SWIPE_MAX_DRAG } from "@/constants/gestures";
import { Colors, Fonts, Motion, Radius, Spacing, Theme } from "@/constants/theme";
import { useTraditionalUx } from "@/features/preferences/preferences";
import { useReducedMotion } from "@/lib/accessibility";
import { selection } from "@/lib/haptics";

/**
 * Grouped list pieces shared by settings and the other sub-pages: titled
 * cards of rows, each row an optional icon tile, a label, and whatever sits
 * on the right — a value, a chevron, or a switch.
 *
 * Cards are a wash LIGHTER than the charcoal page rather than the darker
 * Theme.surface, so they read as raised panels, not holes cut into it.
 */
const CARD = "rgba(217, 217, 217, 0.06)";
const TILE = "rgba(217, 217, 217, 0.08)";
const PRESSED = "rgba(217, 217, 217, 0.06)";
const ROW_H = 60;
const TILE_SIZE = 36;
/** Separators start under the label, not the tile, as in a native grouped list. */
const SEPARATOR_INSET = Spacing.md + TILE_SIZE + Spacing.md;

export function ListGroup({
  title,
  footer,
  iconless = false,
  children,
}: {
  title?: string;
  /** Muted note under the card, for the one line of context a group needs. */
  footer?: ReactNode;
  /** For plain stat lists with no tiles: separators then start at the text. */
  iconless?: boolean;
  children: ReactNode;
}) {
  // Falsy children (a row hidden behind a condition) must not leave a
  // stray separator behind, so filter before interleaving.
  const rows = Children.toArray(children).filter(isValidElement);

  return (
    <View style={styles.group}>
      {title ? <Text style={styles.groupTitle} accessibilityRole="header">{title}</Text> : null}
      <View style={styles.card}>
        {rows.map((row, index) => (
          <Fragment key={row.key ?? index}>
            {index > 0 && <View style={[styles.separator, iconless && styles.separatorIconless]} />}
            {row}
          </Fragment>
        ))}
      </View>
      {typeof footer === "string" ? <Text style={styles.footer}>{footer}</Text> : footer}
    </View>
  );
}

interface RowProps {
  icon?: IconName;
  label: string;
  /** A muted second line under the label, for rows that need a sentence of context. */
  detail?: string;
  /** Muted text on the right — the current value of whatever the row is about. */
  value?: string;
  /** Rust label, tile and value, for rows that sign out, delete, or need attention. */
  destructive?: boolean;
}

function RowBody({ icon, label, detail, value, destructive, chevron }: RowProps & { chevron?: boolean }) {
  // Destructive rows put the rust in the tile, filled solid behind a white
  // glyph; the label itself stays white, since rust text is unreadable here.
  const tint = destructive ? Theme.onAccent : Colors.bone;
  return (
    <>
      {icon && (
        <View style={[styles.tile, destructive && styles.tileDestructive]}>
          <Icon name={icon} size={18} color={tint} />
        </View>
      )}
      <View style={styles.labelBlock}>
        <Text style={[styles.label, destructive && styles.labelDestructive]} numberOfLines={detail ? 2 : 1}>
          {label}
        </Text>
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      </View>
      {value != null && (
        <Text style={[styles.value, destructive && styles.labelDestructive]} numberOfLines={1} ellipsizeMode="middle">
          {value}
        </Text>
      )}
      {chevron && <Chevron />}
    </>
  );
}

function Chevron() {
  return (
    <Svg width={7} height={12} viewBox="0 0 8 14" fill="none" style={styles.chevron}>
      <Path d="M1 1 L7 7 L1 13" stroke={Theme.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** A row that only shows something: name, email, version. */
export function ListInfoRow(props: RowProps) {
  return (
    <View style={styles.row} accessible accessibilityLabel={props.value ? `${props.label}, ${props.value}` : props.label}>
      <RowBody {...props} />
    </View>
  );
}

/**
 * A row that does something. Traditional UX: a tap. Legacy UX: a rightward
 * swipe with the same delayed rust fill as home's menu rows, the chevron
 * doubling as the cue for which way to drag.
 */
export function ListActionRow(props: RowProps & { onPress: () => void; disabled?: boolean }) {
  const traditional = useTraditionalUx();
  return traditional ? <TapActionRow {...props} /> : <SwipeActionRow {...props} />;
}

function TapActionRow({ onPress, disabled, ...body }: RowProps & { onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={body.value ? `${body.label}, ${body.value}` : body.label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => { selection(); onPress(); }}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed, disabled && styles.disabled]}
    >
      <RowBody {...body} chevron={!body.destructive} />
    </Pressable>
  );
}

function SwipeActionRow({ onPress, disabled, ...body }: RowProps & { onPress: () => void; disabled?: boolean }) {
  const reducedMotion = useReducedMotion();
  const drag = useSharedValue(0);
  const commit = () => { selection(); onPress(); };

  const gesture = Gesture.Pan()
    .enabled(!disabled)
    // Sideways travel before claiming the touch, so the ScrollView still
    // wins a drag that reads as vertical.
    .activeOffsetX([-8, 8])
    .onChange((event) => {
      drag.value = Math.max(0, Math.min(SWIPE_MAX_DRAG, drag.value + event.changeX));
    })
    .onEnd(() => {
      if (drag.value > SWIPE_COMMIT_DISTANCE) runOnJS(commit)();
      drag.value = reducedMotion ? 0 : withSpring(0, Motion.snap);
    });

  const fillDrag = useDerivedValue(() => (reducedMotion ? drag.value : withSpring(drag.value, DELAYED_FILL_SPRING)));
  const contentStyle = useAnimatedStyle(() => ({ transform: [{ translateX: drag.value }] }));
  const fillStyle = useAnimatedStyle(() => ({
    width: `${Math.max(0, Math.min(100, (fillDrag.value / SWIPE_COMMIT_DISTANCE) * 100))}%`,
  }));

  return (
    <View
      style={[styles.swipeClip, disabled && styles.disabled]}
      accessible
      accessibilityRole="button"
      accessibilityLabel={body.value ? `${body.label}, ${body.value}` : body.label}
      accessibilityState={{ disabled }}
      // Screen readers cannot swipe; give them the action directly.
      onAccessibilityTap={disabled ? undefined : commit}
    >
      <Animated.View style={[styles.swipeFill, fillStyle]} />
      <GestureDetector gesture={gesture}>
        <Animated.View style={[styles.row, contentStyle]}>
          <RowBody {...body} chevron />
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

/**
 * One option in a pick-one list — a course to file an upload under. A tap
 * in both UX modes: choosing between options commits nothing by itself
 * (the screen's own primary button does), so it needs no deliberate swipe.
 */
export function ListChoiceRow({
  label,
  detail,
  selected,
  onSelect,
}: {
  label: string;
  detail?: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      accessibilityState={{ selected }}
      onPress={() => { selection(); onSelect(); }}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.labelBlock}>
        <Text style={styles.label} numberOfLines={2}>{label}</Text>
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      </View>
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected && <Icon name="check" size={14} color={Theme.onAccent} />}
      </View>
    </Pressable>
  );
}

/**
 * A row with a switch. Legacy: the knob is dragged and snaps to the nearer
 * side. Traditional: tapping anywhere on the row flips it.
 */
export function ListToggleRow({
  icon,
  label,
  value,
  onChange,
}: {
  icon: IconName;
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const traditional = useTraditionalUx();
  const knob = useSharedValue(value ? 1 : 0); // 0 = off, 1 = on

  useEffect(() => {
    knob.value = withSpring(value ? 1 : 0, Motion.snap);
  }, [knob, value]);

  const toggleDrag = Gesture.Pan()
    .activeOffsetX([-6, 6])
    .onChange((e) => {
      knob.value = Math.min(1, Math.max(0, knob.value + e.changeX / 20));
    })
    .onEnd(() => {
      const on = knob.value > 0.5;
      knob.value = withSpring(on ? 1 : 0, Motion.snap);
      runOnJS(onChange)(on);
    });

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(knob.value, [0, 1], ["rgba(217, 217, 217, 0.18)", Colors.rust]),
  }));
  const knobStyle = useAnimatedStyle(() => ({ transform: [{ translateX: knob.value * 20 }] }));

  const track = (
    <Animated.View style={[styles.track, trackStyle]}>
      <Animated.View style={[styles.knob, knobStyle]} />
    </Animated.View>
  );

  if (traditional) {
    return (
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel={label}
        accessibilityState={{ checked: value }}
        onPress={() => { selection(); onChange(!value); }}
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      >
        <RowBody icon={icon} label={label} />
        {track}
      </Pressable>
    );
  }

  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      onAccessibilityTap={() => onChange(!value)}
    >
      <RowBody icon={icon} label={label} />
      <GestureDetector gesture={toggleDrag}>{track}</GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { marginTop: Spacing.lg },
  groupTitle: {
    marginLeft: Spacing.xs,
    marginBottom: Spacing.sm,
    fontFamily: Fonts.bodyBold,
    fontSize: 12,
    letterSpacing: 2,
    color: Theme.textMuted,
  },
  card: {
    backgroundColor: CARD,
    borderRadius: Radius.card,
    overflow: "hidden",
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: SEPARATOR_INSET,
    backgroundColor: Theme.hairline,
  },
  separatorIconless: { marginLeft: Spacing.md },
  footer: {
    marginTop: Spacing.sm,
    marginHorizontal: Spacing.xs,
    fontFamily: Fonts.body,
    fontSize: 13,
    lineHeight: 18,
    color: Theme.textMuted,
  },
  row: {
    minHeight: ROW_H,
    paddingVertical: Spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    gap: Spacing.md,
  },
  rowPressed: { backgroundColor: PRESSED },
  disabled: { opacity: 0.4 },
  swipeClip: { overflow: "hidden" },
  swipeFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: Colors.rust,
  },
  tile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: TILE,
  },
  tileDestructive: { backgroundColor: Colors.rust },
  labelBlock: { flex: 1, gap: 2 },
  detail: {
    fontFamily: Fonts.body,
    fontSize: 13,
    lineHeight: 17,
    color: Theme.textMuted,
  },
  label: {
    fontFamily: Fonts.bodyMedium,
    fontSize: 16,
    letterSpacing: 0.8,
    color: Theme.text,
  },
  labelDestructive: { color: Theme.text },
  value: {
    maxWidth: "45%",
    fontFamily: Fonts.body,
    fontSize: 15,
    color: Theme.textMuted,
  },
  chevron: { marginLeft: -Spacing.xs },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Theme.textMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  radioSelected: { backgroundColor: Colors.rust, borderColor: Colors.rust },
  track: {
    width: 48,
    height: 28,
    borderRadius: Radius.pill,
  },
  knob: {
    position: "absolute",
    left: 2,
    top: 2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.bone,
  },
});
