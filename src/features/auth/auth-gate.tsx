import { usePathname, useRouter } from "expo-router";
import { useEffect, type PropsWithChildren } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Fonts, Theme } from "@/constants/theme";
import { useAuth } from "@/features/auth/auth-provider";
import { getAuthDestination } from "@/features/auth/routing";

export function AuthGate({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const router = useRouter();
  const { initializing, onboarded, user } = useAuth();
  const visualQa = process.env.EXPO_PUBLIC_VISUAL_QA === "1";
  const destination = getAuthDestination({
    pathname,
    onboarded,
    signedIn: user !== null,
  });

  useEffect(() => {
    if (!visualQa && !initializing && destination) router.replace(destination);
  }, [destination, initializing, router, visualQa]);

  // Local visual-QA instrumentation; removed after protected route inspection.
  if (visualQa) return children;

  if (initializing || destination) {
    return (
      <View style={styles.loading}>
        <Text style={styles.wordmark}>CARDINAL</Text>
      </View>
    );
  }

  return children;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.background,
  },
  wordmark: {
    color: Theme.accent,
    fontFamily: Fonts.display,
    fontSize: 36,
    letterSpacing: 2,
  },
});
