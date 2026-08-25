import { describe, expect, it } from "vitest";

import {
  extractionStatus,
  REASSURANCE_STEP_MS,
  REASSURANCE_THRESHOLD_MS,
} from "./status-messages";
import type { ExtractionPhase } from "@/features/upload/types";

describe("extractionStatus", () => {
  const phases: { phase: ExtractionPhase; label: string }[] = [
    { phase: "uploading", label: "UPLOADING YOUR FILE" },
    { phase: "queued", label: "WAITING FOR THE MODEL" },
    { phase: "extracting", label: "READING YOUR MATERIAL" },
    { phase: "parsing", label: "WRITING CARDS" },
  ];

  for (const { phase, label } of phases) {
    it(`returns the ${phase} label below the reassurance threshold`, () => {
      expect(extractionStatus(phase, 0)).toBe(label);
      expect(extractionStatus(phase, REASSURANCE_THRESHOLD_MS - 1)).toBe(label);
    });
  }

  it("switches to the first reassurance line exactly at the threshold", () => {
    expect(extractionStatus("extracting", REASSURANCE_THRESHOLD_MS)).toBe("STILL GOING");
  });

  it("advances one reassurance step every REASSURANCE_STEP_MS", () => {
    expect(extractionStatus("extracting", REASSURANCE_THRESHOLD_MS)).toBe("STILL GOING");
    expect(extractionStatus("extracting", REASSURANCE_THRESHOLD_MS + REASSURANCE_STEP_MS)).toBe("THINKING HARD");
    expect(extractionStatus("extracting", REASSURANCE_THRESHOLD_MS + REASSURANCE_STEP_MS * 2)).toBe("ALMOST DONE");
  });

  it("clamps at the last reassurance step instead of looping back", () => {
    expect(extractionStatus("extracting", REASSURANCE_THRESHOLD_MS + REASSURANCE_STEP_MS * 10)).toBe("ALMOST DONE");
    expect(extractionStatus("extracting", Number.MAX_SAFE_INTEGER)).toBe("ALMOST DONE");
  });
});
