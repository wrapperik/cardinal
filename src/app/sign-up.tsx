import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Fonts, Theme } from "@/constants/theme";
import { useAuth } from "@/features/auth/auth-provider";
import { AuthField } from "@/features/auth/auth-field";
import {
  AuthButton,
  AuthLink,
  AuthNotice,
  AuthScreen,
} from "@/features/auth/auth-screen";
import { getAuthErrorMessage } from "@/features/auth/errors";
import {
  validateSignUp,
  type AuthFieldErrors,
} from "@/features/auth/validation";

export default function SignUp() {
  const router = useRouter();
  const { signUp } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<AuthFieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<"email" | null>(null);

  const submitEmail = async () => {
    const nextErrors = validateSignUp({ name, email, password });
    setErrors(nextErrors);
    setMessage(null);
    if (Object.keys(nextErrors).length) return;

    setBusy("email");
    try {
      await signUp(name, email, password);
    } catch (error) {
      setMessage(getAuthErrorMessage(error));
      setBusy(null);
    }
  };

  return (
    <AuthScreen
      eyebrow="YOUR REVISION, REMEMBERED"
      title="Create your account."
      subtitle="Keep your decks, streak and progress with you wherever you revise."
      footer={
        <View style={styles.footerRow}>
          <Text style={styles.footerCopy}>Already have an account?</Text>
          <AuthLink label="SIGN IN" onPress={() => router.replace("/sign-in")} />
        </View>
      }
    >
      <AuthField
        label="NAME"
        value={name}
        error={errors.name}
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
        returnKeyType="next"
        onChangeText={setName}
      />
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
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="done"
        onChangeText={setPassword}
        onSubmitEditing={submitEmail}
      />
      {message ? <AuthNotice>{message}</AuthNotice> : null}
      <AuthButton
        label={busy === "email" ? "CREATING ACCOUNT…" : "CREATE ACCOUNT"}
        disabled={busy !== null}
        onPress={submitEmail}
      />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  footerRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  footerCopy: { fontFamily: Fonts.body, fontSize: 14, color: Theme.textMuted },
});
