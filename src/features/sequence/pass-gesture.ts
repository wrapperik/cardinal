import { Gestures } from "@/constants/theme";

/** A bottom-docked control cannot reasonably travel the app-wide 96px distance. */
export const SEQUENCE_PASS_DISTANCE = 40;

export function shouldPassSequence({ translationY, velocityY }: { translationY: number; velocityY: number }): boolean {
  return translationY >= SEQUENCE_PASS_DISTANCE || velocityY > Gestures.commitVelocity;
}

export function finishSequencePassGesture(
  gesture: { translationY: number; velocityY: number },
  onPass: () => void,
): void {
  if (shouldPassSequence(gesture)) onPass();
}
