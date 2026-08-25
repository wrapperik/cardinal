/**
 * Cardinal's visual identity.
 *
 * One rust accent, a wash of charcoal, and blue held back for the single
 * moment it matters most: getting it right.
 */

export const Colors = {
  /** Correct answer. Deliberately scarce — this is the payoff colour. */
  blue: '#233BC5',
  /** The accent. Wrong answers, active edges, the wordmark. */
  rust: '#C53D23',
  /** Background wash. */
  charcoal: '#363636',
  /** Primary text and card surfaces. */
  bone: '#D9D9D9',
} as const;

export const Theme = {
  background: Colors.charcoal,
  surface: '#2B2B2B',
  text: Colors.bone,
  textMuted: '#8A8A8A',
  correct: Colors.blue,
  incorrect: Colors.rust,
  accent: Colors.rust,
  /** Hairline edge that makes the glass capsule read as a surface, not a smudge. */
  glassEdge: 'rgba(217, 217, 217, 0.45)',
  /** Tint sitting over the blur, so the capsule reads as glass on a flat backdrop. */
  glassTint: 'rgba(217, 217, 217, 0.12)',
  /** Separator between stacked rows. Dimmer than glassEdge, which has to hold
   *  a capsule's outline; this only has to divide two blocks of the same colour. */
  hairline: 'rgba(217, 217, 217, 0.14)',
} as const;

/**
 * Ghost-trail fills, nearest the ball first. These are bone pre-blended over rust
 * at 30% / 18% / 10% rather than bone at those alphas — solid fills keep the trail
 * flat where the ghosts overlap, instead of compounding into darker crescents.
 * Recompute these if either Colors.bone or Colors.rust changes.
 */
export const Trail = ['#CB6C5A', '#C95944', '#C74D35'] as const;

/**
 * The same ghost trail for screens on the charcoal background — bone blended
 * over charcoal at the same 30 / 18 / 10%. A trail is always pre-blended against
 * whatever it sits on, so the rust set above cannot be reused here.
 */
export const TrailDark = ['#676767', '#535353', '#464646'] as const;

/**
 * Ghost trail for a rust ball on the charcoal background — rust blended over
 * charcoal at 30 / 18 / 10%, nearest the ball first. Trails are always
 * pre-blended against whatever they sit on, so neither Trail nor TrailDark
 * works here. Recompute if Colors.rust or Colors.charcoal changes.
 */
export const TrailAccent = ['#613830', '#503733', '#443734'] as const;

/**
 * The four cardinal directions. Down is always reserved for Pass in the
 * Compass Quiz, so the mapping is fixed app-wide rather than per-template.
 */
export const Direction = {
  north: 'north',
  east: 'east',
  south: 'south',
  west: 'west',
} as const;

export type DirectionKey = (typeof Direction)[keyof typeof Direction];

export const Fonts = {
  /** Wordmark and numerals. */
  display: 'Display',
  body: 'Afacad_400Regular',
  bodyMedium: 'Afacad_500Medium',
  bodyBold: 'Afacad_700Bold',
} as const;

/** Gesture tuning — dominant-axis thresholding resolves diagonal swipes. */
export const Gestures = {
  /** Distance (px) a card must travel before a direction commits. */
  commitDistance: 96,
  /** Velocity (px/s) that commits early, before commitDistance is reached. */
  commitVelocity: 800,
  /** How far ahead the edge glow previews the pending answer. */
  previewDistance: 24,
  /**
   * A swipe only counts if its dominant axis beats the other by this ratio.
   * Anything below is treated as ambiguous and snaps back.
   */
  dominantAxisRatio: 1.25,
} as const;

export const Spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 40 } as const;

/** Height of the edge and pass pills in the game templates. A shared control
 *  height, not a leftover — sequence, true/false and match all size their
 *  pills from it, and they must agree or the three templates read as three
 *  different heights of the "same" control. */
export const EDGE_PILL_HEIGHT = 44;

/**
 * Corner radii. Named for the thing they round rather than for their value,
 * so a card, a header block and a badge can never disagree by two pixels
 * because two screens each guessed at "about twenty".
 */
export const Radius = {
  /** Anything capsule-shaped: pills, badges, pull tabs. */
  pill: 999,
  /** Panels that sit on the background — the score card, a stat block. */
  card: 20,
  /** The rust header block's lower corners on home. */
  header: 28,
  /** The upload sheet's top corners where it rises over the screen behind it. */
  sheet: 28,
} as const;

/**
 * Spring presets. Reanimated springs are three loose numbers that read as
 * noise at the call site, and the app already had four near-identical copies
 * of the same two configs scattered across screens. Naming them by the
 * gesture they belong to is what keeps a knob, a row and a whole panel from
 * quietly settling at three different speeds.
 */
export const Motion = {
  /** A control shrinking or swelling under a finger. Fast, negligible overshoot. */
  press: { damping: 15, stiffness: 320, mass: 0.6 },
  /** A row or knob snapping back once a drag lets go. */
  snap: { damping: 18, stiffness: 220, mass: 0.7 },
  /** A whole panel or screen settling into place. Heavier, so it reads as mass. */
  settle: { damping: 16, stiffness: 140, mass: 0.9 },
} as const;

/**
 * How long a hold-to-activate control must be held before it fires.
 *
 * Long enough that a brush or a scroll that starts on the icon never opens a
 * screen, short enough that a deliberate press does not feel like waiting.
 * Shared rather than per-icon: the plus and the gear sit side by side, and a
 * different dwell on each would read as one of them being broken.
 */
export const HOLD_MS = 420;
