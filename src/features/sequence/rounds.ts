/**
 * Sequence Swipe round data. Mirrors SequencePayload in src/types/cardinal.ts —
 * orderedItems is stored correct-order-first; the screen shuffles its own
 * copy for play and never mutates this array.
 */
export interface SequenceRound {
  prompt: string;
  /** Stored in the CORRECT order. The screen shuffles a copy for play. */
  orderedItems: string[];
}

export const SAMPLE_ROUNDS: SequenceRound[] = [
  {
    prompt: "ORDER THESE EVENTS, EARLIEST FIRST",
    orderedItems: [
      "WORLD WAR I",
      "WORLD WAR II",
      "MOON LANDING",
      "BERLIN WALL FALLS",
    ],
  },
  {
    prompt: "ORDER THESE MITOSIS STAGES, IN SEQUENCE",
    orderedItems: ["PROPHASE", "METAPHASE", "ANAPHASE", "TELOPHASE"],
  },
  {
    prompt: "ORDER THESE ANIMALS, SMALLEST FIRST",
    orderedItems: ["ANT", "HOUSE CAT", "ELEPHANT", "BLUE WHALE"],
  },
  {
    prompt: "ORDER THESE WORDS, ALPHABETICALLY",
    orderedItems: ["FALCON", "IGLOO", "LANTERN", "PUZZLE"],
  },
  {
    prompt: "ORDER THESE PLANETS, NEAREST TO THE SUN",
    orderedItems: ["MERCURY", "EARTH", "SATURN", "NEPTUNE"],
  },
  {
    prompt: "ORDER THESE ERAS, EARLIEST FIRST",
    orderedItems: ["STONE AGE", "BRONZE AGE", "IRON AGE", "MIDDLE AGES"],
  },
];
