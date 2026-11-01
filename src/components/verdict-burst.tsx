import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Platform, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon, type IconName } from "@/components/icons";
import { Colors, Fonts, Theme } from "@/constants/theme";
import { useReducedMotion } from "@/lib/accessibility";

export type VerdictKind = "correct" | "wrong" | "pass";

/** The first option of each list is the plain wording; the rest are variety. */
const WORDING: Record<VerdictKind, readonly string[]> = {
  correct: ["CORRECT!", "NICE!", "SPOT ON!", "NAILED IT!"],
  wrong: ["WRONG", "NOPE!", "NOT QUITE"],
  pass: ["PASSED"],
};

const FACE: Record<VerdictKind, string> = {
  correct: Theme.correct,
  wrong: Theme.incorrect,
  pass: Colors.charcoal,
};

/**
 * A darker shade of each face, used for the lip under the sticker and the
 * crisp shadow under its lettering. Depth comes from the colour's own shade
 * rather than an outline or a grey drop shadow, which is what keeps it
 * reading as one solid piece instead of a cut-out pasted on the screen.
 */
const DEPTH: Record<VerdictKind, string> = {
  correct: "#16268A",
  wrong: "#8A2715",
  pass: "#1C1C1C",
};

const GLYPH: Record<VerdictKind, IconName> = {
  correct: "check",
  wrong: "close",
  pass: "arrowRight",
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
const STICKER_H = 44;
/** Lean of the sticker's sides. The content is counter-skewed so the
 *  lettering itself stays upright. */
const SKEW_DEG = -10;
/** How far the darker lip shows under the face. */
const LIP = 4;
/** Below the HUD: the progress label ends about 60px under the safe area and
 *  the score row about 75px, so 100px clears both and the EXIT / restart
 *  buttons, which sit higher still. */
const TOP_OFFSET = 100;

// ── Timing ─────────────────────────────────────────────────────────────────
const HOLD_MS = 720;
const EXIT_MS = 200;
const TOTAL_MS = 1150;

/** Firm and only just overshooting — it lands, it doesn't balloon. */
const LAND_SPRING = { damping: 15, stiffness: 320, mass: 0.8 } as const;

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
        rotation: Math.random() * 12 - 6,
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
  return <VerdictSticker key={burst.id} burst={burst} />;
}

/**
 * The sticker itself. It drops in from just above its resting spot, still
 * over-rotated, and settles into its tilt as it lands. Then each verdict
 * does its own small thing:
 *
 * - correct: a glint of light sweeps across the face.
 * - wrong: a short, decaying head-shake.
 * - pass: nothing — a skip shouldn't celebrate or scold.
 *
 * It leaves by lifting slightly and shrinking as it fades, so the eye reads
 * it as going away rather than just switching off.
 */
function VerdictSticker({ burst }: { burst: Burst }) {
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const reducedMotion = useReducedMotion();

  // Laid out by its content; this estimate only bounds the random offset
  // and the glint's travel, so it errs wide.
  const estimatedW = burst.text.length * 15 + 80;
  const maxShift = Math.max(0, Math.min(screenW * 0.18, (screenW - estimatedW) / 2 - 12));
  const offsetX = burst.xFactor * maxShift;

  const opacity = useSharedValue(0);
  const scale = useSharedValue(reducedMotion ? 1 : 0.55);
  const lift = useSharedValue(reducedMotion ? 0 : -22);
  const spin = useSharedValue(reducedMotion ? 0 : burst.rotation * 2.4);
  const shake = useSharedValue(0);
  const glint = useSharedValue(0);

  useEffect(() => {
    const exitAt = HOLD_MS + 180;

    if (reducedMotion) {
      opacity.value = withSequence(
        withTiming(1, { duration: 140 }),
        withDelay(HOLD_MS, withTiming(0, { duration: EXIT_MS })),
      );
      return;
    }

    opacity.value = withSequence(
      withTiming(1, { duration: 110 }),
      withDelay(exitAt - 110, withTiming(0, { duration: EXIT_MS, easing: Easing.in(Easing.quad) })),
    );
    scale.value = withSequence(
      withSpring(1, LAND_SPRING),
      withDelay(exitAt - 360, withTiming(0.88, { duration: EXIT_MS, easing: Easing.in(Easing.quad) })),
    );
    lift.value = withSequence(
      withSpring(0, LAND_SPRING),
      withDelay(exitAt - 360, withTiming(-10, { duration: EXIT_MS, easing: Easing.in(Easing.quad) })),
    );
    spin.value = withSpring(burst.rotation, { damping: 12, stiffness: 180 });

    if (burst.kind === "correct") {
      glint.value = withDelay(220, withTiming(1, { duration: 520, easing: Easing.inOut(Easing.cubic) }));
    } else if (burst.kind === "wrong") {
      shake.value = withDelay(
        160,
        withSequence(
          withTiming(-7, { duration: 55 }),
          withTiming(6, { duration: 70 }),
          withTiming(-4, { duration: 70 }),
          withTiming(2, { duration: 60 }),
          withTiming(0, { duration: 60 }),
        ),
      );
    }
    // Runs once per burst — each one is keyed and mounts fresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stickerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateX: offsetX + shake.value },
      { translateY: lift.value },
      { rotate: `${spin.value}deg` },
      { scale: scale.value },
    ],
  }));

  const glintStyle = useAnimatedStyle(() => ({
    opacity: glint.value > 0 && glint.value < 1 ? 1 : 0,
    transform: [
      { translateX: -40 + glint.value * (estimatedW + 80) },
      { rotate: "18deg" },
    ],
  }));

  return (
    <View style={[styles.lane, { top: insets.top + TOP_OFFSET }]} pointerEvents="none">
      <Animated.View
        accessible
        accessibilityLiveRegion="polite"
        accessibilityLabel={burst.text}
        style={stickerStyle}
      >
        {/* The lip: the same skewed shape in the darker shade, peeking out
            below the face to give it thickness. */}
        <View style={[styles.slab, styles.lip, { backgroundColor: DEPTH[burst.kind] }]} />

        <View style={[styles.slab, { backgroundColor: FACE[burst.kind] }]}>
          <Animated.View style={[styles.glint, glintStyle]} />
          <View style={styles.content}>
            <View style={[styles.badge, { backgroundColor: DEPTH[burst.kind] }]}>
              <Icon name={GLYPH[burst.kind]} size={14} color={Colors.bone} />
            </View>
            <Text
              numberOfLines={1}
              style={[styles.text, { textShadowColor: DEPTH[burst.kind] }]}
            >
              {burst.text}
            </Text>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Full-width lane so the sticker centres on its own content width; the
  // random sideways offset is a transform on top of that.
  lane: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 100,
    elevation: 100,
  },
  slab: {
    height: STICKER_H,
    borderRadius: 10,
    overflow: "hidden",
    transform: [{ skewX: `${SKEW_DEG}deg` }],
  },
  lip: {
    ...StyleSheet.absoluteFill,
    top: LIP,
    bottom: -LIP,
  },
  // Counter-skewed so the lettering and badge stand upright on a leaning face.
  content: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingLeft: 10,
    paddingRight: 20,
    transform: [{ skewX: `${-SKEW_DEG}deg` }],
  },
  badge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    fontFamily: Fonts.bodyBold,
    fontSize: 24,
    letterSpacing: 1.4,
    color: Colors.bone,
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 0,
  },
  glint: {
    position: "absolute",
    top: -STICKER_H / 2,
    bottom: -STICKER_H / 2,
    left: 0,
    width: 22,
    backgroundColor: "rgba(255,255,255,0.28)",
  },
});
