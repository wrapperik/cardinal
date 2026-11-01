import { useState } from "react";

import { ListActionRow, ListChoiceRow, ListGroup } from "@/components/grouped-list";
import { TextPromptDialog } from "@/components/text-prompt-dialog";
import type { Course } from "@/features/upload/types";

interface Props {
  courses: Course[];
  selectedId: string | null;
  suggestedId?: string | null;
  onSelect: (id: string) => void;
  onCreate: (title: string) => void;
  /** Muted line under the card — what happens if nothing is picked, or the model's suggestion. */
  footer?: string;
}

/** The COURSE group: one row per course to file the upload under, plus a row to name a new one. */
export function DestinationPicker({ courses, selectedId, suggestedId = null, onSelect, onCreate, footer }: Props) {
  const [dialogVisible, setDialogVisible] = useState(false);

  // Seeded courses are the shipped demo decks — they can't be renamed, and
  // uploaded material doesn't belong filed under a tutorial course.
  const selectable = courses.filter((course) => !course.seeded);

  return (
    <>
      <ListGroup title="COURSE" footer={footer}>
        {selectable.map((course) => (
          <ListChoiceRow
            key={course.id}
            label={course.title}
            detail={course.id === suggestedId ? "SUGGESTED" : undefined}
            selected={course.id === selectedId}
            onSelect={() => onSelect(course.id)}
          />
        ))}
        <ListActionRow icon="plus" label="NEW COURSE" onPress={() => setDialogVisible(true)} />
      </ListGroup>
      <TextPromptDialog
        visible={dialogVisible}
        title="NEW COURSE"
        placeholder="COURSE TITLE"
        confirmLabel="CREATE"
        confirmIcon="plus"
        onConfirm={(title) => {
          setDialogVisible(false);
          onCreate(title);
        }}
        onCancel={() => setDialogVisible(false)}
      />
    </>
  );
}
