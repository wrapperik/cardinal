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
} as const;

/**
 * Ghost-trail fills, nearest the ball first. These are bone pre-blended over rust
 * at 30% / 18% / 10% rather than bone at those alphas — solid fills keep the trail
 * flat where the ghosts overlap, instead of compounding into darker crescents.
 * Recompute these if either Colors.bone or Colors.rust changes.
 */
export const Trail = ['#CB6C5A', '#C95944', '#C74D35'] as const;

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
