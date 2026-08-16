/**
 * Pure rules for course titles and ids. No React Native imports on purpose:
 * this is exercised directly by vitest under node, and it is also the one
 * place that has to make sense of whatever AsyncStorage handed back, which
 * may be last year's shape or outright garbage after a botched migration.
 */

import type { Course } from "@/features/upload/types";
import type { GameType } from "@/types/cardinal";

const MAX_TITLE_LENGTH = 32;

const VALID_GAME_TYPES = new Set<GameType>([
  "compassQuiz",
  "trueFalseDuel",
  "sequenceSwipe",
  "matchRelease",
]);

/** Every surface renders course titles uppercase, so this is the one place that decides it. */
export function normaliseTitle(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toUpperCase().slice(0, MAX_TITLE_LENGTH);
}

export function isValidTitle(raw: string): boolean {
  return normaliseTitle(raw).length >= 2;
}

/**
 * Kebab-cases a normalised title. Punctuation collapses to a single hyphen
 * rather than being dropped outright, so "BIOLOGY: CELLS" and "BIOLOGY -
 * CELLS" do not silently become the same slug.
 */
function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "course";
}

/**
 * Random suffix keeps two courses named the same from colliding — titles are
 * user input and "HISTORY" is exactly the kind of thing two people upload
 * under independently. Not cryptographic; collision cost here is a mis-filed
 * deck, not a security incident.
 */
export function makeCourseId(title: string): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${slugify(normaliseTitle(title))}-${suffix}`;
}

/**
 * Seed ids are the slug alone — no random suffix — so re-seeding on every
 * cold start produces the exact same ids and `mergeCourses` can recognise a
 * seed it already wrote without keeping a separate registry.
 */
export function seedCourses(topics: { title: string; gameType: GameType }[]): Course[] {
  return topics.map((topic) => {
    const title = normaliseTitle(topic.title);
    return {
      id: slugify(title),
      title,
      gameType: topic.gameType,
      seeded: true,
      createdAt: 0,
    };
  });
}

function isCourse(value: unknown): value is Course {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Course>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.gameType === "string" &&
    VALID_GAME_TYPES.has(candidate.gameType as GameType) &&
    typeof candidate.seeded === "boolean" &&
    typeof candidate.createdAt === "number"
  );
}

/**
 * Seeds always win a ties with stored data: they come from the shipped
 * TOPICS list, which can change between releases, and a stale stored copy of
 * a course that used to be seeded should not shadow the current definition.
 * `stored` is whatever `JSON.parse` produced from AsyncStorage, so every
 * entry is checked before it is trusted rather than just cast.
 */
export function mergeCourses(stored: Course[], seeds: Course[]): Course[] {
  const seedIds = new Set(seeds.map((seed) => seed.id));
  const survivors = (Array.isArray(stored) ? stored : [])
    .filter(isCourse)
    .filter((course) => !course.seeded && !seedIds.has(course.id))
    .sort((a, b) => a.createdAt - b.createdAt);

  return [...seeds, ...survivors];
}

/** Case/space-insensitive so "biology" and "BIOLOGY " resolve to the same course. */
export function findCourseByTitle<T extends Pick<Course, "title">>(
  courses: T[],
  title: string,
): T | undefined {
  const target = normaliseTitle(title);
  return courses.find((course) => normaliseTitle(course.title) === target);
}
