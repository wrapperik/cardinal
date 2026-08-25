import type { ExtractionPhase } from "@/features/upload/types";

/** What each phase is called while extraction is still comfortably fast. */
const PHASE_LABELS: Record<ExtractionPhase, string> = {
  uploading: "UPLOADING YOUR FILE",
  queued: "WAITING FOR THE MODEL",
  extracting: "READING YOUR MATERIAL",
  parsing: "WRITING CARDS",
};

/**
 * Below this, the phase label is still informative. At or beyond it, a
 * phase like "extracting" has usually been true for so long that repeating
 * it reads as stalled rather than in progress, so the copy switches to
 * reassurance instead.
 */
export const REASSURANCE_THRESHOLD_MS = 9000;

/** How long each reassurance line stays on screen before advancing. */
export const REASSURANCE_STEP_MS = 4000;

/** Reassurance copy, shown in order as elapsed time climbs past the threshold. */
const REASSURANCE_STEPS = ["STILL GOING", "THINKING HARD", "ALMOST DONE"];

/**
 * The phase label while extraction is fresh, then a slow-progressing
 * reassurance line once it has been running long enough that the raw phase
 * name would start to look stuck. The reassurance index is clamped to the
 * last step rather than wrapping — cycling back to "STILL GOING" after
 * "ALMOST DONE" would read as the job regressing, not just taking a while.
 */
export function extractionStatus(phase: ExtractionPhase, elapsedMs: number): string {
  if (elapsedMs < REASSURANCE_THRESHOLD_MS) return PHASE_LABELS[phase];

  const stepsElapsed = Math.floor((elapsedMs - REASSURANCE_THRESHOLD_MS) / REASSURANCE_STEP_MS);
  const index = Math.min(stepsElapsed, REASSURANCE_STEPS.length - 1);
  return REASSURANCE_STEPS[index];
}
