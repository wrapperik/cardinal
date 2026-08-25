import { describe, expect, it } from "vitest";

import {
  finishSequencePassGesture,
  shouldPassSequence,
} from "./pass-gesture";

describe("shouldPassSequence", () => {
  it("accepts a short intentional downward pull from the bottom pass control", () => {
    expect(shouldPassSequence({ translationY: 40, velocityY: 0 })).toBe(true);
    expect(shouldPassSequence({ translationY: 39, velocityY: 0 })).toBe(false);
  });

  it("still accepts a fast downward flick", () => {
    expect(shouldPassSequence({ translationY: 8, velocityY: 801 })).toBe(true);
  });

  it("finishes committed pass drags on the JavaScript side", () => {
    let passes = 0;
    const onPass = () => {
      passes += 1;
    };

    finishSequencePassGesture({ translationY: 40, velocityY: 0 }, onPass);
    finishSequencePassGesture({ translationY: 39, velocityY: 0 }, onPass);

    expect(passes).toBe(1);
  });
});
