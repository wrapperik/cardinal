import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Fonts, Theme } from "@/constants/theme";
import { useAuth } from "@/features/auth/auth-provider";
import { AuthField } from "@/features/auth/auth-field";
import {
  AuthButton,
  AuthDivider,
  AuthLink,
  AuthNotice,
  AuthScreen,
} from "@/features/auth/auth-screen";
import { getAuthErrorMessage } from "@/features/auth/errors";
import {
  validateSignIn,
  type AuthFieldErrors,
} from "@/features/auth/validation";

export default function SignIn() {
  const router = useRouter();
  const { sendPasswordReset, signIn, signInWithGoogle } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<AuthFieldErrors>({});
  const [message, setMessage] = useState<{
    text: string;
    tone: "error" | "success";
  } | null>(null);
  const [busy, setBusy] = useState<"email" | "google" | "reset" | null>(null);

  const submitEmail = async () => {
    const nextErrors = validateSignIn({ email, password });
    setErrors(nextErrors);
    setMessage(null);
    if (Object.keys(nextErrors).length) return;

    setBusy("email");
    try {
      await signIn(email, password);
    } catch (error) {
      setMessage({ text: getAuthErrorMessage(error), tone: "error" });
      setBusy(null);
    }
  };

  const submitGoogle = async () => {
    setMessage(null);
    setBusy("google");
    try {
      const user = await signInWithGoogle();
      if (!user) setBusy(null);
    } catch (error) {
      setMessage({ text: getAuthErrorMessage(error), tone: "error" });
      setBusy(null);
    }
  };

  const requestReset = async () => {
    const emailError = validateSignIn({ email, password: "valid" }).email;
    setErrors((current) => ({ ...current, email: emailError }));
    setMessage(null);
    if (emailError) return;

    setBusy("reset");
    try {
      await sendPasswordReset(email);
      setMessage({
        text: "Password reset sent. Check your inbox.",
        tone: "success",
      });
    } catch (error) {
      setMessage({ text: getAuthErrorMessage(error), tone: "error" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <AuthScreen
      eyebrow="WELCOME BACK"
      title="Pick up where you left off."
      subtitle="Your decks and progress are ready when you are."
      footer={
        <View style={styles.footerRow}>
          <Text style={styles.footerCopy}>New to Cardinal?</Text>
          <AuthLink label="CREATE ACCOUNT" onPress={() => router.replace("/sign-up")} />
        </View>
      }
    >
      <AuthField
        label="EMAIL"
        value={email}
        error={errors.email}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        keyboardType="email-address"
        returnKeyType="next"
        onChangeText={setEmail}
      />
      <AuthField
        label="PASSWORD"
        value={password}
        error={errors.password}
        secret
        autoCapitalize="none"
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="done"
        onChangeText={setPassword}
        onSubmitEditing={submitEmail}
      />
      <View style={styles.resetRow}>
        <AuthLink
          label={busy === "reset" ? "SENDING…" : "FORGOT PASSWORD?"}
          muted
          onPress={requestReset}
        />
      </View>
      {message ? <AuthNotice tone={message.tone}>{message.text}</AuthNotice> : null}
      <AuthButton
        label={busy === "email" ? "SIGNING IN…" : "SIGN IN"}
        disabled={busy !== null}
        onPress={submitEmail}
      />
      <AuthDivider />
      <AuthButton
        label={busy === "google" ? "CONNECTING…" : "CONTINUE WITH GOOGLE"}
        variant="google"
        disabled={busy !== null}
        onPress={submitGoogle}
      />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  resetRow: { alignItems: "flex-end", marginTop: -4 },
  footerRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  footerCopy: { fontFamily: Fonts.body, fontSize: 14, color: Theme.textMuted },
});
