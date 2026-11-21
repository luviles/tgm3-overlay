/**
 * Master mode view — unified skeleton with the GRADE HISTORY card.
 */

import { useRef } from "react";
import { PlayerInfoCard } from "../components/PlayerInfoCard";
import {
  BandRow,
  DeadlineChip,
  HeroNumerals,
  KpiRow,
  MasterHistoryCard,
  MasterSession,
  ModeHeader,
  StatCell,
  ViewBottom,
} from "../components/cards";
import { buildMasterSections } from "../core/sections";
import { useRegretChip } from "../hooks/useRegretChip";
import { useIncrementFlash } from "../hooks/useChangeFlash";
import { signedTime } from "../core/calculators";
import { getRegretThresholdFrames } from "../core/sectionConstants";
import type { ProcessedGameState } from "../core/types";
import type { MasterSectionTimes, Settings } from "../hooks/useSettings";
import type { SectionTimeColumn } from "../components/SectionTimerControl";

/** Settings preset -> the two time columns the Master section list shows. */
const MASTER_SECTION_COLUMNS: Record<MasterSectionTimes, [SectionTimeColumn, SectionTimeColumn]> = {
  "section-cumulative": ["section", "cumulative"],
  "seventy-cumulative": ["seventy", "cumulative"],
  "seventy-section": ["seventy", "section"],
};

/** Level-500 time limit: 7 minutes (25200 frames). */
const MASTER_500_LIMIT_FRAMES = 7 * 60 * 60;

/**
 * Master's level-500 early termination: crossing 500 after 7 minutes ends
 * the run — unless a promotional/demotional exam is underway (exempt).
 * Latched at the crossing tick, cleared on reset.
 */
function useMaster500Fail(state: ProcessedGameState): boolean {
  // init from the current level: mounting mid-run past 500 must not
  // fabricate the torikan freeze
  const prevLevel = useRef(state.level);
  const failed = useRef(false);

  if (state.timeFrames === 0) {
    failed.current = false;
  } else if (
    prevLevel.current < 500 &&
    state.level >= 500 &&
    state.timeFrames > MASTER_500_LIMIT_FRAMES &&
    !state.isPromotionExam &&
    !state.isDemotionExam
  ) {
    failed.current = true;
  }
  prevLevel.current = state.level;

  return failed.current;
}

/**
 * COOL countdown chip for the Master band:
 * remaining time to the section's COOL threshold (grace-aware, frozen once
 * per section). Cyan while under; the moment the internal 70% check awards
 * the COOL, the timer freezes and fires a 3s celebration burst; past the
 * threshold without a COOL: "+" in white.
 * On a 500-limit death the chip holds the DEATH SECTION's (400-500) frozen
 * verdict instead of starting a countdown for a section never played.
 */
function useCoolChip(state: ProcessedGameState, failHold: boolean): DeadlineChip {
  const frozenCool = useRef<{ section: number; remaining: number } | null>(null);
  // verdict of the last COMPLETED section, preserved across the section change
  const lastSectionCool = useRef<{ section: number; remaining: number } | null>(null);
  const coolBurstUntil = useRef(0);
  // first render arms the freeze without the celebration burst: mounting
  // mid-run inside an already-judged section is not a COOL event
  const mounted = useRef(false);

  const section = Math.min(state.section, 9);
  if (state.timeFrames === 0) {
    frozenCool.current = null;
    lastSectionCool.current = null;
  } else if (frozenCool.current && frozenCool.current.section !== section) {
    lastSectionCool.current = frozenCool.current;
    frozenCool.current = null;
  }

  // early termination: hold the 400-500 section's final COOL verdict
  if (failHold && lastSectionCool.current?.section === 4) {
    const held = lastSectionCool.current.remaining;
    return {
      label: "COOL",
      value: signedTime(held),
      tone: held >= 0 ? "cyan" : undefined,
    };
  }

  if (section >= 9 || state.coolDeadline <= 0) {
    return { label: "COOL", value: "N/A" };
  }

  // The COOL judgment happens at the x70 crossing: once this section's 70%
  // time is recorded (seventyPercentTimes), the verdict is set — freeze the
  // timer at that moment whether the COOL was awarded or missed. Only an
  // observed AWARD fires the 3s celebration burst.
  const judged = state.seventyPercentTimes[section] > 0;
  if ((state.cools[section] || judged) && !frozenCool.current) {
    frozenCool.current = { section, remaining: state.coolDeadline - state.timeFrames };
    if (state.cools[section] && mounted.current) {
      coolBurstUntil.current = Date.now() + 3000;
    }
  }
  mounted.current = true;
  const remaining = frozenCool.current
    ? frozenCool.current.remaining
    : state.coolDeadline - state.timeFrames;
  return {
    label: "COOL",
    value: signedTime(remaining),
    tone: remaining >= 0 ? "cyan" : undefined,
    flash: Date.now() < coolBurstUntil.current ? "cyan" : undefined,
  };
}

