import { usePathname, useRootNavigationState, useRouter } from "expo-router";
import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Fonts, Theme } from "@/constants/theme";
import { useAuth } from "@/features/auth/auth-provider";
import { getAuthDestination } from "@/features/auth/routing";

/**
 * Kept beside (rather than around) the root navigator. That way the navigator
 * remains mounted while a protected-route redirect is dispatched.
 */
export function AuthGate() {
  const pathname = usePathname();
  const router = useRouter();
  const navigationState = useRootNavigationState();
  const { initializing, onboarded, user } = useAuth();
  const destination = getAuthDestination({
    pathname,
    onboarded,
    signedIn: user !== null,
  });

  useEffect(() => {
    if (navigationState?.key && !initializing && destination) {
      router.replace(destination);
    }
  }, [destination, initializing, navigationState?.key, router]);

  if (initializing || destination) {
    return (
      <View style={styles.loading}>
        <Text style={styles.wordmark}>CARDINAL</Text>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  loading: {
    ...StyleSheet.absoluteFillObject,
    flex: 1,
    zIndex: 10,
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
