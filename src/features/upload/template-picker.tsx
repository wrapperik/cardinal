import type { GameType } from "@/types/cardinal";

/**
 * Display labels for each game type. The picker this file was named for is
 * gone — the AI decides the card template now — but upload.tsx's review
 * screen still needs a human-readable name per GameType for its card
 * breakdown, so that mapping lives on here.
 */
export const TEMPLATE_LABELS: Record<GameType, string> = {
  compassQuiz: "COMPASS QUIZ",
  trueFalseDuel: "TRUE / FALSE",
  sequenceSwipe: "SEQUENCE",
  matchRelease: "MATCH",
};
