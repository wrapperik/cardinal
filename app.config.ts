import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * Static config still lives in app.json. This wrapper exists only to register
 * the Google Sign-In plugin, which needs the reversed iOS client ID from .env —
 * a value app.json cannot read. Without the plugin the native build has no URL
 * scheme for Google to hand the session back through, so sign-in returns to a
 * still-signed-out app.
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: config.name ?? "Cardinal",
  slug: config.slug ?? "cardinal",
  plugins: [
    ...(config.plugins ?? []),
    [
      "@react-native-google-signin/google-signin",
      { iosUrlScheme: process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME },
    ],
  ],
});
