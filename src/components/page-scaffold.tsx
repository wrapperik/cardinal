import { useRouter } from "expo-router";
import { type ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BackButton } from "@/components/back-button";
import { HOLD_BUTTON_SIZE } from "@/components/hold-button";
import type { IconName } from "@/components/icons";
import { SwipeAction } from "@/components/swipe-action";
import { Fonts, Radius, Spacing, Theme } from "@/constants/theme";

/**
 * The frame every pushed sub-page shares — settings, progress, topics,
 * course settings, the admin dashboard: a fixed title bar centred on the
 * BACK button's row, and a scroll of grouped cards underneath it (see
 * components/grouped-list).
 *
 * The page's own name goes in the bar; whatever it's about (a course's
 * title, the dashboard's freshness) goes in `subtitle` beneath it, so a long
 * user-supplied course title never has to fight the page name for one line.
 */
export function PageScaffold({
  title,
  subtitle,
  backSide = "right",
  keyboardAware = false,
  children,
}: {
  title: string;
  subtitle?: string;
  /** Settings slides in from the right, so its BACK sits left and points left. */
  backSide?: "left" | "right";
  /** For pages with a text field, so the keyboard doesn't cover it. */
  keyboardAware?: boolean;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const barHeight = insets.top + Spacing.md + HOLD_BUTTON_SIZE + Spacing.sm;

  const scroll = (
    <ScrollView
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        paddingTop: barHeight,
        paddingHorizontal: Spacing.md,
        // Clears the home indicator, so the last row is never sitting in the
        // strip iOS reserves for its own gesture.
        paddingBottom: insets.bottom + Spacing.xl,
      }}
    >
      {children}
    </ScrollView>
  );

  return (
    <View style={styles.container}>
      {keyboardAware ? (
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.container}>
          {scroll}
        </KeyboardAvoidingView>
      ) : scroll}

      {/* Opaque so the groups scroll under it rather than through the title. */}
      <View style={[styles.bar, { height: barHeight, paddingTop: insets.top + Spacing.md }]}>
        <View style={styles.titleBlock}>
          <Text
            style={styles.title}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            accessibilityRole="header"
          >
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>

      <BackButton
        label="BACK"
        side={backSide}
        direction={backSide === "left" ? "left" : "right"}
        onBack={() => router.back()}
      />
    </View>
  );
}

/**
 * A page with nothing to list yet — no cards, no access, a failed load. A
 * centred note in a card rather than a giant heading, since the bar above
 * already names the page.
 */
export function PageEmpty({
  title,
  message,
  actionLabel,
  actionIcon,
  onAction,
}: {
  title: string;
  message: string;
  actionLabel?: string;
  actionIcon?: IconName;
  onAction?: () => void;
}) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyMessage}>{message}</Text>
      {actionLabel && onAction ? (
        <View style={styles.emptyAction}>
          <SwipeAction label={actionLabel} icon={actionIcon} tone="accent" onConfirm={onAction} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.background,
  },
  bar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    backgroundColor: Theme.background,
  },
  // Inset past the BACK button on both sides, so a long title shrinks
  // instead of running under it, and stays centred either way.
  titleBlock: {
    height: HOLD_BUTTON_SIZE,
    alignSelf: "stretch",
    marginHorizontal: Spacing.md + HOLD_BUTTON_SIZE + Spacing.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontFamily: Fonts.display,
    color: Theme.text,
    letterSpacing: 2,
    fontSize: 24,
  },
  subtitle: {
    marginTop: 2,
    fontFamily: Fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 1.5,
    color: Theme.textMuted,
  },
  empty: {
    marginTop: Spacing.lg,
    padding: Spacing.lg,
    borderRadius: Radius.card,
    backgroundColor: "rgba(217, 217, 217, 0.06)",
    alignItems: "center",
    gap: Spacing.sm,
  },
  emptyTitle: {
    fontFamily: Fonts.bodyBold,
    fontSize: 18,
    letterSpacing: 1,
    color: Theme.text,
    textAlign: "center",
  },
  emptyMessage: {
    fontFamily: Fonts.body,
    fontSize: 15,
    lineHeight: 21,
    color: Theme.textMuted,
    textAlign: "center",
  },
  emptyAction: { alignSelf: "stretch", marginTop: Spacing.sm },
});
