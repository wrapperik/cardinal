import { useEffect, useState } from "react";
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";

import { Icon, type IconName } from "@/components/icons";
import { Colors, Fonts, Radius, Spacing, Theme } from "@/constants/theme";
import type { DayScore } from "@/features/score/score";
import { useReducedMotion } from "@/lib/accessibility";

/**
 * The visual pieces of the progress page: a rust hero with today's score
 * and an accuracy ring, stat tiles, and a seven-day bar chart. Everything
 * counts or grows in on arrival — the page is a payoff, so the numbers
 * should feel earned rather than just printed — and holds still under
 * reduced motion.
 */

const CARD = "rgba(217, 217, 217, 0.06)";
const ARRIVE_MS = 900;

/** A number that counts up from zero when it first appears. */
export function CountUp({ value, style, suffix = "" }: { value: number; style?: StyleProp<TextStyle>; suffix?: string }) {
  const reducedMotion = useReducedMotion();
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (reducedMotion) return;
    let frame = 0;
    const start = Date.now();
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / ARRIVE_MS);
      // Ease-out cubic: fast at first, settling onto the final figure.
      setShown(Math.round(value * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, reducedMotion]);

  return <Text style={style}>{`${reducedMotion ? value : shown}${suffix}`}</Text>;
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const RING_SIZE = 108;
const RING_STROKE = 10;
const RING_R = (RING_SIZE - RING_STROKE) / 2;
const RING_C = 2 * Math.PI * RING_R;

/** A ring that sweeps round to `value` (0–1), with the percentage inside it. */
function AccuracyRing({ value, label }: { value: number; label: string }) {
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(reducedMotion ? value : 0);

  useEffect(() => {
    progress.value = reducedMotion
      ? value
      : withDelay(150, withTiming(value, { duration: ARRIVE_MS, easing: Easing.out(Easing.cubic) }));
  }, [value, reducedMotion, progress]);

  const ringProps = useAnimatedProps(() => ({
    strokeDashoffset: RING_C * (1 - progress.value),
  }));

  return (
    <View style={styles.ring} accessible accessibilityLabel={`${Math.round(value * 100)}% ${label}`}>
      <Svg width={RING_SIZE} height={RING_SIZE} style={StyleSheet.absoluteFill}>
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_R}
          stroke="rgba(0, 0, 0, 0.22)"
          strokeWidth={RING_STROKE}
          fill="none"
        />
        <AnimatedCircle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_R}
          stroke={Theme.onAccent}
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          strokeDasharray={`${RING_C} ${RING_C}`}
          fill="none"
          // Starts at twelve o'clock rather than three.
          transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
          animatedProps={ringProps}
        />
      </Svg>
      <CountUp value={Math.round(value * 100)} suffix="%" style={styles.ringValue} />
      <Text style={styles.ringLabel}>{label}</Text>
    </View>
  );
}

/**
 * Today at a glance, on the app's rust: the points total counting up big,
 * the accuracy ring beside it, and the three supporting figures underneath.
 */
