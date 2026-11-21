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
import type { CheckpointChip } from "../components/cards";
import type { ProcessedGameState } from "../core/types";
import { signedTime } from "../core/calculators";
import { lastCompletedSection } from "../core/sections";

export interface RegretChipConfig {
  /** regret threshold (frames) for a section index */
  thresholdFor: (section: number) => number;
}

/**
 * The death section's final REGRET verdict (Master's 500 torikan and
 * Shirase's 500/1000 early terminations): the same window-remainder value
 * (limit − lap) and tone its 3s lap burst showed, held for the rest of the
 * run. Null while the run is alive or when the death lap was never
 * recorded — what to show then is mode policy.
 */
export function deathRegretChip(
  state: ProcessedGameState,
  deathSection: number,
  thresholdFor: (section: number) => number
): CheckpointChip | null {
  const lap = state.sectionTimes[deathSection];
  if (!(lap > 0)) return null;
  const windowRemaining = thresholdFor(deathSection) - lap;
  return {
    label: "REGRET",
    value: signedTime(windowRemaining),
    tone: state.regrets[deathSection] ? "red" : "cyan",
  };
}

interface Burst {
  until: number;
  chip: CheckpointChip;
}

export function useRegretChip(state: ProcessedGameState, config: RegretChipConfig): CheckpointChip {
  const burst = useRef<Burst | null>(null);

  // Section COMPLETION (not the section index) is the burst trigger:
  // normal crossings advance the index, but Master's final section
  // (900-999) completes IN place at level 999 — that only shows up as
  // sectionTimes[9] rising from 0.
  const lastCompleted = lastCompletedSection(state);

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
