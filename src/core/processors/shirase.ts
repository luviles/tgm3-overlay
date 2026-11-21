/**
 * Shirase mode processor (20G time attack).
 * Ported from Tgm3Visualizer.Core/Processors/ShiraseModeProcessor.cs
 */

import { formatTime, isShiraseRegret } from "../calculators";
import { getShiraseLimits, getShiraseRegretThresholdFrames } from "../sectionConstants";
import { SHIRASE_MAX_LOCK_FRAMES, getMaxLockFrame } from "../lockFrames";
import {
  applyCurrentSectionRealtime,
  applyStaffRollStatus,
  copyCommonFields,
  computeSectionTimeDisplays,
  MAX_STAFF_ROLL_FRAMES,
  recordSectionCrossing,
  sectionStartTime,
} from "./base";
import { createProcessedGameState, type GameState, type ProcessedGameState } from "../types";

/**
 * Max garbage quota thresholds per level section for Rising Garbage mode.
 * Section 5 (500-599): 20, 6: 18, 7: 10, 8: 9, 9: 8
 */
const SHIRASE_GARBAGE_QUOTA_MAX = [20, 18, 10, 9, 8];

export class ShiraseModeProcessor {
  private sectionCompletionTimes = new Array<number>(13).fill(0); // 0-12 (1300 levels)
  private sectionTimes = new Array<number>(13).fill(0);
  private regrets = new Array<boolean>(13).fill(false);
  private previousLevel = 0;
  private previousSection = 0;

  // Session-tracked state
  private staffRollLatch = false;
  private level500Checked = false;
  private level1000Checked = false;
  private level500Exceeded = false;
  private level1000Exceeded = false;

  process(currentState: GameState): ProcessedGameState {
    const result = createProcessedGameState();

    // 1. Common fields
    copyCommonFields(currentState, result);

    // Level-limit displays (identical in every state, including reset)
    const { limit500, limit1000 } = getShiraseLimits(result.controlMode);
    result.level500TimeLimitDisplay = formatTime(limit500);
    result.level1000TimeLimitDisplay = formatTime(limit1000);

    // 2. Reset detection (timeFrames == 0)
    if (currentState.timeFrames === 0) {
      this.reset();
      return result;
    }

    // 3. Section tracking
    const currentSection = Math.floor(currentState.level / 100);

    if (this.previousSection < currentSection && this.previousLevel > 0) {
      recordSectionCrossing(
        this.sectionCompletionTimes,
        this.sectionTimes,
        this.regrets,
        this.previousSection,
        currentState.timeFrames,
        isShiraseRegret
      );
    }

    result.sectionTimes = [...this.sectionTimes];
    result.regrets = [...this.regrets];

    // 4. Current section time + deadline + level time limit
    const prevSectionTotal = sectionStartTime(this.sectionCompletionTimes, currentSection);
    result.currentSectionTime = currentState.timeFrames - prevSectionTotal;

    if (currentSection < 13) {
      const regretThreshold = getShiraseRegretThresholdFrames(currentSection);
      result.regretDeadline = prevSectionTotal + regretThreshold;
    }

    // Level time limit check (first entry into level 500/1000)
    if (!this.level500Checked && currentState.level >= 500 && this.previousLevel < 500) {
      this.level500Exceeded = currentState.timeFrames > limit500;
      this.level500Checked = true;
    }

    if (!this.level1000Checked && currentState.level >= 1000 && this.previousLevel < 1000) {
      this.level1000Exceeded = currentState.timeFrames > limit1000;
      this.level1000Checked = true;
    }

    result.level500TimeLimitExceeded = this.level500Exceeded;
    result.level1000TimeLimitExceeded = this.level1000Exceeded;

    this.previousLevel = currentState.level;
    this.previousSection = currentSection;

    // Speed level = level (no Cool bonus in Shirase)
    result.speedLevel = currentState.level;
    result.maxLockFrame = getMaxLockFrame(SHIRASE_MAX_LOCK_FRAMES, result.speedLevel);

    // 5. Section time display formatting
    const { sectionTimeDisplays: timeDisplays, cumulativeTimeDisplays: cumulativeDisplays } =
      computeSectionTimeDisplays(result.sectionTimes, 13);

    applyCurrentSectionRealtime(
      result.sectionTimes,
      result.currentSectionTime,
      currentSection,
      13,
      timeDisplays,
      cumulativeDisplays
    );

    result.sectionTimeDisplays = timeDisplays;
    result.cumulativeTimeDisplays = cumulativeDisplays;

    // 6. Shirase display formatting
    if (currentState.level >= 500 && currentState.level < 1000) {
      const sectionIndex = Math.floor(currentState.level / 100) - 5; // 0-4 for sections 5-9
      if (sectionIndex >= 0 && sectionIndex < SHIRASE_GARBAGE_QUOTA_MAX.length) {
        result.maxGarbageQuota = SHIRASE_GARBAGE_QUOTA_MAX[sectionIndex];
      }
    }

    result.combinedGrade = result.finalGrade + result.sectionGradePoints;

    result.garbageQuotaText =
      result.maxGarbageQuota > 0 ? `${result.garbageQuota}/${result.maxGarbageQuota}` : "";

    // 7. Status card
    result.remainingStaffRollFrames = MAX_STAFF_ROLL_FRAMES - currentState.staffRollTime;
    // Shirase's credit roll gimmick: the pieces double in size — BIG BLOCK ROLL
    this.staffRollLatch = applyStaffRollStatus(result, this.staffRollLatch, "BIG BLOCK ROLL!!", () => {
      if (currentState.level >= 1000) result.statusCardTitle = "MONOCHROME\nBLOCK";
      else if (currentState.level >= 500) result.statusCardTitle = "RISING\nGARBAGE";
      else result.statusCardTitle = "NORMAL\nPLAY";
    });

    return result;
  }

  reset(): void {
    this.sectionCompletionTimes = new Array<number>(13).fill(0);
    this.sectionTimes = new Array<number>(13).fill(0);
    this.regrets = new Array<boolean>(13).fill(false);
    this.previousLevel = 0;
    this.previousSection = 0;

    this.staffRollLatch = false;
    this.level500Checked = false;
    this.level1000Checked = false;
    this.level500Exceeded = false;
    this.level1000Exceeded = false;
  }
}
