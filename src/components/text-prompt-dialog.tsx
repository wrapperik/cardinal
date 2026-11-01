import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput } from "react-native";

import type { IconName } from "@/components/icons";
import { ActionPair, SwipeAction } from "@/components/swipe-action";
import { Fonts, Radius, Spacing, Theme } from "@/constants/theme";

interface Props {
  visible: boolean;
  title: string;
  placeholder: string;
  confirmLabel: string;
  confirmIcon?: IconName;
  onConfirm: (value: string) => void;
  onCancel: () => void;
  /** Pre-fills the field, for editing an existing value rather than naming a new one. */
  initialValue?: string;
  /** Extra rule for enabling confirm beyond "not empty". */
  isValid?: (value: string) => boolean;
}

/** A single free-text prompt, modelled on ConfirmationDialog's modal/backdrop/card shell. */
export function TextPromptDialog({ visible, title, placeholder, confirmLabel, confirmIcon = "check", onConfirm, onCancel, initialValue = "", isValid }: Props) {
  const [value, setValue] = useState("");

  // Cleared on every open rather than on close, so the field can't flash the
  // previous attempt's text for a frame while the dialog fades out.
  useEffect(() => {
    if (visible) setValue(initialValue);
  }, [visible, initialValue]);

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
          <ActionPair
            primary={<SwipeAction label={confirmLabel} icon={confirmIcon} tone="accent" disabled={trimmed.length === 0 || (isValid ? !isValid(trimmed) : false)} onConfirm={() => onConfirm(trimmed)} />}
            secondary={<SwipeAction label="CANCEL" icon="close" direction="left" tone="calm" onConfirm={onCancel} />}
          />
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
