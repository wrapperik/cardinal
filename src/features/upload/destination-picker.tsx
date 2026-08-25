import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { ChoiceList } from "@/components/choice-list";
import { Colors, Fonts, Radius, Spacing, Theme } from "@/constants/theme";
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
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const submit = () => {
    const next = title.trim();
    setCreating(false);
    setTitle("");
    if (next) onCreate(next);
  };

  return (
    <View style={styles.wrap}>
      <ChoiceList
        options={courses.map((course) => ({ value: course.id, label: course.title }))}
        value={selectedId}
        suggestedValue={suggestedId}
        onChange={onSelect}
      />
      {creating ? (
        <TextInput
          value={title}
          onChangeText={setTitle}
          onSubmitEditing={submit}
          onBlur={submit}
          placeholder="COURSE TITLE"
          placeholderTextColor={Theme.textMuted}
          autoFocus
          returnKeyType="done"
          selectionColor={Theme.accent}
          style={styles.input}
        />
      ) : (
        <Pressable onPress={() => setCreating(true)} style={({ pressed }) => [styles.newCourse, pressed && styles.pressed]}>
          <Text style={styles.newCourseLabel}>+ NEW COURSE</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.sm },
  newCourse: { minHeight: 48, borderRadius: Radius.card, backgroundColor: Theme.surface, justifyContent: "center", paddingHorizontal: Spacing.md },
  newCourseLabel: { fontFamily: Fonts.bodyBold, fontSize: 13, letterSpacing: 0.5, color: Colors.bone },
  input: { minHeight: 48, borderRadius: Radius.card, backgroundColor: Theme.surface, paddingHorizontal: Spacing.md, fontFamily: Fonts.bodyMedium, fontSize: 14, color: Theme.text },
  pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
});
