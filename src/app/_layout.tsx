import {
  Afacad_400Regular,
  Afacad_500Medium,
  Afacad_700Bold,
} from '@expo-google-fonts/afacad';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Theme } from '@/constants/theme';

SplashScreen.preventAutoHideAsync();

/** Shared by every game route, so the two can never drift apart. */
const GAME_SCREEN = { animation: 'none', gestureEnabled: false } as const;

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Afacad_400Regular,
    Afacad_500Medium,
    Afacad_700Bold,
    // The wordmark face, bundled from assets/fonts rather than fetched.
    // Registered as `Display` so screens reference the token, not the filename.
    Display: require('../../assets/fonts/LEDDotMatrix-400.ttf'),
  });

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: Theme.background },
            // Exiting is a swipe, never a tap — keep gesture dismissal on.
            gestureEnabled: true,
          }}
        >
          {/* Every game animates itself, in both directions: its exit tab drags
              home in over the top. Leaving the stack's own push/pop animation
              on would play a second slide over that one — hence 'none', and no
              edge-swipe to race it. */}
          <Stack.Screen name="quiz" options={GAME_SCREEN} />
          <Stack.Screen name="true-false" options={GAME_SCREEN} />
          <Stack.Screen name="sequence" options={GAME_SCREEN} />
          <Stack.Screen name="match" options={GAME_SCREEN} />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
