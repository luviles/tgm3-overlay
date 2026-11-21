/**
 * Section-list derivation — ported from the mode ViewModels'
 * UpdateFromGameState section handling (MasterModeViewModel #12,
 * ShiraseModeViewModel #7, EasyModeViewModel #6, SakuraModeViewModel #6).
 */

import { getSectionRange } from "./calculators";
import { toSakuraGradeName } from "./converters";
import type { ProcessedGameState } from "./types";

export enum SectionStatus {
  None = 0,
  Normal = 1,
  Cool = 2,
  Regret = 3,
}

export interface SectionInfo {
  range: string;
  time: string;
  cumulativeTime: string;
  seventyPercentTime: string;
  status: SectionStatus;
  isCool: boolean;
}

function emptySection(range: string): SectionInfo {
  return {
    range,
    time: "",
    cumulativeTime: "",
    seventyPercentTime: "",
    status: SectionStatus.None,
    isCool: false,
  };
}

/** Fill one row's time/cumulative slots from the display arrays. Returns
 *  true when the row has data (a completed or in-progress section). */
function fillTimeColumns(s: SectionInfo, state: ProcessedGameState, i: number): boolean {
  if ((state.sectionTimeDisplays[i] ?? "") === "") return false;
  s.time = state.sectionTimeDisplays[i];
  s.cumulativeTime = state.cumulativeTimeDisplays[i] ?? "";
  return true;
}

/** Master: 10 sections, 70% time column, regret > cool > normal (VM #12). */
export function buildMasterSections(state: ProcessedGameState): SectionInfo[] {
  const sections = Array.from({ length: 10 }, (_, i) => emptySection(getSectionRange(i)));

  for (let i = 0; i < sections.length; i++) {
    sections[i].seventyPercentTime = state.seventyPercentTimeDisplays[i] ?? "";

    if ((state.sectionTimeDisplays[i] ?? "") !== "") {
      sections[i].time = state.sectionTimeDisplays[i];
      sections[i].cumulativeTime = state.cumulativeTimeDisplays[i] ?? "";

      if (i === 9) {
        // last section has no Cool
        sections[i].status = state.regrets[i] ? SectionStatus.Regret : SectionStatus.Normal;
        sections[i].isCool = false;
      } else {
        sections[i].status = state.regrets[i]
          ? SectionStatus.Regret
          : state.cools[i]
            ? SectionStatus.Cool
            : SectionStatus.Normal;
        sections[i].isCool = state.cools[i];
      }
    }
  }

  // Real-time display for the current (in-progress) section
  const current = state.section;
  if (
    current >= 0 &&
    current < sections.length &&
    current < state.sectionTimes.length &&
    state.sectionTimes[current] === 0
  ) {
    sections[current].time = state.sectionTimeDisplays[current] ?? "";
    sections[current].cumulativeTime = state.cumulativeTimeDisplays[current] ?? "";

    // 70% time: counting until x70, then frozen
    if (state.seventyPercentTimes[current] === 0) {
      sections[current].seventyPercentTime = state.seventyPercentTimeDisplays[current] ?? "";
    }

    if (current < state.cools.length && state.cools[current]) {
      sections[current].isCool = true;
    }

    sections[current].status = SectionStatus.Normal;
  }

  return sections;
}

/** Shirase: 13 sections with cumulative time, regret > normal (VM #7). */
export function buildShiraseSections(state: ProcessedGameState): SectionInfo[] {
  const sections = Array.from({ length: 13 }, (_, i) => emptySection(getSectionRange(i, true)));

  for (let i = 0; i < sections.length; i++) {
    if (fillTimeColumns(sections[i], state, i)) {
      sections[i].status = state.regrets[i] ? SectionStatus.Regret : SectionStatus.Normal;
    }
  }

  return sections;
}

/** Easy: 2 sections, normal only (VM #6). */
export function buildEasySections(state: ProcessedGameState): SectionInfo[] {
  const sections = Array.from({ length: 2 }, (_, i) => emptySection(getSectionRange(i)));

  for (let i = 0; i < sections.length; i++) {
    if (fillTimeColumns(sections[i], state, i)) {
      sections[i].status = SectionStatus.Normal;
    }
  }

  return sections;
}

/** Sakura: 27 stages, cleared (green) > forfeited (red) > in progress > not started (VM #6). */
export function buildSakuraStages(state: ProcessedGameState): SectionInfo[] {
  const sections = Array.from({ length: 27 }, (_, i) => emptySection(toSakuraGradeName(i + 1)));

  for (let i = 0; i < sections.length; i++) {
    fillTimeColumns(sections[i], state, i);

    if (state.sakuraStageCleared[i]) {
      sections[i].status = SectionStatus.Cool; // green
    } else if (state.sakuraStageForfeited[i]) {
      sections[i].status = SectionStatus.Regret; // red
    } else if (state.sakuraStageTimes[i] > 0) {
      sections[i].status = SectionStatus.Normal;
    } else {
      sections[i].status = SectionStatus.None;
    }
  }

  return sections;
}
