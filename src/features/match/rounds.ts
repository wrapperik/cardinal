export interface MatchPair {
  term: string;
  definition: string;
}

export interface MatchRound {
  prompt: string;
  /** Exactly three. Zone order is shuffled client-side for play. */
  pairs: MatchPair[];
}

export const SAMPLE_ROUNDS: MatchRound[] = [
  {
    prompt: "MATCH EACH ORGAN TO ITS JOB",
    pairs: [
      { term: "HEART", definition: "PUMPS BLOOD THROUGH THE BODY" },
      { term: "LUNGS", definition: "EXCHANGE OXYGEN AND CARBON DIOXIDE" },
      { term: "KIDNEYS", definition: "FILTER WASTE FROM THE BLOOD" },
    ],
  },
  {
    prompt: "MATCH EACH CAPITAL TO ITS COUNTRY",
    pairs: [
      { term: "TOKYO", definition: "CAPITAL OF JAPAN, IN EAST ASIA" },
      { term: "CAIRO", definition: "CAPITAL OF EGYPT, ON THE NILE" },
      { term: "OTTAWA", definition: "CAPITAL OF CANADA, IN NORTH AMERICA" },
    ],
  },
  {
    prompt: "MATCH EACH UNIT TO WHAT IT MEASURES",
    pairs: [
      { term: "WATT", definition: "POWER, OR THE RATE OF ENERGY USE" },
      { term: "VOLT", definition: "ELECTRIC POTENTIAL DIFFERENCE" },
      { term: "PASCAL", definition: "PRESSURE OR MECHANICAL STRESS" },
    ],
  },
  {
    prompt: "MATCH EACH LEADER TO THEIR TITLE",
    pairs: [
      { term: "NAPOLEON", definition: "FRENCH EMPEROR WHO LOST AT WATERLOO" },
      { term: "CLEOPATRA", definition: "LAST PHARAOH OF ANCIENT EGYPT" },
      { term: "CHURCHILL", definition: "BRITISH PM DURING WORLD WAR II" },
    ],
  },
  {
    prompt: "MATCH EACH TERM TO ITS DEFINITION",
    pairs: [
      { term: "SYNONYM", definition: "A WORD MEANING THE SAME AS ANOTHER" },
      { term: "ANTONYM", definition: "A WORD MEANING THE OPPOSITE" },
      { term: "HOMOPHONE", definition: "WORDS THAT SOUND ALIKE BUT DIFFER" },
    ],
  },
  {
    prompt: "MATCH EACH ELEMENT TO ITS PROPERTY",
    pairs: [
      { term: "OXYGEN", definition: "GAS ESSENTIAL FOR HUMAN BREATHING" },
      { term: "CARBON", definition: "FORMS THE BASIS OF ALL LIFE" },
      { term: "HYDROGEN", definition: "LIGHTEST, MOST ABUNDANT ELEMENT" },
    ],
  },
];
