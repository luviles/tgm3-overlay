/**
 * Base helpers shared by the mode processors.
 * Ported from Tgm3Visualizer.Core/Processors/GameStateProcessorBase.cs
 */

import { formatTime } from "../calculators";
import type { GameState, ProcessedGameState } from "../types";

/** 3265f playable staff-roll time (excludes the 360f fanfare). */
export const MAX_STAFF_ROLL_FRAMES = 3265;

/**
 * Copies common fields from GameState to ProcessedGameState:
 * level/time, player info, playfield, grade-related fields and the
 * formatted total time.
 */
export function copyCommonFields(currentState: GameState, result: ProcessedGameState): void {
  // Level & time
  result.level = currentState.level;
  result.timeFrames = currentState.timeFrames;
  result.gameType = currentState.gameType;
  result.section = Math.floor(currentState.level / 100);

  // Grade-related
  result.finalGrade = currentState.finalGrade;
  result.sectionGradePoints = currentState.sectionGradePoints;
  result.sectionRegretCount = currentState.sectionRegretCount;
  result.awardedGradePoints = currentState.awardedGradePoints;
  result.decayTime = currentState.decayTime;
  result.internalGrade = currentState.internalGrade;

  // Player info
  result.nickname = currentState.nickname;
  result.decorationPoints = currentState.decorationPoints;
  // Login status: if all 3 nickname characters are whitespace, user is not logged in
  result.isLoggedIn = currentState.nickname.length > 0 && currentState.nickname.trim().length > 0;
  result.worldEasyHiScore = currentState.worldEasyHiScore;
  result.classicEasyHiScore = currentState.classicEasyHiScore;
  result.worldSakuraHiGrade = currentState.worldSakuraHiGrade;
  result.classicSakuraHiGrade = currentState.classicSakuraHiGrade;
  result.worldMasterCurrentGrade = currentState.worldMasterCurrentGrade;
  result.classicMasterCurrentGrade = currentState.classicMasterCurrentGrade;
  result.worldShiraseHiGrade = currentState.worldShiraseHiGrade;
  result.classicShiraseHiGrade = currentState.classicShiraseHiGrade;
  result.worldMasterGradeHistory = [...currentState.worldMasterGradeHistory];
  result.classicMasterGradeHistory = [...currentState.classicMasterGradeHistory];
  result.worldDemotionPoints = currentState.worldDemotionPoints;
  result.classicDemotionPoints = currentState.classicDemotionPoints;

  // Status
  result.gameProcessStatus = currentState.gameProcessStatus;
  result.isInvisible = (currentState.fieldStatus & 0x40) === 0x40;
  result.isStaffRollActive = (currentState.gameFlag & 0x01) === 0x01;
  result.controlMode = (currentState.gameFlag & 0x10) === 0x10 ? "WORLD" : "CLASSIC";

  // Playfield (clone: the processor mutates its own arrays, results must not alias them)
  result.playfield = currentState.playfield.map((row) => [...row]);

  // Lock delay / move resets
  result.lockDelay = currentState.lockDelay;
  result.shiftMoveResetCount = currentState.shiftMoveResetCount;
  result.rotationMoveResetCount = currentState.rotationMoveResetCount;

  // Garbage quota
  result.garbageQuota = currentState.garbageQuota;

  // Master exam flags
  result.masterExamFlags = currentState.masterExamFlags;

  // Common display formatting
  result.formattedTime =
    currentState.timeFrames > 0 ? formatTime(currentState.timeFrames) : "00:00:00";
}

/**
 * Computes formatted section time displays from individual section times.
 * Returns sectionTimeDisplays and cumulativeTimeDisplays arrays
 * (same length as the input array).
 */
export function computeSectionTimeDisplays(
  sectionTimes: number[],
  count: number
): { sectionTimeDisplays: string[]; cumulativeTimeDisplays: string[] } {
  const sectionTimeDisplays = new Array<string>(sectionTimes.length).fill("");
  const cumulativeTimeDisplays = new Array<string>(sectionTimes.length).fill("");

  let cumulative = 0;
  for (let i = 0; i < count && i < sectionTimes.length; i++) {
    if (sectionTimes[i] > 0) {
      cumulative += sectionTimes[i];
      sectionTimeDisplays[i] = formatTime(sectionTimes[i]);
      cumulativeTimeDisplays[i] = formatTime(cumulative);
    }
  }

  return { sectionTimeDisplays, cumulativeTimeDisplays };
}

/**
 * Records a section boundary crossing: stores the completed section's
 * total time, its per-section time, and (when a regret predicate is given)
 * the section's regret verdict.
 */
