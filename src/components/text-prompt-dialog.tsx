import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput } from "react-native";

import { SwipeAction } from "@/components/swipe-action";
import { Fonts, Radius, Spacing, Theme } from "@/constants/theme";

interface Props {
  visible: boolean;
  title: string;
  placeholder: string;
  confirmLabel: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

/** A single free-text prompt, modelled on ConfirmationDialog's modal/backdrop/card shell. */
export function TextPromptDialog({ visible, title, placeholder, confirmLabel, onConfirm, onCancel }: Props) {
  const [value, setValue] = useState("");

  // Cleared on every open rather than on close, so the field can't flash the
  // previous attempt's text for a frame while the dialog fades out.
  useEffect(() => {
    if (visible) setValue("");
  }, [visible]);

  const trimmed = value.trim();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel} accessibilityRole="button" accessibilityLabel="CANCEL">
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>{title}</Text>
          <TextInput
            value={value}
            onChangeText={setValue}
            placeholder={placeholder}
            placeholderTextColor={Theme.textMuted}
            autoFocus
            returnKeyType="done"
            selectionColor={Theme.accent}
            style={styles.input}
          />
          <SwipeAction label={confirmLabel} tone="accent" disabled={trimmed.length === 0} onConfirm={() => onConfirm(trimmed)} />
          <SwipeAction label="CANCEL" direction="left" tone="calm" onConfirm={onCancel} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "center", padding: Spacing.lg, backgroundColor: "rgba(0,0,0,0.65)" },
  card: { borderRadius: Radius.card, backgroundColor: Theme.background, padding: Spacing.lg, gap: Spacing.md },
  title: { fontFamily: Fonts.display, fontSize: 30, letterSpacing: 1.5, color: Theme.text },
  input: { minHeight: 48, borderRadius: Radius.card, backgroundColor: Theme.surface, paddingHorizontal: Spacing.md, fontFamily: Fonts.bodyMedium, fontSize: 14, color: Theme.text },
});
