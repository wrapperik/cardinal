import { TOPICS } from "@/features/home/topics";
import {
  findCourseByTitle,
  isCourse,
  makeCourseId,
  mergeCourses,
  normaliseTitle,
  seedCourses,
} from "@/features/upload/course-rules";
import type { Course } from "@/features/upload/types";
import { createSyncedStore, type SyncedStoreConfig } from "@/lib/sync/store";
import type { FieldAdapterConfig } from "@/lib/sync/adapter";
import type { GameType } from "@/types/cardinal";

/**
 * Pre-sync key this store read from before courses moved onto
 * createSyncedStore. Kept only as the source `migrateLegacyKey` copies from
 * once — see the config below and the comment on that field in store.ts.
 */
const LEGACY_STORAGE_KEY = "cardinal.courses";

/**
 * Computed once at import so seed ids stay stable for the life of the
 * process — `courseById` on a freshly-seeded id must resolve identically
 * whether it runs before or after hydration completes.
 */
const SEEDS = seedCourses(TOPICS);

/**
 * Wires courses onto the shared sync factory. Every field here is asserted
 * against firestore.rules' `users/{userId}/courses/{courseId}` block, not
 * just against CourseDoc's shape:
 *
 * - `idField`/`ownerIdField` name the two fields the rules cross-check
 *   against the path (`incoming().courseId == courseId`) and the caller
 *   (`incoming().ownerId == userId`) on every write.
 * - `timestampFields`/`serverTimestamps` force `createdAt` to
 *   serverTimestamp() on create and omit it on update, which is what lets
 *   the rules assert `isServerTime('createdAt')` on create and
 *   `unchanged('createdAt')` on update — a client-supplied value, including
 *   a seeded course's placeholder `createdAt: 0`, would fail both.
 * - `remoteUpdatedAtField` is `createdAt` rather than some separate
 *   `updatedAt`, because courses have no `updatedAt` of their own (title and
 *   gameType edits are not timestamped) and `createdAt` is pinned unchanged
 *   after create anyway — reconcile() only needs it to decide "does the
 *   local cache already know about this record," which a frozen timestamp
 *   still answers correctly.
 * - `migrateLegacyKey` adopts whatever a pre-sync install left at the flat
 *   `cardinal.courses` key into this uid's namespaced key on first hydrate,
 *   so upgrading does not silently drop a player's own courses. It cannot
 *   attribute that data to a particular account — the flat key predates any
 *   concept of an account — so on a device that later signs into a second
 *   account, that account's own empty key would adopt the same leftover
 *   data too. Accepted: the legacy format never associated local courses
 *   with an account at all, so there is no more-correct owner to assign
 *   them to, and a single-account device (the only kind that existed before
 *   this) is unaffected.
 *
 * `isValid` reuses `isCourse` from course-rules.ts rather than a second,
 * parallel shape check — a malformed document from Firestore deserves no
 * more trust than malformed JSON from AsyncStorage did.
 */
export const COURSE_FIELD: FieldAdapterConfig = {
  idField: "courseId",
  ownerIdField: "ownerId",
  timestampFields: ["createdAt"],
  serverTimestamps: { createdAt: "onCreate" },
};

const courseSyncConfig: SyncedStoreConfig<Course> = {
  name: "courses",
  collectionPath: (uid) => `users/${uid}/courses`,
  pathIsOwnerScoped: true,
  field: COURSE_FIELD,
  remoteUpdatedAtField: "createdAt",
  isValid: isCourse,
  seeds: SEEDS,
  mergeWithSeeds: mergeCourses,
  migrateLegacyKey: LEGACY_STORAGE_KEY,
};

/**
 * A module-level store rather than a context: courses are read from the
 * upload sheet, the home screen, and eventually the review screen, and
 * threading a provider through the router's layout for one array is more
 * plumbing than it is worth.
 *
 * There is deliberately no loading state layered on top of this. Until
 * hydration (local, then Firestore) lands, `useCourses`/`getCourses` return
 * the seeds — exactly the fallback every screen already rendered before
 * sync existed, and still the correct one: a player who has never opened
 * the app on this device yet has no other courses to show anyway, and a
 * returning player's real list arrives via the same notify() a loading
 * spinner would just have delayed.
 */
const store = createSyncedStore<Course>(courseSyncConfig);

export function useCourses(): Course[] {
  return store.useRecords();
}

export function useCoursesHydrated(): boolean {
  return store.useHydrated();
}

export function getCourses(): Course[] {
  return store.getRecords();
}

/** Adopts a Function-created course before the normal listener catches up. */
export function adoptRemoteCourse(course: Course): void {
  store.adoptRemote(course, course.createdAt);
}

export function courseById(id: string): Course | undefined {
  return store.getRecords().find((course) => course.id === id);
}

/**
 * Titles are the only thing a user actually types, so that is what
 * de-duplicates: uploading twice under "Biology" should file both decks
 * under one course rather than splitting silently on id.
 */
export function addCourse(title: string, gameType: GameType = "compassQuiz"): Course {
  const existing = findCourseByTitle(store.getRecords(), title);
  if (existing) return existing;

  const course: Course = {
    id: makeCourseId(title),
    title: normaliseTitle(title),
    gameType,
    seeded: false,
    createdAt: Date.now(),
  };
  store.put(course);
  return course;
}

/**
 * Renames a course in place. Seeded courses are refused — the `Course` doc
 * comment in types.ts is explicit that they "can never be renamed out from
 * under the demo decks" — so a seeded record comes back unchanged rather
 * than erroring, the same shape a no-op has everywhere else in this file.
 * An unknown id or a title that normalises to empty also return unchanged,
 * the latter so a blank submission cannot silently blank a course's title.
 */
export function renameCourse(id: string, title: string): Course | undefined {
  const course = store.getRecords().find((existing) => existing.id === id);
  if (!course) return undefined;
  if (course.seeded) return course;

  const normalised = normaliseTitle(title);
  if (!normalised) return course;

  const updated: Course = { ...course, title: normalised };
  store.put(updated);
  return updated;
}

/** Removes a user-created course. Seed courses remain permanent fixtures. */
export function deleteCourse(id: string): boolean {
  const course = store.getRecords().find((existing) => existing.id === id);
  if (!course || course.seeded) return false;
  store.remove(id);
  return true;
}
