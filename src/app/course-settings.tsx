import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BackButton } from "@/components/back-button";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { HOLD_BUTTON_SIZE } from "@/components/hold-button";
import { Fonts, Spacing, Theme } from "@/constants/theme";
import { notification, NotificationFeedbackType } from "@/lib/haptics";
import { AuthField } from "@/features/auth/auth-field";
import { isValidTitle } from "@/features/upload/course-rules";
import {
  deleteCourse,
  renameCourse,
  useCourses,
} from "@/features/upload/courses";
import { deleteDecksForCourse } from "@/features/upload/decks";
import { deleteProgressForDecks } from "@/features/progress/progress";
import { clearCheckpoint } from "@/features/recap/checkpoints";
import { SwipeAction } from "@/features/upload/swipe-action";

const CONTENT_TOP_CLEARANCE = HOLD_BUTTON_SIZE + Spacing.lg;

/** How long the rename confirmation holds before it fades — same beat and
 *  duration as upload.tsx's SAVED_HOLD_MS, just not followed by a
 *  navigation: this screen keeps two more actions below it, so nothing
 *  here should hand the player back to home the way a one-shot upload does. */
const CONFIRM_HOLD_MS = 1400;

/**
 * The COURSE SETTINGS destination: rename, upload more material, or
 * deliberately remove a custom course.
 */
export default function CourseSettings() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { courseId } = useLocalSearchParams<{ courseId?: string }>();
  const courses = useCourses();
  const course = courseId ? courses.find((c) => c.id === courseId) : undefined;

  const [draft, setDraft] = useState(course?.title ?? "");
  const draftSeeded = useRef(false);
  // Seeds the draft once the real course is available rather than only at
  // mount — courses hydrate from AsyncStorage, then Firestore, so a read
  // taken on the very first render can still be stale for a course that
  // isn't a seed. Firing only once means a rename in progress is never
  // clobbered by a later hydration pass landing the same title again.
  useEffect(() => {
    if (!draftSeeded.current && course) {
      setDraft(course.title);
      draftSeeded.current = true;
    }
  }, [course]);

  const [renamed, setRenamed] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    if (!renamed) return;
    notification(NotificationFeedbackType.Success);
    const timer = setTimeout(() => setRenamed(false), CONFIRM_HOLD_MS);
    return () => clearTimeout(timer);
  }, [renamed]);

  return (
    <View style={styles.container}>
      {/* The one screen outside sign-in/sign-up with a text field on it, and
          the swipe that commits the edit sits directly beneath that field —
          so it needs the same keyboard handling auth-screen.tsx uses, or the
          keyboard covers the control the field exists to feed.
          keyboardShouldPersistTaps lets the SwipeAction take the gesture on
          the first touch instead of spending it dismissing the keyboard. */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.container}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingTop: insets.top + CONTENT_TOP_CLEARANCE,
            paddingHorizontal: Spacing.lg,
            // Clears the home indicator, so the UPLOAD swipe is never sitting
            // in the strip iOS reserves for its own gesture.
            paddingBottom: insets.bottom + Spacing.xl,
          }}
        >
          <Text style={styles.heading}>{course?.title ?? "—"}</Text>
          <Text style={styles.sectionLabel}>COURSE SETTINGS</Text>

          {course && (
            <>
              <RenameSection
                course={course}
                draft={draft}
                onDraftChange={setDraft}
                renamed={renamed}
                onRenamed={() => setRenamed(true)}
              />

              <Text style={styles.groupLabel}>UPLOAD</Text>
              <SwipeAction
                label="UPLOAD INTO THIS COURSE"
                hint="SWIPE RIGHT"
                tone="accent"
                onConfirm={() =>
                  router.push({
                    pathname: "/upload",
                    params: { courseId: course.id },
                  })
                }
              />

              <Text style={styles.groupLabel}>DELETE COURSE</Text>
              {course.seeded ? (
                <Text style={styles.note}>SAMPLE COURSES CAN&apos;T BE DELETED</Text>
              ) : (
                <SwipeAction
                  label="DELETE COURSE"
                  hint="SWIPE RIGHT"
                  tone="destructive"
                  onConfirm={() => setConfirmDelete(true)}
                />
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Sibling of the ScrollView, not inside it — same reasoning
          course/[id].tsx documents for its own tab. */}
      <BackButton label="BACK" side="right" onBack={() => router.back()} />
      <ConfirmationDialog
        visible={confirmDelete}
        title="DELETE COURSE?"
        message={`This removes ${course?.title ?? "this course"}, its uploaded decks, and its saved progress.`}
        confirmLabel="DELETE"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          if (!course || course.seeded) return;
          setConfirmDelete(false);
          const deckIds = deleteDecksForCourse(course.id);
          deleteProgressForDecks(deckIds);
          clearCheckpoint(course.id);
          deleteCourse(course.id);
          router.replace("/home");
        }}
      />
    </View>
  );
}

function RenameSection({
  course,
  draft,
  onDraftChange,
  renamed,
  onRenamed,
}: {
  course: { id: string; title: string; seeded: boolean };
  draft: string;
  onDraftChange: (value: string) => void;
  renamed: boolean;
  onRenamed: () => void;
}) {
  const locked = course.seeded;
  const canSave = !locked && isValidTitle(draft);

  return (
    <View>
      <Text style={styles.groupLabel}>RENAME</Text>
      <AuthField
        label="COURSE TITLE"
        value={draft}
        onChangeText={onDraftChange}
        editable={!locked}
        autoCapitalize="characters"
      />
      {locked && (
        <Text style={styles.note}>SAMPLE COURSES KEEP THEIR NAMES</Text>
      )}
      <View style={styles.gap} />
      {/* Swipe rather than a tappable button — SwipeAction's own doc
          comment covers why every commit in this app reads this way. */}
      <SwipeAction
        label="SAVE NAME"
        hint="SWIPE RIGHT"
        disabled={!canSave}
        onConfirm={() => {
          renameCourse(course.id, draft);
          onRenamed();
        }}
      />
      {renamed && <Text style={styles.confirm}>COURSE RENAMED</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.background,
  },
  heading: {
    fontFamily: Fonts.display,
    color: Theme.text,
    letterSpacing: 2,
    fontSize: 40,
  },
  sectionLabel: {
    fontFamily: Fonts.bodyBold,
    fontSize: 12,
    letterSpacing: 2,
    color: Theme.textMuted,
    marginTop: Spacing.sm,
  },
  groupLabel: {
    fontFamily: Fonts.bodyBold,
    fontSize: 12,
    letterSpacing: 2,
    color: Theme.textMuted,
    marginTop: Spacing.xl,
    marginBottom: Spacing.sm,
  },
  gap: {
    height: Spacing.sm,
  },
  note: {
    marginTop: Spacing.xs,
    fontFamily: Fonts.body,
    fontSize: 12,
    color: Theme.textMuted,
  },
  confirm: {
    marginTop: Spacing.sm,
    fontFamily: Fonts.bodyBold,
    fontSize: 13,
    color: Theme.text,
  },
});
