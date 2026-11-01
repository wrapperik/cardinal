import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";

import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { ListActionRow, ListGroup, ListInfoRow } from "@/components/grouped-list";
import { PageEmpty, PageScaffold } from "@/components/page-scaffold";
import { TextPromptDialog } from "@/components/text-prompt-dialog";
import { notification, NotificationFeedbackType } from "@/lib/haptics";
import { isValidTitle } from "@/features/upload/course-rules";
import {
  deleteCourse,
  renameCourse,
  useCourses,
} from "@/features/upload/courses";
import { deleteDecksForCourse } from "@/features/upload/decks";
import { deleteProgressForDecks } from "@/features/progress/progress";
import { clearCheckpoint } from "@/features/recap/checkpoints";

/** How long the rename confirmation holds in the NAME group's footer —
 *  same beat as upload.tsx's SAVED_HOLD_MS, just not followed by a
 *  navigation: the page stays put with its other rows below. */
const CONFIRM_HOLD_MS = 1400;

/**
 * The COURSE SETTINGS destination: rename, upload more material, or
 * deliberately remove a custom course. Renaming opens a prompt from the
 * NAME row, the same pattern settings uses for the account name, rather
 * than keeping a text field open on the page.
 */
export default function CourseSettings() {
  const router = useRouter();
  const { courseId } = useLocalSearchParams<{ courseId?: string }>();
  const courses = useCourses();
  const course = courseId ? courses.find((c) => c.id === courseId) : undefined;

  const [renaming, setRenaming] = useState(false);
  const [renamed, setRenamed] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    if (!renamed) return;
    notification(NotificationFeedbackType.Success);
    const timer = setTimeout(() => setRenamed(false), CONFIRM_HOLD_MS);
    return () => clearTimeout(timer);
  }, [renamed]);

  if (!course) {
    return (
      <PageScaffold title="COURSE SETTINGS">
        <PageEmpty title="COURSE NOT FOUND" message="RETURN HOME TO CHOOSE A COURSE." />
      </PageScaffold>
    );
  }

  return (
    <PageScaffold title="COURSE SETTINGS" subtitle={course.title}>
      <ListGroup
        title="NAME"
        footer={renamed ? "Course renamed." : course.seeded ? "Sample courses keep their names." : undefined}
      >
        {course.seeded ? (
          <ListInfoRow icon="pencil" label="TITLE" value={course.title} />
        ) : (
          <ListActionRow icon="pencil" label="TITLE" value={course.title} onPress={() => setRenaming(true)} />
        )}
      </ListGroup>

      <ListGroup title="MATERIAL">
        <ListActionRow
          icon="upload"
          label="UPLOAD INTO THIS COURSE"
          onPress={() => router.push({ pathname: "/upload", params: { courseId: course.id } })}
        />
      </ListGroup>

      <ListGroup footer={course.seeded ? "Sample courses can't be deleted." : undefined}>
        {course.seeded ? (
          <ListInfoRow icon="trash" label="DELETE COURSE" />
        ) : (
          <ListActionRow icon="trash" label="DELETE COURSE" destructive onPress={() => setConfirmDelete(true)} />
        )}
      </ListGroup>

      <TextPromptDialog
        visible={renaming}
        title="RENAME COURSE"
        placeholder="COURSE TITLE"
        confirmLabel="SAVE"
        initialValue={course.title}
        isValid={isValidTitle}
        onCancel={() => setRenaming(false)}
        onConfirm={(title) => {
          setRenaming(false);
          renameCourse(course.id, title);
          setRenamed(true);
        }}
      />
      <ConfirmationDialog
        visible={confirmDelete}
        title="DELETE COURSE?"
        message={`This removes ${course.title}, its uploaded decks, and its saved progress.`}
        confirmLabel="DELETE"
        confirmIcon="trash"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          if (course.seeded) return;
          setConfirmDelete(false);
          const deckIds = deleteDecksForCourse(course.id);
          deleteProgressForDecks(deckIds);
          clearCheckpoint(course.id);
          deleteCourse(course.id);
          router.replace("/home");
        }}
      />
    </PageScaffold>
  );
}
