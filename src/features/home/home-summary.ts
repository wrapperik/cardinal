export interface HomeSummaryInput {
  streak: number;
  cardsPlayed: number;
  dailyScore: number;
}

export interface HomeSummaryValue {
  label: "DAY STREAK" | "CARDS PLAYED" | "DAILY SCORE";
  value: string;
}

/** The home panel is always a fixed, comparable three-part daily snapshot. */
export function homeSummaryValues({ streak, cardsPlayed, dailyScore }: HomeSummaryInput): HomeSummaryValue[] {
  return [
    { label: "DAY STREAK", value: String(streak) },
    { label: "CARDS PLAYED", value: String(cardsPlayed) },
    { label: "DAILY SCORE", value: String(dailyScore) },
  ];
}
