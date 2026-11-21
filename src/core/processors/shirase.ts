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
  SectionTracker,
  sectionStartTime,
} from "./base";
import { createProcessedGameState, type GameState, type ProcessedGameState } from "../types";

/**
 * Max garbage quota thresholds per level section for Rising Garbage mode.
 * Section 5 (500-599): 20, 6: 18, 7: 10, 8: 9, 9: 8
 */
const SHIRASE_GARBAGE_QUOTA_MAX = [20, 18, 10, 9, 8];

export class ShiraseModeProcessor {
  private readonly sections = new SectionTracker(13); // 0-12 (1300 levels)

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
    const currentSection = this.sections.cross(
      currentState.level,
      currentState.timeFrames,
      isShiraseRegret
    );
    this.sections.snapshot(result);

    // 4. Current section time + deadline
    const prevSectionTotal = sectionStartTime(this.sections.sectionCompletionTimes, currentSection);
    result.currentSectionTime = currentState.timeFrames - prevSectionTotal;

    if (currentSection < 13) {
      const regretThreshold = getShiraseRegretThresholdFrames(currentSection);
      result.regretDeadline = prevSectionTotal + regretThreshold;
    }

    // Level time limit check (first entry into level 500/1000) — reads the
    // PRE-advance cursor: the edge must be the crossing itself
    if (!this.level500Checked && currentState.level >= 500 && this.sections.previousLevel < 500) {
      this.level500Exceeded = currentState.timeFrames > limit500;
      this.level500Checked = true;
    }

    if (!this.level1000Checked && currentState.level >= 1000 && this.sections.previousLevel < 1000) {
      this.level1000Exceeded = currentState.timeFrames > limit1000;
      this.level1000Checked = true;
    }

    result.level500TimeLimitExceeded = this.level500Exceeded;
    result.level1000TimeLimitExceeded = this.level1000Exceeded;

    this.sections.advance(currentState.level, currentSection);

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
      // rising garbage: sections 5-9 map to quota slots 0-4
      result.maxGarbageQuota = SHIRASE_GARBAGE_QUOTA_MAX[currentSection - 5];
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
    this.sections.reset();
    this.staffRollLatch = false;
    this.level500Checked = false;
    this.level1000Checked = false;
    this.level500Exceeded = false;
    this.level1000Exceeded = false;
  }
}
