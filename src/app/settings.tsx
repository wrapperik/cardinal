import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BackButton } from "@/components/back-button";
import { HOLD_BUTTON_SIZE } from "@/components/hold-button";
import { Colors, Fonts, Motion, Spacing, Theme } from "@/constants/theme";
import { useAuth } from "@/features/auth/auth-provider";
import {
  syncStatusLabel,
  updatePreferences,
  usePreferences,
  usePreferencesSyncStatus,
} from "@/features/preferences/preferences";

/**
 * Settings, as an ordinary pushed screen. No tap target opens it any more
 * either — it's reached by holding the gear icon on home's nav bar — but
 * once inside there is still nothing to tap: the SIGN OUT row and the EDGE
 * TAP ZONES toggle are both drag-only, matching the no-tap grammar the rest
 * of the app uses.
 */
export default function Settings() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signOutUser, user } = useAuth();
  const preferences = usePreferences();
  const syncStatus = usePreferencesSyncStatus();

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          // Clears the BACK button, exactly like course detail's own clearance.
          paddingTop: insets.top + HOLD_BUTTON_SIZE + Spacing.lg,
          paddingHorizontal: Spacing.lg,
        }}
      >
        <Text style={styles.heading}>SETTINGS</Text>

        <Text style={styles.sectionLabel}>ACCOUNT</Text>
        <InfoRow label="NAME" value={user?.displayName ?? "STUDENT"} />
        <InfoRow label="EMAIL" value={user?.email ?? "—"} />
        <InfoRow label="SYNC" value={syncStatusLabel(syncStatus)} />
        <SignOutRow onSignOut={signOutUser} />

        <Text style={styles.sectionLabel}>ACCESSIBILITY</Text>
        <AccessibilityRow
          tapZones={preferences.accessibilityTapZones}
          onChange={(accessibilityTapZones) => updatePreferences({ accessibilityTapZones })}
        />
        {/* TODO(week7): wire to the real tap-zone overlay when the accessibility mode ships. */}

        <Text style={styles.sectionLabel}>ABOUT</Text>
        <InfoRow label="VERSION" value="1.0.0" />
        <InfoRow label="BUILD" value="WEEK 5" />
      </ScrollView>

      <BackButton label="BACK" onBack={() => router.back()} />
    </View>
  );
}

/** A static label/value line, used for ACCOUNT and ABOUT. */
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text numberOfLines={1} ellipsizeMode="middle" style={styles.infoValue}>
        {value}
      </Text>
    </View>
  );
}

/** A deliberate left swipe guards a destructive, irreversible action — the
 *  same reasoning SwipeAction generalises for the upload flow, just applied
 *  to the one row in the app that can't be undone by swiping again. */
function SignOutRow({ onSignOut }: { onSignOut: () => Promise<void> }) {
  const [error, setError] = useState(false);
  const drag = useSharedValue(0);

  const signOut = async () => {
    setError(false);
    try {
      await onSignOut();
    } catch {
      setError(true);
    }
  };

  const gesture = Gesture.Pan()
    .activeOffsetX([-8, 8])
    .onChange((event) => {
      drag.value = Math.max(-112, Math.min(0, drag.value + event.changeX));
    })
    .onEnd(() => {
      if (drag.value < -88) runOnJS(signOut)();
      drag.value = withSpring(0, Motion.snap);
    });

  const dragStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: drag.value }],
  }));

  return (
    <View>
      <GestureDetector gesture={gesture}>
        <Animated.View style={[styles.signOutRow, dragStyle]}>
          <Text style={styles.signOutLabel}>SIGN OUT</Text>
          <Text style={styles.signOutHint}>SWIPE LEFT</Text>
        </Animated.View>
      </GestureDetector>
      {error && <Text style={styles.signOutError}>COULDN&apos;T SIGN OUT. TRY AGAIN.</Text>}
    </View>
  );
}

/**
 * EDGE TAP ZONES toggle. A drag-only switch — the knob follows the finger
 * and releasing snaps it to the nearer side, matching the no-tap premise.
 */
function AccessibilityRow({
  tapZones,
  onChange,
}: {
  tapZones: boolean;
  onChange: (value: boolean) => void;
}) {
  const knob = useSharedValue(tapZones ? 1 : 0); // 0 = off, 1 = on

  useEffect(() => {
    knob.value = withSpring(tapZones ? 1 : 0, Motion.snap);
  }, [knob, tapZones]);

  // The child toggle's GestureDetector takes precedence over any ancestor's
  // own gesture automatically (innermost first), so this never fights a
  // scroll or the back button.
  const toggleDrag = Gesture.Pan()
    .activeOffsetX([-6, 6])
    .onChange((e) => {
      knob.value = Math.min(1, Math.max(0, knob.value + e.changeX / 22));
    })
    .onEnd(() => {
      const on = knob.value > 0.5;
      knob.value = withSpring(on ? 1 : 0, Motion.snap);
      runOnJS(onChange)(on);
    });

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      knob.value,
      [0, 1],
      [Theme.surface, Colors.rust],
    ),
  }));

  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: knob.value * 22 }],
  }));

  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>EDGE TAP ZONES</Text>
      <View style={styles.toggleWrap}>
        <Text style={styles.toggleState}>{tapZones ? "ON" : "OFF"}</Text>
        <GestureDetector gesture={toggleDrag}>
          <Animated.View style={[styles.track, trackStyle]}>
            <Animated.View style={[styles.knob, knobStyle]} />
          </Animated.View>
        </GestureDetector>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.background,
  },
  heading: {
    fontFamily: Fonts.display,
    color: Theme.text,
    letterSpacing: 2,
    fontSize: 40,
  },
  sectionLabel: {
    fontFamily: Fonts.bodyBold,
    fontSize: 12,
    letterSpacing: 2,
    color: Theme.textMuted,
    marginTop: Spacing.xl,
    marginBottom: Spacing.sm,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.glassEdge,
  },
  infoLabel: {
    fontFamily: Fonts.body,
    fontSize: 15,
    color: Theme.text,
  },
  infoValue: {
    flex: 1,
    marginLeft: Spacing.lg,
    textAlign: "right",
    fontFamily: Fonts.bodyBold,
    fontSize: 15,
    color: Theme.textMuted,
  },
  signOutRow: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.glassEdge,
  },
  signOutLabel: {
    fontFamily: Fonts.bodyBold,
    fontSize: 15,
    color: Colors.rust,
  },
  signOutHint: {
    fontFamily: Fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 1.2,
    color: Theme.textMuted,
  },
  signOutError: {
    marginTop: Spacing.sm,
    fontFamily: Fonts.bodyBold,
    fontSize: 11,
    color: Colors.rust,
  },
  toggleWrap: {
    flexDirection: "row",
    alignItems: "center",
  },
  toggleState: {
    fontFamily: Fonts.bodyBold,
    fontSize: 12,
    color: Theme.textMuted,
    marginRight: Spacing.sm,
  },
  track: {
    width: 52,
    height: 30,
    borderRadius: 999,
  },
  knob: {
    position: "absolute",
    left: 3,
    top: 3,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.bone,
  },
});
