import { describe, expect, it } from "vitest";

import {
  dropsCanonicalCourse,
  PENDING_COURSE_ID,
  planDiscard,
  planSave,
  type UploadDraft,
} from "@/features/upload/draft-rules";
import type { Course, LocalDeck } from "@/features/upload/types";

const course: Course = {
  id: "biology",
  title: "BIOLOGY",
  gameType: "compassQuiz",
  seeded: false,
  createdAt: 1,
};

const deck: LocalDeck = {
  id: "deck-1",
  courseId: "biology",
  title: "BIOLOGY",
  sourceName: "notes.pdf",
  cards: [],
  createdAt: 1,
  updatedAt: 1,
  provider: "gemini",
  sourceType: "upload",
  uploadId: "upload-1",
};

function draft(overrides: Partial<UploadDraft> = {}): UploadDraft {
  return { course, deck, courseExisted: false, ...overrides };
}

describe("planSave", () => {
  it("creates the course a pending name describes, and only now", () => {
    expect(
      planSave({
        destinationId: PENDING_COURSE_ID,
        pendingTitle: "ORGANIC CHEM",
        fallbackCourseId: "biology",
        fallbackTitle: "BIOLOGY",
      }),
    ).toEqual({ kind: "new", title: "ORGANIC CHEM" });
  });

  it("falls back to the suggestion when the pending name was blanked", () => {
    expect(
      planSave({
        destinationId: PENDING_COURSE_ID,
        pendingTitle: "   ",
        fallbackCourseId: null,
        fallbackTitle: "BIOLOGY",
      }),
    ).toEqual({ kind: "new", title: "BIOLOGY" });
  });

  it("prefers an explicit choice over the model's own answer", () => {
    expect(
      planSave({
        destinationId: "physics",
        pendingTitle: null,
        fallbackCourseId: "biology",
        fallbackTitle: "BIOLOGY",
      }),
    ).toEqual({ kind: "existing", courseId: "physics" });
  });

  it("uses the model's course when nothing was chosen", () => {
    expect(
      planSave({
        destinationId: null,
        pendingTitle: null,
        fallbackCourseId: "biology",
        fallbackTitle: "BIOLOGY",
      }),
    ).toEqual({ kind: "existing", courseId: "biology" });
  });

  it("makes a new course when neither a choice nor a match exists", () => {
    expect(
      planSave({
        destinationId: null,
        pendingTitle: null,
        fallbackCourseId: null,
        fallbackTitle: "BIOLOGY",
      }),
    ).toEqual({ kind: "new", title: "BIOLOGY" });
  });
});

describe("dropsCanonicalCourse", () => {
  it("removes the model's own course once the cards go elsewhere", () => {
    expect(dropsCanonicalCourse({ kind: "existing", courseId: "physics" }, draft())).toBe(true);
    expect(dropsCanonicalCourse({ kind: "new", title: "ORGANIC CHEM" }, draft())).toBe(true);
  });

  it("keeps it when the cards were filed there after all", () => {
    expect(dropsCanonicalCourse({ kind: "existing", courseId: "biology" }, draft())).toBe(false);
  });

  it("never removes a course that predates the upload", () => {
    expect(
      dropsCanonicalCourse({ kind: "existing", courseId: "physics" }, draft({ courseExisted: true })),
    ).toBe(false);
  });
});

describe("planDiscard", () => {
  it("removes both records the upload created", () => {
    expect(planDiscard(draft())).toEqual({ deck, course });
  });

  it("leaves a course the upload only borrowed", () => {
    expect(planDiscard(draft({ courseExisted: true }))).toEqual({ deck, course: null });
  });

  it("has nothing to remove before extraction has written anything", () => {
    expect(planDiscard(null)).toEqual({ deck: null, course: null });
  });
});
