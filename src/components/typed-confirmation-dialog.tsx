import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { SwipeAction } from "@/components/swipe-action";
import { Fonts, Radius, Spacing, Theme } from "@/constants/theme";
import { matchesTypedConfirmation } from "@/components/typed-confirmation";

interface Props {
  visible: boolean;
  title: string;
  message: string;
  confirmation: string;
  confirmLabel: string;
  submitting?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/** A typed phrase makes an irreversible action explicit before its final swipe. */
export function TypedConfirmationDialog({
  visible,
  title,
  message,
  confirmation,
  confirmLabel,
  submitting = false,
  error = null,
  onConfirm,
  onCancel,
}: Props) {
  const [value, setValue] = useState("");
  const confirmed = matchesTypedConfirmation(value, confirmation);

  function cancel() {
    setValue("");
    onCancel();
  }

  function confirm() {
    if (!confirmed || submitting) return;
    onConfirm();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={cancel}>
      <Pressable style={styles.backdrop} onPress={cancel} accessibilityRole="button" accessibilityLabel="CANCEL">
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.inputGroup}>
            <Text style={styles.prompt}>TYPE {confirmation} TO CONTINUE</Text>
            <TextInput
              value={value}
              onChangeText={setValue}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!submitting}
              placeholder={confirmation}
              placeholderTextColor={Theme.textMuted}
              style={styles.input}
              accessibilityLabel={`TYPE ${confirmation} TO CONFIRM`}
            />
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <SwipeAction label={submitting ? "DELETING..." : confirmLabel} tone="destructive" disabled={!confirmed || submitting} onConfirm={confirm} />
          <SwipeAction label="CANCEL" direction="left" tone="calm" disabled={submitting} onConfirm={cancel} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "center", padding: Spacing.lg, backgroundColor: "rgba(0,0,0,0.65)" },
  card: { borderRadius: Radius.card, backgroundColor: Theme.background, padding: Spacing.lg, gap: Spacing.md },
  title: { fontFamily: Fonts.display, fontSize: 30, letterSpacing: 1.5, color: Theme.text },
  message: { fontFamily: Fonts.body, fontSize: 15, lineHeight: 22, color: Theme.textMuted },
  inputGroup: { gap: Spacing.xs },
  prompt: { fontFamily: Fonts.bodyBold, fontSize: 11, letterSpacing: 1.1, color: Theme.textMuted },
  input: {
    height: 52,
    borderRadius: Radius.card,
    paddingHorizontal: Spacing.md,
    color: Theme.text,
    backgroundColor: Theme.surface,
    fontFamily: Fonts.bodyBold,
    fontSize: 16,
    letterSpacing: 1,
  },
  error: { fontFamily: Fonts.bodyBold, fontSize: 11, color: Theme.incorrect },
});
