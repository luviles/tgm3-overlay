/**
 * Shirase mode view — unified skeleton with the level-limit ladder.
 */

import { useRef } from "react";
import { PlayerInfoCard } from "../components/PlayerInfoCard";
import {
  BandRow,
  CheckpointChip,
  HeroNumerals,
  KpiRow,
  ModeHeader,
  shiraseGrade,
  ShiraseLadder,
  StatCell,
  ViewBottom,
} from "../components/cards";
import { buildShiraseSections, lastCompletedSection } from "../core/sections";
import { deathRegretChip, useRegretChip } from "../hooks/useRegretChip";
import { useIncrementFlash } from "../hooks/useIncrementFlash";
import { formatTime, signedTime } from "../core/calculators";
import type { ProcessedGameState } from "../core/types";
import { getShiraseLimits, getShiraseRegretThresholdFrames } from "../core/sectionConstants";

/**
 * 3s blink window opened at the moment a checkpoint FAIL latches
 * (early termination) — the verdict flashes briefly, then rests in red.
 */
function useCheckpointFailBlink(state: ProcessedGameState): boolean {
  // init from the current state: mounting mid-run (after a fail) must not
  // fabricate the 3s fail blink
  const prev500 = useRef(state.level500TimeLimitExceeded);
  const prev1000 = useRef(state.level1000TimeLimitExceeded);
  const blinkUntil = useRef(0);

  const f500 = state.level500TimeLimitExceeded;
  const f1000 = state.level1000TimeLimitExceeded;
  if (state.timeFrames === 0) {
    blinkUntil.current = 0;
  } else {
    if (f500 && !prev500.current) blinkUntil.current = Date.now() + 3000;
    if (f1000 && !prev1000.current) blinkUntil.current = Date.now() + 3000;
  }
  prev500.current = f500;
  prev1000.current = f1000;
  return Date.now() < blinkUntil.current;
}

/**
 * 3s CYAN celebration when a checkpoint is reached within its limit:
 * shows the margin (how far under the limit) as a lap-time flash, then the
 * countdown advances to the next requirement.
 */
function useCheckpointCelebration(
  state: ProcessedGameState
): { chip: CheckpointChip; until: number } | null {
  // init from the current state: mounting past a checkpoint must not
  // fabricate its celebration
  const prev500 = useRef(state.level >= 500);
  const prev1000 = useRef(state.level >= 1000);
  const win = useRef<{ chip: CheckpointChip; until: number } | null>(null);

  const crossed500 = state.level >= 500;
  const crossed1000 = state.level >= 1000;

  if (state.timeFrames === 0) {
    win.current = null;
  } else {
    const { limit500, limit1000 } = getShiraseLimits(state.controlMode);
    // a checkpoint reached within its limit: 3s cyan margin lap
    const crossingChip = (label: string, limit: number): CheckpointChip => ({
      label,
      value: signedTime(limit - state.timeFrames),
      tone: "cyan",
      flash: "cyan",
    });

    if (crossed500 && !prev500.current && !state.level500TimeLimitExceeded) {
      win.current = { until: Date.now() + 3000, chip: crossingChip("TO LV 500", limit500) };
    }
    if (crossed1000 && !prev1000.current && !state.level1000TimeLimitExceeded) {
      win.current = { until: Date.now() + 3000, chip: crossingChip("TO LV 1000", limit1000) };
    }
  }
  prev500.current = crossed500;
  prev1000.current = crossed1000;

  return win.current && Date.now() < win.current.until ? win.current : null;
}

/**
 * Past the level-1000 checkpoint there is no time attack left — the chip
 * slot carries the most recently completed section's lap instead: at the
 * 1000 crossing that is the lap which earned the pass, through the
 * monochrome sections it is the last finished lap, and after the 1300
 * clear it rests as the closing stat. Each update lands with a 3s flash in
 * the section's verdict colour (cyan, red on a regret). Refs init from the
 * current state (mount-safe).
 */
function useLastSectionChip(state: ProcessedGameState): CheckpointChip {
  const latest = lastCompletedSection(state);

  const prevLatest = useRef(latest);
  const flashUntil = useRef(0);
  const flashTone = useRef<"cyan" | "red">("cyan");

  if (latest > prevLatest.current) {
    flashUntil.current = Date.now() + 3000;
    flashTone.current = state.regrets[latest] ? "red" : "cyan";
  }
  prevLatest.current = latest;

  if (latest < 0) return { label: "LAST SECTION", value: "--" };
  return {
    label: "LAST SECTION",
    value: formatTime(state.sectionTimes[latest]),
    flash: latest >= 0 && Date.now() < flashUntil.current ? flashTone.current : undefined,
  };
}

