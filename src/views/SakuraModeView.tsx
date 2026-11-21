/**
 * Sakura mode view — unified skeleton with the EX-stage ladder.
 */

import { useRef } from "react";
import { PlayerInfoCard } from "../components/PlayerInfoCard";
import {
  BandRow,
  DeadlineChip,
  HeroNumerals,
  KpiRow,
  ModeHeader,
  SakuraExLadder,
  StatCell,
  ViewBottom,
} from "../components/cards";
import { buildSakuraStages } from "../core/sections";
import { formatTime } from "../core/calculators";
import type { ProcessedGameState } from "../core/types";

/** 10 seconds in frames — the in-game red-blink threshold. */
const LIMIT_BLINK_FRAMES = 10 * 60;

/**
 * Stage LIMIT countdown (in-game timer behaviour).
 * The memory field 0x4AE340 IS the remaining time — the game counts it down
 * directly, so no subtraction here.
 * - white while above 10s
 * - red blink once the remaining time drops to 10s or below
 * - a CLEAR (clearedStageLevel increment) while at/below 10s stops the blink
 *   instantly and freezes the value in white: the remaining time when
 *   cleared above 0s, "00:00:00" when cleared by the last piece at/below 0s
 * - a FAIL at/below 0s keeps blinking red until the next stage's fresh
 *   limit (>10s) arrives
 */
function useSakuraLimitChip(state: ProcessedGameState): DeadlineChip {
  const prevCleared = useRef(state.sakuraClearedStageLevel);
  const freeze = useRef<string | null>(null);

  if (state.timeFrames === 0) {
    freeze.current = null;
  } else {
    // stage cleared while the alarm was live: freeze the final reading
    if (state.sakuraClearedStageLevel > prevCleared.current) {
      const remaining = state.sakuraStageLimitTime;
      if (remaining <= LIMIT_BLINK_FRAMES) {
        freeze.current = remaining > 0 ? formatTime(remaining) : "00:00:00";
      }
    }
    // the next stage's fresh limit (60s) arrived: back to live countdown
    if (state.sakuraStageLimitTime > LIMIT_BLINK_FRAMES) {
      freeze.current = null;
    }
  }
  prevCleared.current = state.sakuraClearedStageLevel;

  if (freeze.current !== null) {
    return { label: "LIMIT", value: freeze.current };
  }

  const remaining = state.sakuraStageLimitTime;
  // no stage data at all (menu): plain zero, no alarm
  if (remaining <= 0 && state.sakuraStageElapsedTime <= 0) {
    return { label: "LIMIT", value: "00:00:00" };
  }
  if (remaining <= 0) {
    return { label: "LIMIT", value: "00:00:00", blink: true };
  }
  if (remaining <= LIMIT_BLINK_FRAMES) {
    return { label: "LIMIT", value: formatTime(remaining), blink: true };
  }
  return { label: "LIMIT", value: formatTime(remaining) };
}

export function SakuraModeView({ state }: { state: ProcessedGameState }) {
  const limitChip = useSakuraLimitChip(state);

  return (
    <>
      <PlayerInfoCard state={state} />
      <ModeHeader mode="SAKURA" state={state} />
      <HeroNumerals state={state} compact />
      <KpiRow tall>
        <StatCell label="STAGE" value={state.sakuraStageLevelDisplay} tone="gold" />
        {/* CLEARED stays plain: STAGE (gold) and JEWELS (cyan) already carry
            the colour coding on this row */}
        <StatCell label="CLEARED" value={String(state.sakuraClearedStageLevel)} />
        <StatCell label="JEWELS" value={String(state.remainingJewelBlocks)} tone="cyan" />
      </KpiRow>
      <SakuraExLadder state={state} />

      <BandRow
        state={state}
        left={limitChip}
        right={{ label: "ELAPSED", value: formatTime(state.sakuraStageElapsedTime) || "00:00:00" }}
      />

      <ViewBottom
        state={state}
        sections={buildSakuraStages(state)}
        columns={["section", "cumulative"]}
        sectionWord="Stage"
      />
    </>
  );
}
