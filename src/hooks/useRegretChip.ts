/**
 * Shared REGRET countdown chip (MASTER + SHIRASE, identical behaviour):
 * - remaining window: "-xx:xx:xx" in white
 * - past the deadline: "+xx:xx:xx" in red
 * - section completed WITH a regret: 3s RED lap-time flash of the overdue
 * - section completed within the limit: 3s CYAN lap-time flash of the
 *   margin (the stopwatch consistency: every verdict gets its lap moment)
 *
 * Modes parameterize section count and the threshold table.
 */

import { useRef } from "react";
import type { DeadlineChip } from "../components/cards";
import type { ProcessedGameState } from "../core/types";
import { signedTime } from "../core/calculators";

export interface RegretChipConfig {
  /** regret threshold (frames) for a section index */
  thresholdFor: (section: number) => number;
}

interface Burst {
  until: number;
  chip: DeadlineChip;
}

export function useRegretChip(state: ProcessedGameState, config: RegretChipConfig): DeadlineChip {
  const burst = useRef<Burst | null>(null);

  // the most recent COMPLETED section — the highest recorded lap. Section
  // COMPLETION is the burst trigger: normal crossings advance the section
  // index, but Master's final section (900-999) completes IN place at
  // level 999 — that only shows up as sectionTimes[9] rising from 0. (The
  // old index-edge check missed it, and clamping the index the other way
  // swallowed Shirase's 1300 crossing — this form catches both.)
  let lastCompleted = -1;
  for (let i = state.sectionTimes.length - 1; i >= 0; i--) {
    if (state.sectionTimes[i] > 0) {
      lastCompleted = i;
      break;
    }
  }

  // init from the current state: mounting mid-run must not fabricate a lap
  // burst for sections whose completion was never observed
  const prevCompleted = useRef(lastCompleted);

  if (state.timeFrames === 0) {
    burst.current = null;
    prevCompleted.current = -1;
  } else if (lastCompleted > prevCompleted.current) {
    const done = lastCompleted;
    const threshold = config.thresholdFor(done);
    const sectionTime = state.sectionTimes[done];

    // how much of the regret window remained when the section ended — the
    // SAME quantity the live countdown shows (negative = overrun, positive
    // = margin), so the sign convention falls out naturally
    const windowRemaining = threshold - sectionTime;

    if (state.regrets[done]) {
      burst.current = {
        until: Date.now() + 3000,
        chip: {
          label: "REGRET",
          value: signedTime(windowRemaining),
          tone: "red",
          flash: "red",
        },
      };
    } else if (sectionTime > 0) {
      burst.current = {
        until: Date.now() + 3000,
        chip: {
          label: "REGRET",
          value: signedTime(windowRemaining),
          tone: "cyan",
          flash: "cyan",
        },
      };
    }
    prevCompleted.current = lastCompleted;
  }

  if (burst.current && Date.now() < burst.current.until) {
    return burst.current.chip;
  }
  if (state.regretDeadline <= 0) {
    return { label: "REGRET", value: "N/A" };
  }
  const remaining = state.regretDeadline - state.timeFrames;
  return {
    label: "REGRET",
    value: signedTime(remaining),
    tone: remaining >= 0 ? undefined : "red",
  };
}
