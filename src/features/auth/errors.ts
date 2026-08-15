const AUTH_ERROR_MESSAGES: Record<string, string> = {
  "auth/invalid-credential": "That email or password isn't right.",
  "auth/user-not-found": "That email or password isn't right.",
  "auth/wrong-password": "That email or password isn't right.",
  "auth/email-already-in-use": "An account already uses that email.",
  "auth/invalid-email": "Enter a valid email.",
  "auth/weak-password": "Use at least 6 characters.",
  "auth/network-request-failed":
    "You're offline. Check your connection and try again.",
  "auth/too-many-requests": "Too many attempts. Wait a moment and try again.",
  "auth/popup-closed-by-user": "Google sign-in was closed before it finished.",
  "auth/google-not-configured":
    "Google sign-in still needs its client ID. Check the app configuration.",
  "auth/google-missing-token":
    "Google couldn't complete sign-in. Please try again.",
  "auth/google-needs-dev-build":
    "Google sign-in needs a development build. Use email here in Expo Go.",
};

export function getAuthErrorMessage(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return (
      AUTH_ERROR_MESSAGES[error.code] ??
      "Something went wrong. Please try again."
    );
  }

  return "Something went wrong. Please try again.";
}
