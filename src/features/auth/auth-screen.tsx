import { useRef, type PropsWithChildren, type ReactNode } from "react";
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { InlineError } from "@/components/inline-error";
import { Colors, Fonts, Spacing, Theme } from "@/constants/theme";
import { impact, ImpactFeedbackStyle } from "@/lib/haptics";

interface AuthScreenProps extends PropsWithChildren {
  eyebrow: string;
  title: string;
  subtitle: string;
  footer: ReactNode;
}

export function AuthScreen({
  eyebrow,
  title,
  subtitle,
  children,
  footer,
}: AuthScreenProps) {
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.screen}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + Spacing.lg,
            paddingBottom: insets.bottom + Spacing.lg,
          },
        ]}
      >
        <Text style={styles.wordmark}>CARDINAL</Text>
        <View style={styles.intro}>
          <Text style={styles.eyebrow}>{eyebrow}</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
        <View style={styles.form}>{children}</View>
        <View style={styles.footer}>{footer}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

interface AuthButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}

export function AuthLink({
  label,
  onPress,
  muted = false,
}: {
  label: string;
  onPress: () => void;
  muted?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => pressed && styles.linkPressed}
    >
      <Text style={[styles.link, muted && styles.linkMuted]}>{label}</Text>
    </Pressable>
  );
}

export function AuthNotice({
  children,
  tone = "error",
}: PropsWithChildren<{ tone?: "error" | "success" }>) {
  return (
    tone === "success" ? (
      <Text style={styles.notice}>{children}</Text>
    ) : (
      <InlineError centered style={styles.noticeError}>{children}</InlineError>
    )
  );
}

export function AuthButton({
  label,
  onPress,
  disabled = false,
}: AuthButtonProps) {
  const scale = useRef(new Animated.Value(1)).current;

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        onPress={() => {
          impact(ImpactFeedbackStyle.Light);
          onPress();
        }}
        onPressIn={() => {
          Animated.spring(scale, {
            toValue: 0.97,
            useNativeDriver: true,
            speed: 40,
            bounciness: 0,
          }).start();
        }}
        onPressOut={() => {
          Animated.spring(scale, {
            toValue: 1,
            useNativeDriver: true,
            speed: 30,
            bounciness: 4,
          }).start();
        }}
        style={[
          styles.button,
          styles.primaryButton,
          disabled && styles.buttonDisabled,
        ]}
      >
        <Text style={styles.buttonText}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Theme.background },
  scrollContent: {
    flexGrow: 1,
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
    paddingHorizontal: Spacing.lg,
  },
  wordmark: {
    fontFamily: Fonts.display,
    fontSize: 32,
    letterSpacing: 2,
    color: Colors.rust,
  },
  intro: { marginTop: 64, marginBottom: Spacing.xl },
  eyebrow: {
    fontFamily: Fonts.bodyBold,
    fontSize: 12,
    letterSpacing: 2,
    // A small rust tag: the accent fills the container, the text stays white.
    color: Theme.onAccent,
    backgroundColor: Colors.rust,
    alignSelf: "flex-start",
    overflow: "hidden",
    borderRadius: 999,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    marginBottom: Spacing.sm,
  },
  title: {
    fontFamily: Fonts.bodyBold,
    fontSize: 36,
    lineHeight: 40,
    color: Theme.text,
  },
  subtitle: {
    marginTop: Spacing.sm,
    maxWidth: 340,
    fontFamily: Fonts.body,
    fontSize: 16,
    lineHeight: 23,
    color: Theme.textMuted,
  },
  form: { gap: 12 },
  button: {
    height: 56,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: Spacing.lg,
  },
  primaryButton: { backgroundColor: Colors.rust },
  buttonDisabled: { opacity: 0.45 },
  buttonText: {
    fontFamily: Fonts.bodyBold,
    fontSize: 15,
    letterSpacing: 0.6,
    color: Theme.onAccent,
  },
  footer: { marginTop: "auto", paddingTop: Spacing.xl, alignItems: "center" },
  link: {
    fontFamily: Fonts.bodyBold,
    fontSize: 14,
    letterSpacing: 0.4,
    // White words, rust underline: the accent marks it as a link without
    // asking the dark rust to carry readable text.
    color: Theme.text,
    textDecorationLine: "underline",
    textDecorationColor: Colors.rust,
    textAlign: "center",
    paddingVertical: Spacing.xs,
  },
  linkMuted: { color: Theme.textMuted },
  linkPressed: { opacity: 0.55 },
  notice: {
    fontFamily: Fonts.body,
    fontSize: 14,
    lineHeight: 19,
    color: Theme.text,
    textAlign: "center",
    marginVertical: Spacing.xs,
  },
  noticeError: { marginVertical: Spacing.xs },
});