export function ScoreHero({
  score,
  accuracy,
  accuracyLabel,
  stats,
}: {
  score: number;
  accuracy: number;
  accuracyLabel: string;
  stats: { label: string; value: string }[];
}) {
  return (
    <View style={styles.hero}>
      <View style={styles.heroTop}>
        <View style={styles.heroScore}>
          <Text style={styles.heroEyebrow}>TODAY</Text>
          <CountUp value={score} style={styles.heroValue} />
          <Text style={styles.heroLabel}>POINTS</Text>
        </View>
        <AccuracyRing value={accuracy} label={accuracyLabel} />
      </View>
      <View style={styles.heroStats}>
        {stats.map((stat, index) => (
          <View key={stat.label} style={[styles.heroStat, index > 0 && styles.heroStatDivided]}>
            <Text style={styles.heroStatValue} numberOfLines={1}>{stat.value}</Text>
            <Text style={styles.heroStatLabel} numberOfLines={1}>{stat.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** One figure in a tile: an icon in a tile of its own, the number big, a label under it. */
export function StatTile({
  icon,
  value,
  label,
  accent = false,
}: {
  icon: IconName;
  value: number;
  label: string;
  /** Solid rust icon tile, for the one or two figures worth calling out. */
  accent?: boolean;
}) {
  return (
    <View style={styles.tile} accessible accessibilityLabel={`${value} ${label}`}>
      <View style={[styles.tileIcon, accent && styles.tileIconAccent]}>
        <Icon name={icon} size={16} color={accent ? Theme.onAccent : Colors.bone} />
      </View>
      <CountUp value={value} style={styles.tileValue} />
      <Text style={styles.tileLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

const CHART_H = 112;

/** Seven bars, oldest to today; today's in rust, the rest in a quiet bone. */
export function WeekChart({ days }: { days: DayScore[] }) {
  const max = Math.max(1, ...days.map((day) => day.score));
  const total = days.reduce((sum, day) => sum + day.score, 0);
  const activeDays = days.filter((day) => day.score > 0).length;

  return (
    <View style={styles.chartCard}>
      <View style={styles.chartHeader}>
        <View>
          <CountUp value={total} style={styles.chartTotal} />
          <Text style={styles.chartCaption}>POINTS THIS WEEK</Text>
        </View>
        <Text style={styles.chartCaption}>{activeDays}/7 DAYS</Text>
      </View>
      <View style={styles.chartBars} accessible accessibilityLabel={days.map((d) => `${d.label} ${d.score}`).join(", ")}>
        {days.map((day, index) => (
          <Bar key={day.dayStart} day={day} fraction={day.score / max} index={index} />
        ))}
      </View>
    </View>
  );
}

function Bar({ day, fraction, index }: { day: DayScore; fraction: number; index: number }) {
  const reducedMotion = useReducedMotion();
  const grow = useSharedValue(reducedMotion ? 1 : 0);

  useEffect(() => {
    if (reducedMotion) return;
    grow.value = withDelay(index * 60, withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) }));
  }, [grow, index, reducedMotion]);

  // A sliver even for an empty day, so the axis reads as seven days rather
  // than a gap where nothing happened.
  const height = Math.max(4, fraction * CHART_H);
  const barStyle = useAnimatedStyle(() => ({ transform: [{ scaleY: grow.value }] }));

  return (
    <View style={styles.barColumn}>
      <View style={styles.barTrack}>
        <Animated.View
          style={[
            styles.bar,
            { height, backgroundColor: day.isToday ? Colors.rust : "rgba(217, 217, 217, 0.28)" },
            barStyle,
          ]}
        />
      </View>
      <Text style={[styles.barLabel, day.isToday && styles.barLabelToday]}>{day.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    marginTop: Spacing.sm,
    padding: Spacing.lg,
    borderRadius: Radius.card,
    backgroundColor: Colors.rust,
    gap: Spacing.lg,
  },
  heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heroScore: { flex: 1 },
  heroEyebrow: {
    fontFamily: Fonts.bodyBold,
    fontSize: 12,
    letterSpacing: 2,
    color: Theme.onAccent,
    opacity: 0.85,
  },
  heroValue: {
    fontFamily: Fonts.display,
    fontSize: 56,
    lineHeight: 64,
    color: Theme.onAccent,
  },
  heroLabel: {
    fontFamily: Fonts.bodyBold,
    fontSize: 12,
    letterSpacing: 2,
    color: Theme.onAccent,
  },
  heroStats: {
    flexDirection: "row",
    paddingTop: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255, 255, 255, 0.35)",
  },
  heroStat: { flex: 1, alignItems: "center", gap: 2 },
  heroStatDivided: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: "rgba(255, 255, 255, 0.35)" },
  heroStatValue: { fontFamily: Fonts.bodyBold, fontSize: 18, color: Theme.onAccent },
  heroStatLabel: { fontFamily: Fonts.bodyBold, fontSize: 10, letterSpacing: 1.2, color: Theme.onAccent },
  ring: { width: RING_SIZE, height: RING_SIZE, alignItems: "center", justifyContent: "center" },
  ringValue: { fontFamily: Fonts.display, fontSize: 24, color: Theme.onAccent },
  ringLabel: { fontFamily: Fonts.bodyBold, fontSize: 9, letterSpacing: 1.2, color: Theme.onAccent },
  tile: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: Radius.card,
    backgroundColor: CARD,
    gap: Spacing.xs,
  },
  tileIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(217, 217, 217, 0.08)",
    marginBottom: Spacing.xs,
  },
  tileIconAccent: { backgroundColor: Colors.rust },
  tileValue: { fontFamily: Fonts.display, fontSize: 30, lineHeight: 36, color: Theme.text },
  tileLabel: { fontFamily: Fonts.bodyBold, fontSize: 11, letterSpacing: 1.2, color: Theme.textMuted },
  chartCard: {
    padding: Spacing.md,
    borderRadius: Radius.card,
    backgroundColor: CARD,
    gap: Spacing.md,
  },
  chartHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  chartTotal: { fontFamily: Fonts.display, fontSize: 28, lineHeight: 34, color: Theme.text },
  chartCaption: { fontFamily: Fonts.bodyBold, fontSize: 11, letterSpacing: 1.2, color: Theme.textMuted },
  chartBars: { flexDirection: "row", alignItems: "flex-end", gap: Spacing.sm },
  barColumn: { flex: 1, alignItems: "center", gap: Spacing.xs },
  barTrack: { height: CHART_H, alignSelf: "stretch", justifyContent: "flex-end" },
  bar: { borderRadius: 6, transformOrigin: "bottom" },
  barLabel: { fontFamily: Fonts.bodyBold, fontSize: 11, color: Theme.textMuted },
  barLabelToday: { color: Theme.text },
});
