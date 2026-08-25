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
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Theme } from '@/constants/theme';
import { AuthGate } from '@/features/auth/auth-gate';
import { AuthProvider } from '@/features/auth/auth-provider';

SplashScreen.preventAutoHideAsync();

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
        <AuthProvider>
          <View style={styles.viewport}>
            <StatusBar style="light" />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: Theme.background },
                // Explicit rather than left to the platform default, so iOS
                // and Android push the same way. Left, not right: the back
                // button's chevron always points left, so a screen popped by
                // it should exit the way that arrow points rather than the
                // platform-default rightward pop.
                animation: 'slide_from_left',
                // Leaving a screen is a deliberate hold on a visible button
                // now, not a swipe. An edge swipe left on to pop a game
                // mid-run would discard it on an accidental brush.
                gestureEnabled: false,
              }}
            >
              <Stack.Screen name="sign-up" options={{ animation: 'fade' }} />
              <Stack.Screen name="sign-in" options={{ animation: 'fade' }} />
              {/* Dispatcher only — it replaces itself before anything is ever
                  visible, so animating it in would slide a blank charcoal
                  screen into view for a beat before the game it hands off to
                  slides in on top of that. */}
              <Stack.Screen name="recap" options={{ animation: 'none' }} />
            </Stack>
            <AuthGate />
          </View>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  viewport: {
    flex: 1,
    overflow: 'hidden',
  },
});
