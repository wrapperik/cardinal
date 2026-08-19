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
