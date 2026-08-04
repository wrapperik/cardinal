/**
 * The playable characters. Only the puck's silhouette changes — never its
 * colour, which stays bone everywhere so blue keeps meaning "correct" and
 * nothing else.
 *
 * `arms` is the whole design: the shape is built from `arms / 2` rounded
 * capsules crossed through a core circle, so an even count is required and
 * the number alone distinguishes one character from the next.
 */
export interface Character {
  id: string;
  name: string;
  /** Must be even — the shape is drawn as `arms / 2` crossed capsules. */
  arms: number;
  /** How far the arms reach past the core, as a fraction of the radius. */
  reach: number;
  locked: boolean;
}

/** The default: a plain disc, exactly what the games shipped with. */
export const DEFAULT_CHARACTER_ID = "orb";

export const ROSTER: Character[] = [
  {
    id: "orb",
    name: "ORB",
    // Zero arms — the core circle alone, i.e. the puck as it has always been.
    arms: 0,
    reach: 0,
    locked: false,
  },
  {
    id: "star",
    name: "STAR",
    arms: 8,
    reach: 0.62,
    locked: false,
  },
  {
    id: "burr",
    name: "BURR",
    arms: 12,
    reach: 0.52,
    locked: true,
  },
  {
    id: "cross",
    name: "CROSS",
    arms: 6,
    reach: 0.7,
    locked: true,
  },
  {
    id: "husk",
    name: "HUSK",
    arms: 10,
    reach: 0.44,
    locked: true,
  },
];

/** The one character that can be claimed without unlocking anything. */
export const BONUS_CHARACTER_ID = "star";

export function characterById(id: string): Character {
  return ROSTER.find((c) => c.id === id) ?? ROSTER[0];
}
