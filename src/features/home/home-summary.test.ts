import { describe, expect, it } from "vitest";

import { homeSummaryValues } from "./home-summary";

describe("homeSummaryValues", () => {
  it("keeps the home summary in its fixed three-column order", () => {
    expect(homeSummaryValues({ streak: 4, cardsPlayed: 18, dailyScore: 145 })).toEqual([
      { label: "DAY STREAK", value: "4" },
      { label: "CARDS PLAYED", value: "18" },
      { label: "DAILY SCORE", value: "145" },
    ]);
  });

  it("keeps the streak numeral free of a unit", () => {
    expect(homeSummaryValues({ streak: 1, cardsPlayed: 0, dailyScore: 0 })[0]).toEqual({
      label: "DAY STREAK",
      value: "1",
    });
  });
});