/**
 * On a 500-limit death the REGRET chip holds the death section's (400-500)
 * final verdict — the same window-remainder value (limit − lap) and tone
 * its 3s lap burst showed, like Shirase's level-limit freeze.
 */
function frozenMasterRegretChip(state: ProcessedGameState, failHold: boolean): DeadlineChip | null {
  if (!failHold) return null;
  const lap = state.sectionTimes[4];
  if (!(lap > 0)) return null;
  const windowRemaining = getRegretThresholdFrames(4) - lap;
  return {
    label: "REGRET",
    value: signedTime(windowRemaining),
    tone: state.regrets[4] ? "red" : "cyan",
  };
}

export function MasterModeView({
  state,
  settings,
}: {
  state: ProcessedGameState;
  settings: Settings;
}) {
  const fail500 = useMaster500Fail(state);
  const cool = useCoolChip(state, fail500);
  const regret = useRegretChip(state, {
    thresholdFor: getRegretThresholdFrames,
  });
  const frozenRegret = frozenMasterRegretChip(state, fail500);

  // a lap burst (the 3s window carries flash) outranks everything — the
  // final section's 999 verdict must flash even if the roll flag lands on
  // the same memory tick. After the window: the roll rests at N/A (matching
  // the COOL chip), then the 500-fail freeze.
  const regretChip: DeadlineChip = regret.flash
    ? regret
    : state.showStaffRollTime
      ? { label: "REGRET", value: "N/A" }
      : (frozenRegret ?? regret);

  // KPI INCREMENT flashes (grade-up sound condition: only rises flash;
  // game-end memory resets never do). SECTION never flashes.
  const gradeFlash = useIncrementFlash(state.combinedGrade);
  const coolFlash = useIncrementFlash(state.maxSectionGradePoints);
  const regretFlash = useIncrementFlash(state.sectionRegretCount);

  // Roll practice: blank the playfield during FADING/INVISIBLE roll per the
  // settings — but a CLEAR judgment (remaining frames reached 0) always
  // reveals the field, regardless of the toggles.
  const rolling = state.showStaffRollTime;
  const rollCleared = rolling && state.remainingStaffRollFrames <= 0;
  const hidePlayfield =
    rolling &&
    !rollCleared &&
    (state.isInvisible ? !settings.showPlayfieldInvisibleRoll : !settings.showPlayfieldFadingRoll);

  return (
    <>
      <PlayerInfoCard state={state} />
      <ModeHeader mode="MASTER" state={state} />
      <MasterHistoryCard state={state} />
      <HeroNumerals state={state} />
      <KpiRow>
        <StatCell label="GRADE" value={state.gradeDisplay} tone="gold" flash={gradeFlash} />
        <StatCell
          label="COOL"
          value={String(state.maxSectionGradePoints)}
          // 9 COOLs (invisible-roll condition): the 8→9 increment blink is
          // the moment; afterwards plain cyan like any other value
          tone="cyan"
          flash={coolFlash}
        />
        <StatCell
          label="REGRET"
          value={String(state.sectionRegretCount)}
          tone="red"
          flash={regretFlash}
        />
      </KpiRow>
      <MasterSession state={state} />

      <BandRow state={state} left={cool} right={regretChip} />

      <ViewBottom
        state={state}
        sections={buildMasterSections(state)}
        columns={MASTER_SECTION_COLUMNS[settings.masterSectionTimes]}
        hidePlayfield={hidePlayfield}
        colourByPosition
      />
    </>
  );
}
