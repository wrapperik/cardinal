import { useLocalSearchParams, useRouter } from "expo-router";
import { useRef, useState } from "react";

import { gameHref } from "@/features/home/topics";
import { runAt, shouldShowCheckpoint } from "@/features/recap/recap-rules";
import {
  endRecap,
  getActiveRecap,
  reportRecapAnswer,
  restartRecap,
  useActiveRecap,
} from "@/features/recap/session";
import { scoreForTally } from "@/features/score/score";
import { emptyTally, type SessionTally } from "@/features/sessions/session-rules";
import { useDecks } from "@/features/upload/decks";
import type { AnswerResult } from "@/types/cardinal";

export interface RecapRunner {
  /** True when a recap is driving this screen. */
  active: boolean;
  /** 1-based position for the NN/NN readout: global across the recap when active. */
  step: (localIndex: number) => number;
  /** Total for the readout: the whole recap when active, else the local round count. */
  total: (localCount: number) => number;
  /** Reports the outcome of the round just finished and returns true when a
   *  checkpoint has replaced the game screen. */
  report: (result: AnswerResult) => boolean;
  /** Called instead of router.back() when a screen runs out of rounds. */
  finishLeg: () => void;
  /** Called from an exit gesture. Ends the session but leaves the checkpoint to resume from. */
  abandon: () => void;
  /** Points earned so far in this run, live. */
  score: number;
  /** Current streak, live. */
  streak: number;
  /** The points just awarded by the most recent report(), for the flyer to
   *  animate. `key` is monotonic so two answers worth the same amount still
   *  each trigger a fresh animation — `amount` alone wouldn't change identity. */
  lastAward: { amount: number; correct: boolean; key: number } | null;
  /** Restarts the run from its first card. */
  restart: () => void;
  /** Bumped by restart(). Game screens reset their own local round state in
   *  a useEffect keyed on this, rather than on navigation succeeding — a
   *  router.replace to the SAME route the player is already on has
   *  ambiguous remount behaviour, so local state cannot rely on it. */
  restartToken: number;
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
  const decks = useDecks();

  // Captured once, at mount: the global position this leg starts at. Reading
  // it live off `recapState.index` instead would double-count every step —
  // that index advances by one on every `report()`, in lockstep with the
  // screen's own local round index, so both climbing together would skip a
  // position each render instead of counting it once. Total has no such
  // problem: the plan's length never changes mid-recap, so it can stay live.
  const [legStart] = useState(() => getActiveRecap()?.index ?? 0);

  // Ephemeral — see the interface doc comment on `score`. Never touches the
  // sessions/progress stores; exists purely so a standalone game still has
  // something to show a running total against.
  const [localTally, setLocalTally] = useState(emptyTally());

  const [lastAward, setLastAward] = useState<{ amount: number; correct: boolean; key: number } | null>(null);
  const awardKey = useRef(0);

  const [restartToken, setRestartToken] = useState(0);

  // Every existing call site of report() guards against a double-fire with
  // its own `committing` ref, so reading `localTally` from this render
  // closure (rather than inside a state updater) is safe — there is no
  // back-to-back call within the same tick to race against.
  function report(result: AnswerResult): boolean {
    if (active) {
      // Read before AND after: scoreForTally is not additive per-answer — it
      // recomputes the streak bonus from the tally's current peak streak each
      // time, so an answer that happens to cross STREAK_BONUS_FROM earns more
      // than its own raw weight. The award has to be measured as a delta
      // across the call, not assumed from the result type alone.
      const before = getActiveRecap()?.tally ?? null;
      reportRecapAnswer(result);
      const after = getActiveRecap()?.tally ?? null;
      if (before && after && result !== "passed") {
        awardKey.current += 1;
        setLastAward({ amount: scoreForTally(after) - scoreForTally(before), correct: result === "correct", key: awardKey.current });
      }
      const current = getActiveRecap();
      if (current && shouldShowCheckpoint(current.index, current.plan.cards.length)) {
        router.replace("/checkpoint");
        return true;
      }
      return false;
    }

    if (result === "passed") return false; // no session, and passes never move localTally anyway

    // Mirrors recordAnswer's counting exactly (session-rules.ts) but without
    // gameTypesPlayed bookkeeping — this tally is display-only and never
    // summarised, and report() has no gameType to give recordAnswer even if
    // it wanted the full behaviour.
    const currentStreak = result === "correct" ? localTally.currentStreak + 1 : 0;
    const next: SessionTally = {
      correctCount: localTally.correctCount + (result === "correct" ? 1 : 0),
      wrongCount: localTally.wrongCount + (result === "incorrect" ? 1 : 0),
      passedCount: localTally.passedCount,
      bestStreakInSession: Math.max(localTally.bestStreakInSession, currentStreak),
      currentStreak,
      gameTypesPlayed: localTally.gameTypesPlayed,
    };
    awardKey.current += 1;
    setLastAward({ amount: scoreForTally(next) - scoreForTally(localTally), correct: result === "correct", key: awardKey.current });
    setLocalTally(next);
    return false;
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
    router.replace("/complete");
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

  function restart() {
    if (active && recapState) {
      const state = restartRecap(decks, recapState.courseId);
      const run = state && runAt(state.plan, state.index);
      if (run) router.replace(gameHref(run.gameType, recapState.courseId, true));
      // No fallback branch: restartRecap only returns null when the course has
      // nothing to recap, which cannot be true here — this screen is already
      // mid-recap, so a plan demonstrably exists.
    } else {
      setLocalTally(emptyTally());
    }
    setRestartToken((t) => t + 1);
  }

  const score = active && recapState ? scoreForTally(recapState.tally) : scoreForTally(localTally);
  const streak = active && recapState ? recapState.tally.currentStreak : localTally.currentStreak;

  return {
    active,
    step: (localIndex) => (active ? legStart + localIndex + 1 : localIndex + 1),
    total: (localCount) => (active && recapState ? recapState.plan.cards.length : localCount),
    report,
    finishLeg,
    abandon,
    score,
    streak,
    lastAward,
    restart,
    restartToken,
  };
}
