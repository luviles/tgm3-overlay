/**
 * Master mode processor (Cool/Regret tracking).
 * Ported from Tgm3Visualizer.Core/Processors/MasterModeProcessor.cs
 */

import {
  calculateGradeHistory,
  formatGradePoints,
  formatTime,
  getMaxDecayTime,
  isRegret,
  toDisplayGrade,
  toGradeName,
} from "../calculators";
import {
  getCoolThresholdFrames,
  getRegretThresholdFrames,
  INT_MAX,
} from "../sectionConstants";
import { MASTER_MAX_LOCK_FRAMES, getMaxLockFrame } from "../lockFrames";
import {
  applyCurrentSectionRealtime,
  applyStaffRollStatus,
  copyCommonFields,
  computeSectionTimeDisplays,
  MAX_STAFF_ROLL_FRAMES,
  recordSectionCrossing,
  sectionStartTime,
} from "./base";
import {
  createProcessedGameState,
  type GameState,
  type ProcessedGameState,
} from "../types";

/**
 * Exam flag decoding + status card title. Identical on the reset path and
 * the live path so the two screens can never drift.
 */
function applyExamStatus(result: ProcessedGameState): void {
  result.isPromotionExam = (result.masterExamFlags & 0x02) !== 0;
  result.isDemotionExam = !result.isPromotionExam && (result.masterExamFlags & 0x10) !== 0;

  if (result.isDemotionExam) result.statusCardTitle = "DEMOTIONAL\nEXAM";
  else if (result.isPromotionExam) result.statusCardTitle = "PROMOTIONAL\nEXAM";
  else result.statusCardTitle = "NORMAL\nPLAY";
}

/**
 * Master career displays: grade name, the control-mode-selected grade
 * history (+ average) and demotion points. Identical on the reset path and
 * the live path.
 */
function applyCareerDisplays(result: ProcessedGameState): void {
  result.gradeDisplay = toGradeName(result.combinedGrade);
  const history =
    result.controlMode === "WORLD"
      ? result.worldMasterGradeHistory
      : result.classicMasterGradeHistory;
  result.selectedDemotionPoints =
    result.controlMode === "WORLD" ? result.worldDemotionPoints : result.classicDemotionPoints;
  const calc = calculateGradeHistory(history);
  result.gradeHistoryEntries = calc.entries;
  result.averageGradeDisplay = calc.averageGrade;
  result.averageGradeValue = calc.averageGradeValue;
  result.demotionProgressDisplay = `${result.selectedDemotionPoints}/30`;
}

export class MasterModeProcessor {
  private sectionCompletionTimes = new Array<number>(10).fill(0);
  private sectionTimes = new Array<number>(10).fill(0);
  private seventyPercentTimes = new Array<number>(10).fill(0);
  private cools = new Array<boolean>(10).fill(false);
  private regrets = new Array<boolean>(10).fill(false);
  private previousCoolTime = INT_MAX;
  private previousLevel = 0;
  private previousSection = 0;
  private previousCheckpointCount = 0;

  // COOL deadline is FIXED once per section (computed on the section's first
  // tick): the grace base is the PREVIOUS section's 70% time, captured before
  // this section's own x70 crossing updates previousCoolTime.
  private sectionCoolLimit = 0;
  private sectionCoolLimitSection = -1;

  // Session-tracked state
  private maxSectionGradePoints = 0;
  private maxStaffRollGradeThisSession = 0;
  private staffRollClearApplied = false;
  private staffRollLatch = false;

