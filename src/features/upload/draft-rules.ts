import type { Course, LocalDeck } from "@/features/upload/types";

/**
 * Stands in for a course the user has named but that does not exist yet.
 * Naming a destination is part of reviewing an upload, not an edit to the
 * library — the course is created only once the upload is confirmed — so
 * until then the picker needs an id to select that no store answers to.
 */
export const PENDING_COURSE_ID = "__pending-course__";

/**
 * What the extraction Function has already written to Firestore for an upload
 * nobody has confirmed yet. Both records exist server-side the moment
 * extraction finishes and arrive through the ordinary collection listeners, so
 * the flow has to remember enough about them to either adopt them on save or
 * delete them on discard.
 */
export interface UploadDraft {
  course: Course;
  deck: LocalDeck;
  /**
   * True when the course already existed before this upload started, i.e. the
   * model filed the cards under something the user had made earlier. Discarding
   * must leave such a course alone; it only ever removes what this upload made.
   */
  courseExisted: boolean;
}

export type SaveDestination =
  | { kind: "existing"; courseId: string }
  | { kind: "new"; title: string };

/**
 * Where a confirmed upload's cards land. An explicit choice always wins; with
 * no choice made, the model's own suggestion stands in, and a suggestion that
 * matches nothing in the library becomes a new course under its title.
 */
export function planSave(input: {
  destinationId: string | null;
  pendingTitle: string | null;
  fallbackCourseId: string | null;
  fallbackTitle: string;
}): SaveDestination {
  if (input.destinationId === PENDING_COURSE_ID) {
    // A pending title that has been blanked cannot name a course, so the
    // suggestion takes over rather than creating one called "".
    return { kind: "new", title: input.pendingTitle?.trim() || input.fallbackTitle };
  }
  if (input.destinationId) return { kind: "existing", courseId: input.destinationId };
  if (input.fallbackCourseId) return { kind: "existing", courseId: input.fallbackCourseId };
  return { kind: "new", title: input.fallbackTitle };
}

/**
 * Whether the course the Function invented for this upload should be removed
 * once the deck has been filed. Sending the cards elsewhere leaves that course
 * empty, and an empty course nobody asked for does not belong in the library —
 * but a course that predates the upload is the user's own and always stays.
 */
export function dropsCanonicalCourse(destination: SaveDestination, draft: UploadDraft): boolean {
  if (draft.courseExisted) return false;
  return destination.kind === "new" || destination.courseId !== draft.course.id;
}

/**
 * What discarding an upload has to delete. The deck was written for this
 * upload and never has another owner, so it always goes; the course goes only
 * when this upload is what created it.
 */
export function planDiscard(draft: UploadDraft | null): { deck: LocalDeck | null; course: Course | null } {
  if (!draft) return { deck: null, course: null };
  return { deck: draft.deck, course: draft.courseExisted ? null : draft.course };
}
