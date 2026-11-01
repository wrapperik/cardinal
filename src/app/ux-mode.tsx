import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Fonts, Radius, Spacing, Theme } from "@/constants/theme";
import { useAuth } from "@/features/auth/auth-provider";
import { AuthButton, AuthNotice, AuthScreen } from "@/features/auth/auth-screen";
import type { UxMode } from "@/features/preferences/preferences";
import { selection } from "@/lib/haptics";

const OPTIONS: { mode: UxMode; title: string; body: string }[] = [
  {
    mode: "traditional",
    title: "TRADITIONAL UX",
    body: "Buttons and taps across the app. The games keep their gestures.",
  },
  {
    mode: "legacy",
    title: "LEGACY UX",
    body: "Cardinal's original hold, swipe and drag gestures. No buttons.",
  },
];

/**
 * Shown once, straight after sign-up. No mode exists yet, so this screen is
 * the one place in the app that can only use plain taps, whichever way the
 * choice goes.
 */
export default function UxModeChoice() {
  const { completeUxChoice } = useAuth();
  const [choice, setChoice] = useState<UxMode | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const confirm = async () => {
    if (!choice || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await completeUxChoice(choice);
    } catch {
      setFailed(true);
      setBusy(false);
    }
  };

  return (
    <AuthScreen
      eyebrow="ONE LAST THING"
      title="Choose how Cardinal feels."
      subtitle="Pick how you want to move around the app."
      footer={<Text style={styles.footnote}>You can change this any time in Settings.</Text>}
    >
      {OPTIONS.map((option) => {
        const selected = choice === option.mode;
        return (
          <Pressable
            key={option.mode}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={`${option.title}. ${option.body}`}
            onPress={() => {
              selection();
              setChoice(option.mode);
            }}
            style={({ pressed }) => [
              styles.card,
              selected && styles.cardSelected,
              pressed && styles.cardPressed,
            ]}
          >
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>{option.title}</Text>
              <Text style={styles.cardBody}>{option.body}</Text>
            </View>
            <View style={[styles.radio, selected && styles.radioSelected]}>
              {selected && <View style={styles.radioDot} />}
            </View>
          </Pressable>
        );
      })}
      {failed && <AuthNotice>Couldn&apos;t save your choice. Try again.</AuthNotice>}
      <AuthButton label="CONTINUE" onPress={confirm} disabled={!choice || busy} />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: Radius.card,
    borderWidth: 2,
    borderColor: "transparent",
    backgroundColor: Theme.surface,
  },
  cardSelected: { borderColor: Theme.accentText },
  cardPressed: { opacity: 0.8 },
  cardText: { flex: 1, gap: Spacing.xs },
  cardTitle: {
    fontFamily: Fonts.bodyBold,
    fontSize: 18,
    letterSpacing: 1,
    color: Theme.text,
  },
  cardBody: {
    fontFamily: Fonts.body,
    fontSize: 15,
    lineHeight: 21,
    color: Theme.textMuted,
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Theme.textMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  radioSelected: { borderColor: Theme.accentText },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: Theme.accentText },
  footnote: {
    fontFamily: Fonts.body,
    fontSize: 14,
    color: Theme.textMuted,
    textAlign: "center",
  },
});