  process(currentState: GameState): ProcessedGameState {
    const result = createProcessedGameState();

    // 1. Common fields + Master-specific input
    copyCommonFields(currentState, result);

    result.remainingStaffRollFrames = MAX_STAFF_ROLL_FRAMES - currentState.staffRollTime;

    // Staff Roll Grade Points based on Invisible/Fading roll
    if (result.isInvisible) {
      result.staffRollGradePoints =
        0.6 * currentState.staffRollTetrisCount + 0.1 * currentState.staffRollLineClear;
    } else {
      result.staffRollGradePoints =
        0.1 * currentState.staffRollTetrisCount + 0.04 * currentState.staffRollLineClear;
    }

    // staffRollClearPoints calculated later (needs isStaffRollActive)
    result.staffRollClearPoints = 0;

    result.internalGradeDisplay = toDisplayGrade(currentState.internalGrade);

    // 2. Reset detection (timeFrames == 0)
    if (currentState.timeFrames === 0) {
      result.combinedGrade =
        result.finalGrade +
        result.sectionGradePoints +
        Math.trunc(result.staffRollGradePoints + result.staffRollClearPoints);
      applyExamStatus(result);

      // Grade history (available from memory even on reset)
      applyCareerDisplays(result);

      this.reset();
      return result;
    }

    // 3. Section tracking
    const currentSection = Math.floor(currentState.level / 100);

    // Detect section boundary crossed
    if (this.previousSection < currentSection && this.previousLevel > 0) {
      recordSectionCrossing(
        this.sectionCompletionTimes,
        this.sectionTimes,
        this.regrets,
        this.previousSection,
        currentState.timeFrames,
        isRegret
      );
    }

    // Detect final section completion (level 999 in Master mode): section 9
    // never gets crossed out of, so it is recorded explicitly
    if (currentState.level === 999 && this.previousLevel < 999) {
      recordSectionCrossing(
        this.sectionCompletionTimes,
        this.sectionTimes,
        this.regrets,
        9,
        currentState.timeFrames,
        isRegret
      );
    }

    // Grace base snapshot: on the section's FIRST tick this is the previous
    // section's 70% time (this section's x70 hasn't crossed yet)
    const graceBaseCoolTime = this.previousCoolTime;

    // Detect 70% checkpoint (memory-based, not available in last section)
    if (
      currentSection < 9 &&
      this.previousCheckpointCount < currentState.seventyPercentCheckpointCount
    ) {
      const previousTotal =
        currentSection > 0 ? this.sectionCompletionTimes[currentSection - 1] : 0;
      const seventyPercentTime = currentState.timeFrames - previousTotal;

      this.seventyPercentTimes[currentSection] = seventyPercentTime;
      this.previousCoolTime = seventyPercentTime;
      this.previousCheckpointCount = currentState.seventyPercentCheckpointCount;
    }

    // Detect Section COOL from game memory
    if (currentState.sectionCoolFlag === 1 && !this.cools[currentSection]) {
      this.cools[currentSection] = true;
    }

    // Copy accumulated states
    result.sectionTimes = [...this.sectionTimes];
    result.seventyPercentTimes = [...this.seventyPercentTimes];
    result.cools = [...this.cools];
    result.regrets = [...this.regrets];
    let totalCools = 0;
    for (const cool of this.cools) if (cool) totalCools++;
    result.totalCools = totalCools;

    // Speed level: level + (cool count * 100)
    result.speedLevel = currentState.level + result.totalCools * 100;
    result.maxLockFrame = getMaxLockFrame(MASTER_MAX_LOCK_FRAMES, result.speedLevel);

    // 4. Current section time + deadline
    const prevSectionTotal = sectionStartTime(this.sectionCompletionTimes, currentSection);
    result.currentSectionTime = currentState.timeFrames - prevSectionTotal;

    if (currentSection < 10) {
      const regretThreshold = getRegretThresholdFrames(currentSection);
      result.regretDeadline = prevSectionTotal + regretThreshold;

      if (currentSection < 9) {
        // compute the COOL limit ONCE per section (first tick): at that
        // moment previousCoolTime is still the previous section's 70% time
        if (this.sectionCoolLimitSection !== currentSection) {
          const absoluteCoolLimit = getCoolThresholdFrames(currentSection);
          let effectiveCoolLimit: number;

          if (
            graceBaseCoolTime < INT_MAX &&
            currentSection > 0 &&
            this.cools[currentSection - 1]
          ) {
            const graceLimit = graceBaseCoolTime + 120;
            effectiveCoolLimit = Math.min(absoluteCoolLimit, graceLimit);
          } else {
            effectiveCoolLimit = absoluteCoolLimit;
          }

          this.sectionCoolLimit = effectiveCoolLimit;
          this.sectionCoolLimitSection = currentSection;
        }

        result.coolDeadline = prevSectionTotal + this.sectionCoolLimit;
      }
    }

    this.previousLevel = currentState.level;
    this.previousSection = currentSection;

    // 5. Session tracking
    if (result.sectionGradePoints > this.maxSectionGradePoints) {
      this.maxSectionGradePoints = result.sectionGradePoints;
    }
    result.maxSectionGradePoints = this.maxSectionGradePoints;

    // Detect clear FIRST (so staffRollClearPoints is set on same frame)
    if (
      result.remainingStaffRollFrames <= 0 &&
      !this.staffRollClearApplied &&
      result.isStaffRollActive
    ) {
      this.staffRollClearApplied = true;
    }

    if (this.staffRollClearApplied && result.isStaffRollActive) {
      result.staffRollClearPoints = result.isInvisible ? 1.6 : 0.5;
    }

    const totalStaffRollPoints = result.staffRollGradePoints + result.staffRollClearPoints;
    if (totalStaffRollPoints > this.maxStaffRollGradeThisSession) {
      this.maxStaffRollGradeThisSession = totalStaffRollPoints;
    }

    result.maxStaffRollGradePoints = this.maxStaffRollGradeThisSession;

    // 6. Grade calculation
    result.combinedGrade =
      result.finalGrade +
      result.sectionGradePoints +
      Math.trunc(result.staffRollGradePoints + result.staffRollClearPoints);

    // 7. Progress calculation
    result.awardedGradePointsProgress = result.awardedGradePoints / 100.0;
    const maxDecay = getMaxDecayTime(result.internalGrade);
    result.decayTimeRemaining = maxDecay - result.decayTime;
    result.decayTimeProgress = maxDecay > 0 ? result.decayTimeRemaining / maxDecay : 0;

    // 8. Invisible roll qualification check
    result.isSectionCoolQualified = this.maxSectionGradePoints >= 9; // Rainbow Brush
    result.isInternalGradeQualified = result.internalGrade >= 27; // Lime Brush (S7)

    // 9. Exam status + status card
    applyExamStatus(result);
    this.staffRollLatch = applyStaffRollStatus(
      result,
      this.staffRollLatch,
      result.isInvisible ? "INVISIBLE ROLL!!" : "FADING ROLL!",
      () => {
        // non-roll default title already set by applyExamStatus
      }
    );

    // 10. Section time display formatting
    const { sectionTimeDisplays: timeDisplays, cumulativeTimeDisplays: cumulativeDisplays } =
      computeSectionTimeDisplays(result.sectionTimes, 10);

    const seventyPercentDisplays = new Array<string>(10).fill("");
    for (let i = 0; i < 10; i++) {
      if (result.seventyPercentTimes[i] > 0) {
        seventyPercentDisplays[i] = formatTime(result.seventyPercentTimes[i]);
      }
    }

    // Real-time display for current section (+ 70% time: counting until x70,
    // then frozen; not available in the last section)
    const realtimeDrawn = applyCurrentSectionRealtime(
      result.sectionTimes,
      result.currentSectionTime,
      currentSection,
      10,
      timeDisplays,
      cumulativeDisplays
    );
    if (
      realtimeDrawn &&
      currentSection < 9 &&
      result.seventyPercentTimes[currentSection] === 0
    ) {
      seventyPercentDisplays[currentSection] = formatTime(result.currentSectionTime);
    }

    result.sectionTimeDisplays = timeDisplays;
    result.cumulativeTimeDisplays = cumulativeDisplays;
    result.seventyPercentTimeDisplays = seventyPercentDisplays;

    // 11. Master display formatting
    result.internalGradeText = `${currentState.internalGrade} (Grade ${result.internalGradeDisplay})`;
    result.staffRollGradePointsDisplay = formatGradePoints(result.maxStaffRollGradePoints);
    applyCareerDisplays(result);

    return result;
  }

  reset(): void {
    this.sectionCompletionTimes = new Array<number>(10).fill(0);
    this.sectionTimes = new Array<number>(10).fill(0);
    this.seventyPercentTimes = new Array<number>(10).fill(0);
    this.cools = new Array<boolean>(10).fill(false);
    this.regrets = new Array<boolean>(10).fill(false);
    this.previousCoolTime = INT_MAX;
    this.previousLevel = 0;
    this.previousSection = 0;
    this.previousCheckpointCount = 0;
    this.sectionCoolLimit = 0;
    this.sectionCoolLimitSection = -1;

    this.maxSectionGradePoints = 0;
    this.maxStaffRollGradeThisSession = 0;
    this.staffRollClearApplied = false;
    this.staffRollLatch = false;
  }
}