export function recordSectionCrossing(
  completionTimes: number[],
  sectionTimes: number[],
  regrets: boolean[] | null,
  previousSection: number,
  timeFrames: number,
  regretFn: ((sectionTimeFrames: number, section: number) => boolean) | null
): void {
  completionTimes[previousSection] = timeFrames;

  const previousTotal = previousSection > 0 ? completionTimes[previousSection - 1] : 0;
  const sectionTime = timeFrames - previousTotal;
  sectionTimes[previousSection] = sectionTime;

  if (regrets && regretFn) {
    regrets[previousSection] = regretFn(sectionTime, previousSection);
  }
}

/**
 * Total time elapsed when the current section started (0 for section 0 or
 * when the previous section's completion has not been recorded).
 */
export function sectionStartTime(completionTimes: number[], currentSection: number): number {
  return currentSection > 0 && completionTimes[currentSection - 1] > 0
    ? completionTimes[currentSection - 1]
    : 0;
}

/**
 * Real-time display for the section currently in progress: patches the
 * section/cumulative time display slots for `currentSection`.
 * Returns true when the section is in progress and the slots were filled.
 */
export function applyCurrentSectionRealtime(
  sectionTimes: number[],
  currentSectionTime: number,
  currentSection: number,
  maxSections: number,
  timeDisplays: string[],
  cumulativeDisplays: string[]
): boolean {
  if (currentSection < 0 || currentSection >= maxSections || sectionTimes[currentSection] !== 0) {
    return false;
  }
  timeDisplays[currentSection] = formatTime(currentSectionTime);

  let cumulative = 0;
  for (let i = 0; i < currentSection; i++) {
    if (sectionTimes[i] > 0) cumulative += sectionTimes[i];
  }
  cumulative += currentSectionTime;
  cumulativeDisplays[currentSection] = formatTime(cumulative);
  return true;
}

/**
 * Staff-roll status card. `remainingStaffRollFrames` must already be set on
 * `result`. Once the roll is detected the latch stays on for the rest of
 * the run (the game flag clears before timeFrames resets), showing
 * `rollTitle` with a remaining-time subtitle ("CLEAR!!" at zero); otherwise
 * `fallback` fills the in-game status card. Returns the latch to store.
 */
export function applyStaffRollStatus(
  result: ProcessedGameState,
  latch: boolean,
  rollTitle: string,
  /** non-roll default title; omit when the title is already set */
  fallback?: () => void
): boolean {
  const latched = latch || result.isStaffRollActive;

  if (latched) {
    result.statusCardTitle = rollTitle;
    result.statusCardSubtitle =
      result.remainingStaffRollFrames > 0
        ? formatTime(result.remainingStaffRollFrames)
        : "CLEAR!!";
    result.showStaffRollTime = true;
  } else {
    result.showStaffRollTime = false;
    result.statusCardSubtitle = "";
    fallback?.();
  }

  return latched;
}

/**
 * Section-tracking state shared by the level-based processors (Master,
 * Shirase, Easy): the completion/lap/regret arrays and the crossing cursor.
 * Mode-specific edges (Master's in-place 999 completion, Shirase's torikan
 * first-entry checks) read `previousLevel` BETWEEN cross() and advance(),
 * so the cursor only moves when the processor says so.
 */
export class SectionTracker {
  readonly sectionCompletionTimes: number[];
  readonly sectionTimes: number[];
  readonly regrets: boolean[];
  previousLevel = 0;
  previousSection = 0;

  constructor(readonly count: number) {
    this.sectionCompletionTimes = new Array<number>(count).fill(0);
    this.sectionTimes = new Array<number>(count).fill(0);
    this.regrets = new Array<boolean>(count).fill(false);
  }

  /** Section index for a level (0-12 for levels 0-1299). */
  static sectionOf(level: number): number {
    return Math.floor(level / 100);
  }

  /**
   * Record the section boundary crossing if the level entered a new section
   * since the last advance(). Does NOT move the cursor — mode logic between
   * cross() and advance() still observes the previous level.
   */
  cross(
    level: number,
    timeFrames: number,
    regretFn: ((sectionTimeFrames: number, section: number) => boolean) | null
  ): number {
    const currentSection = SectionTracker.sectionOf(level);
    if (this.previousSection < currentSection && this.previousLevel > 0) {
      recordSectionCrossing(
        this.sectionCompletionTimes,
        this.sectionTimes,
        this.regrets,
        this.previousSection,
        timeFrames,
        regretFn
      );
    }
    return currentSection;
  }

  /** Move the cursor to the current level/section (end of tick). */
  advance(level: number, currentSection: number): void {
    this.previousLevel = level;
    this.previousSection = currentSection;
  }

  /** Copy the accumulated lap/regret arrays onto a processed result. */
  snapshot(result: ProcessedGameState): void {
    result.sectionTimes = [...this.sectionTimes];
    result.regrets = [...this.regrets];
  }

  reset(): void {
    this.sectionCompletionTimes.fill(0);
    this.sectionTimes.fill(0);
    this.regrets.fill(false);
    this.previousLevel = 0;
    this.previousSection = 0;
  }
}

