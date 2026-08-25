import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { ChoiceList } from "@/components/choice-list";
import { SwipeAction } from "@/components/swipe-action";
import { TextPromptDialog } from "@/components/text-prompt-dialog";
import { Spacing } from "@/constants/theme";
import type { Course } from "@/features/upload/types";

interface Props {
  courses: Course[];
  selectedId: string | null;
  suggestedId?: string | null;
  onSelect: (id: string) => void;
  onCreate: (title: string) => void;
}

/** A stable list of explicit choices, replacing the index-from-drag picker. */
export function DestinationPicker({ courses, selectedId, suggestedId = null, onSelect, onCreate }: Props) {
  const [dialogVisible, setDialogVisible] = useState(false);

  // Seeded courses are the shipped demo decks — they can't be renamed, and
  // uploaded material doesn't belong filed under a tutorial course.
  const selectable = courses.filter((course) => !course.seeded);

  return (
    <View style={styles.wrap}>
      <ChoiceList
        options={selectable.map((course) => ({ value: course.id, label: course.title }))}
        value={selectedId}
        suggestedValue={suggestedId}
        onChange={onSelect}
      />
      <SwipeAction label="+ NEW COURSE" hint="SWIPE RIGHT" onConfirm={() => setDialogVisible(true)} />
      <TextPromptDialog
        visible={dialogVisible}
        title="NEW COURSE"
        placeholder="COURSE TITLE"
        confirmLabel="CREATE"
        onConfirm={(title) => {
          setDialogVisible(false);
          onCreate(title);
        }}
        onCancel={() => setDialogVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.md },
});
