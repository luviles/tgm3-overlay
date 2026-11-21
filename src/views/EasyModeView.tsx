/**
 * Easy mode view — unified skeleton with the HANABI showcase panel.
 */

import { PlayerInfoCard } from "../components/PlayerInfoCard";
import { BandRow, EasyScore, HeroNumerals, ModeHeader, ViewBottom } from "../components/cards";
import { buildEasySections } from "../core/sections";
import { formatTime } from "../core/calculators";
import type { ProcessedGameState } from "../core/types";

export function EasyModeView({ state }: { state: ProcessedGameState }) {
  return (
    <>
      <PlayerInfoCard state={state} />
      <ModeHeader mode="EASY" state={state} />
      <HeroNumerals state={state} compact />
      <EasyScore state={state} />

      <BandRow
        state={state}
        left={{
          label: "SECTION",
          // never "N/A": zero until the first tick, and the staff roll has
          // no section clock — it rests at zero
          value: state.showStaffRollTime
            ? "00:00:00"
            : formatTime(state.currentSectionTime) || "00:00:00",
        }}
        right={{ label: "TOTAL", value: state.formattedTime }}
      />

      <ViewBottom
        state={state}
        sections={buildEasySections(state)}
        columns={["section", "cumulative"]}
      />
    </>
  );
}
