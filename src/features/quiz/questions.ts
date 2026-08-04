export interface CompassQuestion {
  prompt: string;
  /**
   * Exactly three, in the order they are lettered and listed: A, B, C. The
   * screen decides where each one lands on the compass (A west, B north,
   * C east) — the data says nothing about direction. Down is always Pass.
   */
  choices: [string, string, string];
  /** Index into `choices`. */
  correctIndex: number;
}

export const SAMPLE_QUESTIONS: CompassQuestion[] = [
  {
    prompt: "WHICH PLANET IS KNOWN AS THE RED PLANET?",
    choices: ["MARS", "VENUS", "JUPITER"],
    correctIndex: 0,
  },
  {
    prompt: "WHAT IS THE CAPITAL OF FRANCE?",
    choices: ["PARIS", "ROME", "MADRID"],
    correctIndex: 0,
  },
  {
    prompt: "HOW MANY LEGS DOES A SPIDER HAVE?",
    choices: ["SIX", "EIGHT", "TEN"],
    correctIndex: 1,
  },
  {
    prompt: "WHAT GAS DO PLANTS ABSORB FROM THE AIR?",
    choices: ["OXYGEN", "NITROGEN", "CARBON DIOXIDE"],
    correctIndex: 2,
  },
  {
    prompt: "WHO PAINTED THE MONA LISA?",
    choices: ["DA VINCI", "PICASSO", "MONET"],
    correctIndex: 0,
  },
  {
    prompt: "WHAT IS THE LARGEST OCEAN ON EARTH?",
    choices: ["ATLANTIC", "PACIFIC", "ARCTIC"],
    correctIndex: 1,
  },
  {
    prompt: "WHICH METAL IS LIQUID AT ROOM TEMPERATURE?",
    choices: ["MERCURY", "IRON", "TIN"],
    correctIndex: 0,
  },
  {
    prompt: "HOW MANY STRINGS DOES A STANDARD VIOLIN HAVE?",
    choices: ["FOUR", "SIX", "FIVE"],
    correctIndex: 0,
  },
  {
    prompt: "WHAT IS THE HARDEST NATURAL SUBSTANCE ON EARTH?",
    choices: ["QUARTZ", "GRANITE", "DIAMOND"],
    correctIndex: 2,
  },
  {
    prompt: "WHICH COUNTRY GIFTED THE STATUE OF LIBERTY TO THE US?",
    choices: ["SPAIN", "FRANCE", "ITALY"],
    correctIndex: 1,
  },
];
