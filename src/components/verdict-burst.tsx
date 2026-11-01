import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Platform, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Line, Polygon } from "react-native-svg";

import { Colors, Fonts, Theme } from "@/constants/theme";
import { useReducedMotion } from "@/lib/accessibility";

export type VerdictKind = "correct" | "wrong" | "pass";

/** The first option of each list is the plain wording; the rest are variety. */
const WORDING: Record<VerdictKind, readonly string[]> = {
  correct: ["CORRECT!", "NICE!", "SPOT ON!", "NAILED IT!"],
  wrong: ["WRONG", "NOPE!", "NOT QUITE"],
  pass: ["PASSED"],
};

const FILL: Record<VerdictKind, string> = {
  correct: Theme.correct,
  wrong: Theme.incorrect,
  pass: Colors.charcoal,
};

// ── Emitter ────────────────────────────────────────────────────────────────
// A module-level listener set, so game screens can fire a verdict without
// refs or context. The host mounted in GameHUD is the only subscriber.
type Listener = (kind: VerdictKind) => void;
const listeners = new Set<Listener>();

export function showVerdict(kind: VerdictKind) {
  listeners.forEach((listener) => listener(kind));
}

// ── Geometry ───────────────────────────────────────────────────────────────
const BANNER_H = 64;
const SLANT = 12;
const OUTLINE = 4;
const SHADOW_OFFSET = 5;
/** Room around the banner for the burst ticks and the offset shadow. */
const PAD = 18;
/** Below the HUD: the progress label ends about 60px under the safe area and
 *  the score row about 75px, so 100px clears both and the EXIT / restart
 *  buttons, which sit higher still. */
const TOP_OFFSET = 100;

const HOLD_MS = 650;
const TOTAL_MS = 1100;
const STROKE_PX = 2;
const STROKE_OFFSETS: readonly (readonly [number, number])[] = [
  [-STROKE_PX, -STROKE_PX], [0, -STROKE_PX], [STROKE_PX, -STROKE_PX],
  [-STROKE_PX, 0], [STROKE_PX, 0],
  [-STROKE_PX, STROKE_PX], [0, STROKE_PX], [STROKE_PX, STROKE_PX],
];

/** Plain words show up first, so a module flag per kind, not per game. */
const usedPlain: Record<VerdictKind, boolean> = { correct: false, wrong: false, pass: false };

function pickWording(kind: VerdictKind): string {
  const options = WORDING[kind];
  if (!usedPlain[kind]) {
    usedPlain[kind] = true;
    return options[0];
  }
  return options[Math.floor(Math.random() * options.length)];
}

interface Burst {
  id: number;
  kind: VerdictKind;
  text: string;
  /** Random offset from centre as a fraction of the available slack, -1..1. */
  xFactor: number;
  rotation: number;
}

let nextId = 0;

export function VerdictBurstHost() {
  const [burst, setBurst] = useState<Burst | null>(null);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const listener: Listener = (kind) => {
      const text = pickWording(kind);
      if (clearTimer.current) clearTimeout(clearTimer.current);
      // A new id re-keys the burst, so a replacement re-animates from scratch.
      setBurst({
        id: nextId++,
        kind,
        text,
        xFactor: Math.random() * 2 - 1,
        rotation: Math.random() * 20 - 10,
      });
      clearTimer.current = setTimeout(() => setBurst(null), TOTAL_MS + 100);
      if (Platform.OS === "ios") AccessibilityInfo.announceForAccessibility(text);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (clearTimer.current) clearTimeout(clearTimer.current);
    };
  }, []);

  if (!burst) return null;
  return <VerdictBanner key={burst.id} burst={burst} />;
}

