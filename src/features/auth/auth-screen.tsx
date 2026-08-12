import * as Haptics from "expo-haptics";
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

import { Colors, Fonts, Spacing, Theme } from "@/constants/theme";
import { GoogleMark } from "@/features/auth/google-mark";

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
  variant?: "primary" | "google";
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
    <Text style={[styles.notice, tone === "success" && styles.noticeSuccess]}>
      {children}
    </Text>
  );
}

export function AuthButton({
  label,
  onPress,
  disabled = false,
  variant = "primary",
}: AuthButtonProps) {
  const scale = useRef(new Animated.Value(1)).current;

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
          variant === "primary" ? styles.primaryButton : styles.googleButton,
          disabled && styles.buttonDisabled,
        ]}
      >
        {variant === "google" && <GoogleMark />}
        <Text
          style={[
            styles.buttonText,
            variant === "google" && styles.googleButtonText,
          ]}
        >
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

export function AuthDivider() {
  return (
    <View style={styles.dividerRow}>
      <View style={styles.divider} />
      <Text style={styles.dividerText}>OR</Text>
      <View style={styles.divider} />
    </View>
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
    color: Colors.rust,
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
  googleButton: { backgroundColor: Colors.bone },
  buttonDisabled: { opacity: 0.45 },
  buttonText: {
    fontFamily: Fonts.bodyBold,
    fontSize: 15,
    letterSpacing: 0.6,
    color: Colors.bone,
  },
  googleButtonText: { color: Theme.surface },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginVertical: Spacing.xs,
  },
  divider: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: Theme.glassEdge },
  dividerText: {
    fontFamily: Fonts.bodyBold,
    fontSize: 11,
    color: Theme.textMuted,
    letterSpacing: 1.5,
  },
  footer: { marginTop: "auto", paddingTop: Spacing.xl, alignItems: "center" },
  link: {
    fontFamily: Fonts.bodyBold,
    fontSize: 14,
    letterSpacing: 0.4,
    color: Colors.rust,
    textAlign: "center",
    paddingVertical: Spacing.xs,
  },
  linkMuted: { color: Theme.textMuted },
  linkPressed: { opacity: 0.55 },
  notice: {
    fontFamily: Fonts.body,
    fontSize: 14,
    lineHeight: 19,
    color: Theme.incorrect,
    textAlign: "center",
    marginVertical: Spacing.xs,
  },
  noticeSuccess: { color: Theme.text },
});