/**
 * Live countdown to the next level checkpoint (500, then 1000).
 * States: white while under the limit, red once over; a confirmed FAIL
 * (early termination) flashes red for 3s, then rests in red. Past a
 * in-time 1000 crossing the slot carries the LAST SECTION chip instead
 * (no time attack remains after level 1000).
 */
function checkpointChip(
  state: ProcessedGameState,
  failBlink: boolean,
  /** the chip shown once past the 1000 checkpoint (no time attack left) */
  past1000: CheckpointChip
): CheckpointChip {
  // target only advances past a checkpoint that was reached IN TIME
  const target = state.level >= 1000 || (state.level >= 500 && !state.level500TimeLimitExceeded)
    ? 1000
    : 500;

  // passed 1000 within the limit — no time attack left: show the last lap
  if (target === 1000 && state.level >= 1000 && !state.level1000TimeLimitExceeded) {
    return past1000;
  }

  const { limit500, limit1000 } = getShiraseLimits(state.controlMode);
  const remaining = (target === 1000 ? limit1000 : limit500) - state.timeFrames;
  return {
    label: `TO LV ${target}`,
    value: signedTime(remaining),
    tone: remaining >= 0 ? undefined : "red",
    blink: failBlink,
  };
}

/**
 * Section number for the KPI. When a level-limit checkpoint FAILS, the run
 * is over — lock the display to the section being played at death (the one
 * BEFORE the checkpoint: 500-fail -> 5th, 1000-fail -> 10th) so post-death
 * memory drift never moves it, mirroring the frozen countdown chip.
 */
function shiraseSectionDisplay(state: ProcessedGameState): number {
  if (state.level1000TimeLimitExceeded) return 10;
  if (state.level500TimeLimitExceeded) return 5;
  // 13 sections total — the level-1300 clear caps the display
  return Math.min(state.section + 1, 13);
}

/**
 * On early termination (level-limit fail) the whole time column freezes:
 * the REGRET chip holds the death section's final verdict for the rest of
 * the run instead of a countdown for a section never played.
 */
function torikanDeathRegret(state: ProcessedGameState): CheckpointChip | null {
  if (!state.level500TimeLimitExceeded && !state.level1000TimeLimitExceeded) return null;

  const deathSection = state.level1000TimeLimitExceeded ? 9 : 4;
  return (
    deathRegretChip(state, deathSection, getShiraseRegretThresholdFrames) ?? {
      label: "REGRET",
      value: "N/A",
      tone: "red",
    }
  );
}

/**
 * Torikan (time-attack limit) death: the run ends at the crossing, so every
 * condition indicator locks to the state AT DEATH — the condition card keeps
 * the gimmick the player was in (500-fail died in NORMAL, 1000-fail died in
 * RISING GARBAGE; the next gimmick was never entered).
 */
function torikanStatusTitle(state: ProcessedGameState): string | undefined {
  if (state.level1000TimeLimitExceeded) return "RISING\nGARBAGE";
  if (state.level500TimeLimitExceeded) return "NORMAL\nPLAY";
  return undefined;
}

export function ShiraseModeView({ state }: { state: ProcessedGameState }) {
  const regret = useRegretChip(state, {
    thresholdFor: getShiraseRegretThresholdFrames,
  });
  const lastSection = useLastSectionChip(state);
  const failBlink = useCheckpointFailBlink(state);
  const celebration = useCheckpointCelebration(state);
  const gradeFlash = useIncrementFlash(state.combinedGrade);
  const regretFlash = useIncrementFlash(state.sectionRegretCount);
  return (
    <>
      <PlayerInfoCard state={state} />
      <ModeHeader mode="SHIRASE" state={state} />
      <HeroNumerals state={state} compact />
      <KpiRow tall>
        <StatCell
          label="GRADE"
          value={shiraseGrade(state)}
          tone="gold"
          flash={gradeFlash}
        />
        <StatCell label="SECTION" value={String(shiraseSectionDisplay(state))} tone="cyan" />
        <StatCell
          label="REGRET"
          value={String(state.sectionRegretCount)}
          tone="red"
          flash={regretFlash}
        />
      </KpiRow>
      <ShiraseLadder
        state={state}
        torikanFailed={state.level500TimeLimitExceeded || state.level1000TimeLimitExceeded}
      />

      <BandRow
        state={state}
        statusTitle={torikanStatusTitle(state)}
        left={
          // the section lap burst outranks the torikan death freeze for its
          // 3s window — a regret at the death crossing still flashes, then
          // the frozen lap takes over
          regret.flash ? regret : (torikanDeathRegret(state) ?? regret)
        }
        right={celebration?.chip ?? checkpointChip(state, failBlink, lastSection)}
      />

      <ViewBottom
        state={state}
        sections={buildShiraseSections(state)}
        columns={["section", "cumulative"]}
      />
    </>
  );
}