function VerdictBanner({ burst }: { burst: Burst }) {
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const reducedMotion = useReducedMotion();

  const bannerW = Math.max(170, burst.text.length * 24 + 70);
  const boxW = bannerW + PAD * 2 + SHADOW_OFFSET;
  const boxH = BANNER_H + PAD * 2 + SHADOW_OFFSET;
  // Up to ±25% of the screen off-centre, clamped so the box stays on screen.
  const maxShift = Math.max(0, Math.min(screenW * 0.25, (screenW - boxW) / 2 - 4));
  const left = (screenW - boxW) / 2 + burst.xFactor * maxShift;

  const opacity = useSharedValue(0);
  const scale = useSharedValue(reducedMotion ? 1 : 0.4);
  const drift = useSharedValue(0);

  useEffect(() => {
    const outDelay = HOLD_MS + 150;
    if (reducedMotion) {
      opacity.value = withSequence(
        withTiming(1, { duration: 120 }),
        withDelay(HOLD_MS, withTiming(0, { duration: 200 })),
      );
      return;
    }
    opacity.value = withSequence(
      withTiming(1, { duration: 120 }),
      withDelay(outDelay - 120, withTiming(0, { duration: TOTAL_MS - outDelay })),
    );
    scale.value = withSequence(
      withSpring(1.08, { damping: 9, stiffness: 260 }),
      withSpring(1, { damping: 12, stiffness: 220 }),
    );
    drift.value = withDelay(outDelay, withTiming(-12, { duration: TOTAL_MS - outDelay }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateY: drift.value },
      { rotate: `${reducedMotion ? 0 : burst.rotation}deg` },
      { scale: scale.value },
    ],
  }));

  // Parallelogram with slanted left and right edges, like the reference.
  const x0 = PAD;
  const y0 = PAD;
  const pts = (dx: number, dy: number) =>
    [
      [x0 + SLANT + dx, y0 + dy],
      [x0 + bannerW + dx, y0 + dy],
      [x0 + bannerW - SLANT + dx, y0 + BANNER_H + dy],
      [x0 + dx, y0 + BANNER_H + dy],
    ]
      .map((p) => p.join(","))
      .join(" ");

  // Three short ticks fanning out from each top corner.
  const ticks = (cx: number, cy: number, baseDeg: number) =>
    [-28, 0, 28].map((spread) => {
      const rad = ((baseDeg + spread) * Math.PI) / 180;
      return {
        x1: cx + Math.cos(rad) * 8,
        y1: cy + Math.sin(rad) * 8,
        x2: cx + Math.cos(rad) * 17,
        y2: cy + Math.sin(rad) * 17,
        key: `${cx}-${spread}`,
      };
    });
  const allTicks = [
    ...ticks(x0 + SLANT, y0, -125),
    ...ticks(x0 + bannerW, y0, -55),
  ];

  const textStyle = [styles.text, { width: bannerW - SLANT * 2 }];

  return (
    <Animated.View
      pointerEvents="none"
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={burst.text}
      style={[
        styles.box,
        { top: insets.top + TOP_OFFSET, left, width: boxW, height: boxH },
        animatedStyle,
      ]}
    >
      <Svg width={boxW} height={boxH} style={StyleSheet.absoluteFill}>
        <Polygon
          points={pts(SHADOW_OFFSET, SHADOW_OFFSET)}
          fill="#000000"
          opacity={0.35}
          stroke="#000000"
          strokeWidth={OUTLINE}
          strokeLinejoin="round"
        />
        <Polygon
          points={pts(0, 0)}
          fill={FILL[burst.kind]}
          stroke={Colors.bone}
          strokeWidth={OUTLINE}
          strokeLinejoin="round"
        />
        {burst.kind !== "pass" &&
          allTicks.map((t) => (
            <Line
              key={t.key}
              x1={t.x1}
              y1={t.y1}
              x2={t.x2}
              y2={t.y2}
              stroke={Colors.bone}
              strokeWidth={3}
              strokeLinecap="round"
            />
          ))}
      </Svg>
      <View style={[styles.textWrap, { left: PAD + SLANT, top: PAD, width: bannerW - SLANT * 2 }]}>
        {/* RN has no text stroke: eight charcoal copies fan out under the real one. */}
        {STROKE_OFFSETS.map(([dx, dy]) => (
          <Text
            key={`${dx},${dy}`}
            numberOfLines={1}
            style={[textStyle, styles.strokeCopy, { transform: [{ translateX: dx }, { translateY: dy }] }]}
          >
            {burst.text}
          </Text>
        ))}
        <Text numberOfLines={1} style={textStyle}>
          {burst.text}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  box: {
    position: "absolute",
    zIndex: 100,
    elevation: 100,
  },
  textWrap: {
    position: "absolute",
    height: BANNER_H,
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    fontFamily: Fonts.bodyBold,
    fontSize: 38,
    letterSpacing: 1.5,
    color: Colors.bone,
    textAlign: "center",
  },
  strokeCopy: {
    position: "absolute",
    color: Colors.charcoal,
  },
});
