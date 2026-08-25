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
import { ReduceMotion, ReducedMotionConfig } from 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Theme } from '@/constants/theme';
import { AuthGate } from '@/features/auth/auth-gate';
import { AuthProvider } from '@/features/auth/auth-provider';
import { useReducedMotion } from '@/lib/accessibility';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const reducedMotion = useReducedMotion();
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
            <ReducedMotionConfig mode={reducedMotion ? ReduceMotion.Always : ReduceMotion.Never} />
            <StatusBar style="light" />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: Theme.background },
                // Explicit rather than left to the platform default, so iOS
                // and Android push the same way. Left, not right, so a
                // screen popped by the back button exits opposite its
                // right-pointing chevron rather than the platform-default
                // rightward pop.
                animation: reducedMotion ? 'none' : 'slide_from_left',
                // Leaving a screen is a deliberate hold on a visible button
                // now, not a swipe. An edge swipe left on to pop a game
                // mid-run would discard it on an accidental brush.
                gestureEnabled: false,
              }}
            >
              <Stack.Screen name="sign-up" options={{ animation: reducedMotion ? 'none' : 'fade' }} />
              <Stack.Screen name="sign-in" options={{ animation: reducedMotion ? 'none' : 'fade' }} />
              {/* The one screen that reverses the app's push direction: it
                  reads as a panel sliding over home from the right, so its
                  BackButton sits on the left with a left-pointing chevron
                  (side="left" direction="left" in settings.tsx) and popping
                  it slides back out to the right it came from. */}
              <Stack.Screen name="settings" options={{ animation: reducedMotion ? 'none' : 'slide_from_right' }} />
              {/* Dispatcher only — it replaces itself before anything is ever
                  visible, so animating it in would slide a blank charcoal
                  screen into view for a beat before the game it hands off to
                  slides in on top of that. */}
              <Stack.Screen name="recap" options={{ animation: 'none' }} />
              {/* The one screen presented as a sheet rather than pushed: it
                  rises from the bottom over a dimmed home rather than
                  sliding in from the side, so leaving it reads as closing a
                  popup, not backing out of a place. Rendered fully
                  transparent — BottomSheet inside upload.tsx draws and
                  animates the backdrop and card itself rather than using
                  the platform's own sheet presentation, so animation stays
                  'none' here and contentStyle drops the opaque background
                  the rest of the stack paints behind every other screen.
                  gestureEnabled stays false (inherited above): the sheet's
                  own grabber is the only way to drag it closed, so a native
                  edge-swipe can't dismiss it and skip the discard
                  confirmation the grabber's onRequestClose routes through. */}
              <Stack.Screen
                name="upload"
                options={{
                  presentation: 'transparentModal',
                  animation: 'none',
                  contentStyle: { backgroundColor: 'transparent' },
                }}
              />
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
