import { describe, expect, it } from "vitest";

import { TUTORIAL_COURSE_ID } from "@/features/tutorial/tutorial";

import { TOPICS } from "./topics";

describe("TOPICS", () => {
  it("seeds one course that starts the learn-the-games tutorial", () => {
    expect(TOPICS).toEqual([
      { title: "LEARN THE GAMES", gameType: "compassQuiz" },
    ]);
    expect(TUTORIAL_COURSE_ID).toBe("learn-the-games");
  });
});
