import { describe, expect, it } from "vitest";

import {
  findCourseByTitle,
  isValidTitle,
  makeCourseId,
  mergeCourses,
  normaliseTitle,
  seedCourses,
} from "./course-rules";
import type { Course } from "./types";

describe("normaliseTitle", () => {
  it("trims, collapses inner whitespace, and uppercases", () => {
    expect(normaliseTitle("  biology   101  ")).toBe("BIOLOGY 101");
  });

  it("caps at 32 characters", () => {
    const raw = "a".repeat(40);
    expect(normaliseTitle(raw)).toHaveLength(32);
    expect(normaliseTitle(raw)).toBe("A".repeat(32));
  });

  it("collapses tabs and newlines like any other whitespace", () => {
    expect(normaliseTitle("history\n\tof\nrome")).toBe("HISTORY OF ROME");
  });
});

describe("isValidTitle", () => {
  it("rejects blank and whitespace-only input", () => {
    expect(isValidTitle("")).toBe(false);
    expect(isValidTitle("   ")).toBe(false);
  });

  it("rejects a single character", () => {
    expect(isValidTitle("a")).toBe(false);
  });

  it("accepts two characters or more", () => {
    expect(isValidTitle("ai")).toBe(true);
    expect(isValidTitle("biology")).toBe(true);
  });
});

describe("makeCourseId", () => {
  it("kebab-cases the normalised title", () => {
    expect(makeCourseId("Visual Culture")).toBe("visual-culture");
  });

  it("converges to the same id for the same title, so a second device lands on the course the first already created instead of duplicating it", () => {
    const first = makeCourseId("History");
    const second = makeCourseId("History");
    expect(first).toBe(second);
  });

  it("falls back to a placeholder slug when the title has no letters or digits", () => {
    expect(makeCourseId("!!!")).toBe("course");
  });
});

describe("seedCourses", () => {
  const topics = [
    { title: "Geography", gameType: "matchRelease" as const },
    { title: "History", gameType: "sequenceSwipe" as const },
  ];

  it("produces seeded courses with createdAt 0", () => {
    const seeds = seedCourses(topics);
    expect(seeds).toEqual([
      { id: "geography", title: "GEOGRAPHY", gameType: "matchRelease", seeded: true, createdAt: 0 },
      { id: "history", title: "HISTORY", gameType: "sequenceSwipe", seeded: true, createdAt: 0 },
    ]);
  });

  it("is idempotent: re-seeding produces identical ids", () => {
    const first = seedCourses(topics).map((c) => c.id);
    const second = seedCourses(topics).map((c) => c.id);
    expect(second).toEqual(first);
  });
});

describe("mergeCourses", () => {
  const seeds: Course[] = [
    { id: "geography", title: "GEOGRAPHY", gameType: "matchRelease", seeded: true, createdAt: 0 },
    { id: "history", title: "HISTORY", gameType: "sequenceSwipe", seeded: true, createdAt: 0 },
  ];

  it("puts seeds first in their original order, then stored courses by createdAt ascending", () => {
    const stored: Course[] = [
      { id: "later", title: "LATER", gameType: "compassQuiz", seeded: false, createdAt: 200 },
      { id: "earlier", title: "EARLIER", gameType: "compassQuiz", seeded: false, createdAt: 100 },
    ];

    expect(mergeCourses(stored, seeds).map((c) => c.id)).toEqual([
      "geography",
      "history",
      "earlier",
      "later",
    ]);
  });

  it("prefers the seed over a stored course sharing its id", () => {
    const stored: Course[] = [
      { id: "geography", title: "STALE GEOGRAPHY TITLE", gameType: "compassQuiz", seeded: false, createdAt: 50 },
    ];

    const merged = mergeCourses(stored, seeds);
    expect(merged.filter((c) => c.id === "geography")).toHaveLength(1);
    expect(merged.find((c) => c.id === "geography")?.title).toBe("GEOGRAPHY");
  });

  it("drops a stored course that is itself marked seeded — seeds only ever come from the seed list", () => {
    const stored: Course[] = [
      { id: "phantom-seed", title: "PHANTOM", gameType: "compassQuiz", seeded: true, createdAt: 10 },
    ];

    expect(mergeCourses(stored, seeds).some((c) => c.id === "phantom-seed")).toBe(false);
  });

  it("ignores malformed entries instead of throwing", () => {
    const malformed = [
      null,
      42,
      "a string",
      { id: "missing-fields" },
      { id: "bad-gametype", title: "X", gameType: "notAGame", seeded: false, createdAt: 1 },
      { id: "ok", title: "OK", gameType: "compassQuiz", seeded: false, createdAt: 1 },
    ] as unknown as Course[];

    const merged = mergeCourses(malformed, seeds);
    expect(merged.map((c) => c.id)).toEqual(["geography", "history", "ok"]);
  });

  it("tolerates a non-array stored value", () => {
    expect(mergeCourses(null as unknown as Course[], seeds)).toEqual(seeds);
    expect(mergeCourses(undefined as unknown as Course[], seeds)).toEqual(seeds);
  });
});

describe("findCourseByTitle", () => {
  const courses: Course[] = [
    { id: "geography", title: "GEOGRAPHY", gameType: "matchRelease", seeded: true, createdAt: 0 },
    { id: "history", title: "HISTORY", gameType: "sequenceSwipe", seeded: true, createdAt: 0 },
  ];

  it("matches case- and space-insensitively", () => {
    expect(findCourseByTitle(courses, "  geography  ")?.id).toBe("geography");
    expect(findCourseByTitle(courses, "History")?.id).toBe("history");
  });

  it("returns undefined when nothing matches", () => {
    expect(findCourseByTitle(courses, "Chemistry")).toBeUndefined();
  });
});
