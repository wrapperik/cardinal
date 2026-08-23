import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";

import { gameHref } from "@/features/home/topics";
import { runAt } from "@/features/recap/recap-rules";
import { endRecap, getActiveRecap, reportRecapAnswer, useActiveRecap } from "@/features/recap/session";
import type { AnswerResult } from "@/types/cardinal";

export interface RecapRunner {
  /** True when a recap is driving this screen. */
  active: boolean;
  /** 1-based position for the NN/NN readout: global across the recap when active. */
  step: (localIndex: number) => number;
  /** Total for the readout: the whole recap when active, else the local round count. */
  total: (localCount: number) => number;
  /** Report the outcome of the round just finished. No-op when inactive. */
  report: (result: AnswerResult) => void;
  /** Called instead of router.back() when a screen runs out of rounds. */
  finishLeg: () => void;
  /** Called from an exit gesture. Ends the session but leaves the checkpoint to resume from. */
  abandon: () => void;
}

/**
 * The seam between a standalone game screen and a recap driving it.
 *
 * `active` requires BOTH an active store entry AND `recap=1` on the route —
 * either alone is not enough. A stale store entry with no route flag could
 * hijack a screen the player opened standalone straight from home; a route
 * flag with no store entry means the recap already ended (or never began)
 * and this screen has nothing to read.
 */
export function useRecapRunner(): RecapRunner {
  const router = useRouter();
  const { recap } = useLocalSearchParams<{ recap?: string }>();
  const recapState = useActiveRecap();
  const active = recapState !== null && recap === "1";

  // Captured once, at mount: the global position this leg starts at. Reading
  // it live off `recapState.index` instead would double-count every step —
  // that index advances by one on every `report()`, in lockstep with the
  // screen's own local round index, so both climbing together would skip a
  // position each render instead of counting it once. Total has no such
  // problem: the plan's length never changes mid-recap, so it can stay live.
  const [legStart] = useState(() => getActiveRecap()?.index ?? 0);

  function report(result: AnswerResult) {
    if (!active) return;
    reportRecapAnswer(result);
  }

  function finishLeg() {
    if (!active) {
      router.back();
      return;
    }

    // Read fresh rather than trusting `recapState`: the last `report()` call
    // updated the module-level store synchronously, but this component may
    // not have re-rendered to pick that up yet, so the render-time snapshot
    // above can still be one answer behind.
    const current = getActiveRecap();
    const next = current ? runAt(current.plan, current.index) : null;

    if (current && next) {
      router.replace(gameHref(next.gameType, current.courseId, true));
      return;
    }

    endRecap();
    // back(), not replace("/home"): every leg reached this screen by
    // REPLACING the previous one, so the stack is still [home, thisGame] and
    // popping lands on the home that is already sitting under it. Replacing
    // would push a second Home on top of the first, leaving two of them
    // mounted — and Home is not inert, it runs a marquee frame callback per
    // pill row for as long as it exists.
    if (router.canGoBack()) router.back();
    else router.replace("/home");
  }

  function abandon() {
    // Gated on `active` for the same reason `active` needs both signals at
    // all: a screen opened standalone must not tear down a recap it was
    // never part of. When inactive this is exactly the router.back() every
    // screen did before the recap existed.
    // The checkpoint survives an active abandon — endRecap only clears it
    // when the plan actually finished — so leaving mid-recap resumes from
    // here next time rather than restarting the whole course.
    if (active) endRecap();
    router.back();
  }

  return {
    active,
    step: (localIndex) => (active ? legStart + localIndex + 1 : localIndex + 1),
    total: (localCount) => (active && recapState ? recapState.plan.cards.length : localCount),
    report,
    finishLeg,
    abandon,
  };
}
