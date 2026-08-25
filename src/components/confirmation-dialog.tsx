import { Modal, Pressable, StyleSheet, Text } from "react-native";

import { SwipeAction } from "@/components/swipe-action";
import { Fonts, Radius, Spacing, Theme } from "@/constants/theme";

interface Props {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmationDialog({ visible, title, message, confirmLabel, cancelLabel = "KEEP IT", onConfirm, onCancel }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel} accessibilityRole="button" accessibilityLabel="CANCEL">
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <SwipeAction label={confirmLabel} tone="destructive" onConfirm={onConfirm} />
          <SwipeAction label={cancelLabel} direction="left" tone="calm" onConfirm={onCancel} />
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
});
