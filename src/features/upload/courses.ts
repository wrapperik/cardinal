import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";

import { TOPICS } from "@/features/home/topics";
import {
  findCourseByTitle,
  makeCourseId,
  mergeCourses,
  normaliseTitle,
  seedCourses,
} from "@/features/upload/course-rules";
import type { Course } from "@/features/upload/types";
import type { GameType } from "@/types/cardinal";

const STORAGE_KEY = "cardinal.courses";

/**
 * Computed once at import so seed ids stay stable for the life of the
 * process — `courseById` on a freshly-seeded id must resolve identically
 * whether it runs before or after AsyncStorage hydrates.
 */
const SEEDS = seedCourses(TOPICS);

/**
 * A module-level store rather than a context: courses are read from the
 * upload sheet, the home screen, and eventually the review screen, and
 * threading a provider through the router's layout for one array is more
 * plumbing than it is worth. Mirrors src/features/character/store.ts.
 */
let snapshot: Course[] = SEEDS;

const listeners = new Set<() => void>();

function commit(next: Course[]) {
  snapshot = next;
  listeners.forEach((l) => l());
  // Fire-and-forget: a failed write costs the player an uploaded course next
  // launch, which is not worth interrupting the interaction over.
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return snapshot;
}

// Hydrate once at import. Anything already rendered re-renders when it lands;
// until then every screen just shows the seeds, which is the correct
// fallback rather than a loading state.
AsyncStorage.getItem(STORAGE_KEY)
  .then((raw) => {
    if (!raw) return;
    const stored = JSON.parse(raw) as Course[];
    snapshot = mergeCourses(stored, SEEDS);
    listeners.forEach((l) => l());
  })
  .catch(() => {});

export function useCourses(): Course[] {
  return useSyncExternalStore(subscribe, getSnapshot);
}

export function getCourses(): Course[] {
  return snapshot;
}

export function courseById(id: string): Course | undefined {
  return snapshot.find((course) => course.id === id);
}

/**
 * Titles are the only thing a user actually types, so that is what
 * de-duplicates: uploading twice under "Biology" should file both decks
 * under one course rather than splitting silently on id.
 */
export function addCourse(title: string, gameType: GameType = "compassQuiz"): Course {
  const existing = findCourseByTitle(snapshot, title);
  if (existing) return existing;

  const course: Course = {
    id: makeCourseId(title),
    title: normaliseTitle(title),
    gameType,
    seeded: false,
    createdAt: Date.now(),
  };
  commit([...snapshot, course]);
  return course;
}
