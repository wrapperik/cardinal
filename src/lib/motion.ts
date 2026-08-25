/** Duration for a visible state change: instant under reduced motion. */
export function motionDuration(reducedMotion: boolean, duration: number): number {
  return reducedMotion ? 0 : duration;
}
