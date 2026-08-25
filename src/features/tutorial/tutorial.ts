import type { RecapCard, RecapPlan } from "@/features/recap/recap-rules";
import type { GameType } from "@/types/cardinal";

export const TUTORIAL_COURSE_ID = "learn-the-games";

export interface TutorialTip {
  title: string;
  body: string;
}

const TUTORIAL_CARDS: RecapCard[] = [
  {
    cardId: "tutorial-01", deckId: TUTORIAL_COURSE_ID, gameType: "compassQuiz", difficulty: 1, topic: "COMPASS QUIZ",
    payload: { question: "WHICH SHAPE HAS THREE SIDES?", choices: ["SQUARE", "TRIANGLE", "CIRCLE"], correctIndex: 1 },
  },
  {
    cardId: "tutorial-02", deckId: TUTORIAL_COURSE_ID, gameType: "compassQuiz", difficulty: 1, topic: "COMPASS QUIZ",
    payload: { question: "WHAT COLOUR IS A RIPE BANANA?", choices: ["BLUE", "YELLOW", "PURPLE"], correctIndex: 1 },
  },
  {
    cardId: "tutorial-03", deckId: TUTORIAL_COURSE_ID, gameType: "compassQuiz", difficulty: 1, topic: "COMPASS QUIZ",
    payload: { question: "HOW MANY DAYS ARE IN A WEEK?", choices: ["FIVE", "SIX", "SEVEN"], correctIndex: 2 },
  },
  {
    cardId: "tutorial-04", deckId: TUTORIAL_COURSE_ID, gameType: "compassQuiz", difficulty: 1, topic: "COMPASS QUIZ",
    payload: { question: "WHICH ANIMAL SAYS MEOW?", choices: ["DOG", "CAT", "COW"], correctIndex: 1 },
  },
  {
    cardId: "tutorial-05", deckId: TUTORIAL_COURSE_ID, gameType: "trueFalseDuel", difficulty: 1, topic: "TRUE OR FALSE",
    payload: { statement: "THE SUN RISES IN THE EAST", isTrue: true },
  },
  {
    cardId: "tutorial-06", deckId: TUTORIAL_COURSE_ID, gameType: "trueFalseDuel", difficulty: 1, topic: "TRUE OR FALSE",
    payload: { statement: "A TRIANGLE HAS FOUR SIDES", isTrue: false },
  },
  {
    cardId: "tutorial-07", deckId: TUTORIAL_COURSE_ID, gameType: "trueFalseDuel", difficulty: 1, topic: "TRUE OR FALSE",
    payload: { statement: "WATER FREEZES WHEN IT GETS COLD ENOUGH", isTrue: true },
  },
  {
    cardId: "tutorial-08", deckId: TUTORIAL_COURSE_ID, gameType: "trueFalseDuel", difficulty: 1, topic: "TRUE OR FALSE",
    payload: { statement: "FISH LIVE IN TREES", isTrue: false },
  },
  {
    cardId: "tutorial-09", deckId: TUTORIAL_COURSE_ID, gameType: "sequenceSwipe", difficulty: 1, topic: "SEQUENCE",
    payload: { prompt: "ORDER THESE NUMBERS, SMALLEST FIRST", orderedItems: ["ONE", "TWO", "THREE", "FOUR"] },
  },
  {
    cardId: "tutorial-10", deckId: TUTORIAL_COURSE_ID, gameType: "sequenceSwipe", difficulty: 1, topic: "SEQUENCE",
    payload: { prompt: "ORDER THE DAY, MORNING FIRST", orderedItems: ["BREAKFAST", "LUNCH", "DINNER", "SLEEP"] },
  },
  {
    cardId: "tutorial-11", deckId: TUTORIAL_COURSE_ID, gameType: "sequenceSwipe", difficulty: 1, topic: "SEQUENCE",
    payload: { prompt: "ORDER THE WEEKEND, FIRST TO LAST", orderedItems: ["SATURDAY", "SUNDAY", "MONDAY", "TUESDAY"] },
  },
  {
    cardId: "tutorial-12", deckId: TUTORIAL_COURSE_ID, gameType: "sequenceSwipe", difficulty: 1, topic: "SEQUENCE",
    payload: { prompt: "ORDER A PLANT'S GROWTH, FIRST TO LAST", orderedItems: ["SEED", "SPROUT", "FLOWER", "FRUIT"] },
  },
  {
    cardId: "tutorial-13", deckId: TUTORIAL_COURSE_ID, gameType: "matchRelease", difficulty: 1, topic: "MATCH",
    payload: { prompt: "MATCH EACH ANIMAL TO ITS SOUND", pairs: [
      { term: "CAT", definition: "MEOW" }, { term: "DOG", definition: "WOOF" }, { term: "COW", definition: "MOO" },
    ] },
  },
  {
    cardId: "tutorial-14", deckId: TUTORIAL_COURSE_ID, gameType: "matchRelease", difficulty: 1, topic: "MATCH",
    payload: { prompt: "MATCH EACH SHAPE TO ITS SIDES", pairs: [
      { term: "TRIANGLE", definition: "THREE SIDES" }, { term: "SQUARE", definition: "FOUR SIDES" }, { term: "PENTAGON", definition: "FIVE SIDES" },
    ] },
  },
  {
    cardId: "tutorial-15", deckId: TUTORIAL_COURSE_ID, gameType: "matchRelease", difficulty: 1, topic: "MATCH",
    payload: { prompt: "MATCH EACH COLOUR TO ITS OBJECT", pairs: [
      { term: "YELLOW", definition: "BANANA" }, { term: "BLUE", definition: "SKY" }, { term: "GREEN", definition: "GRASS" },
    ] },
  },
];

const TUTORIAL_TIPS: Record<GameType, TutorialTip> = {
  compassQuiz: {
    title: "COMPASS QUIZ",
    body: "DRAG THE DISC TOWARD A, B OR C. DRAG DOWN TO PASS.",
  },
  trueFalseDuel: {
    title: "TRUE OR FALSE",
    body: "DRAG RIGHT FOR TRUE, LEFT FOR FALSE. DRAG DOWN TO PASS.",
  },
  sequenceSwipe: {
    title: "SEQUENCE",
    body: "DRAG A CARD UP OR DOWN TO PUT THE LIST IN ORDER. IT CHECKS ITSELF.",
  },
  matchRelease: {
    title: "MATCH",
    body: "DRAG THE TERM ONTO ITS MATCHING DEFINITION. COMPLETE ALL THREE.",
  },
};

/** The list is copied before a plan sorts or groups it; game adapters only read payloads. */
export function tutorialCards(): RecapCard[] {
  return [...TUTORIAL_CARDS];
}

/** The cards are authored in game order, so every template opens once per run. */
export function tutorialPlan(): RecapPlan {
  const cards = tutorialCards();
  const gameTypes: GameType[] = ["compassQuiz", "trueFalseDuel", "sequenceSwipe", "matchRelease"];
  let start = 0;
  const legs = gameTypes.map((gameType) => {
    const legCards = cards.filter((card) => card.gameType === gameType);
    const leg = { gameType, topic: legCards[0]?.topic, start, cards: legCards };
    start += legCards.length;
    return leg;
  });
  return { courseId: TUTORIAL_COURSE_ID, cards, legs };
}

export function isTutorialCourse(courseId: string | undefined): boolean {
  return courseId === TUTORIAL_COURSE_ID;
}

export function tutorialTipFor(gameType: GameType): TutorialTip {
  return TUTORIAL_TIPS[gameType];
}
