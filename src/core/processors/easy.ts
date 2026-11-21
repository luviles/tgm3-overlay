/**
 * Easy mode processor (Hanabi score, 2-section tracking).
 * Ported from Tgm3Visualizer.Core/Processors/EasyModeProcessor.cs
 */

import { EASY_MAX_LOCK_FRAME } from "../lockFrames";
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

export class EasyModeProcessor {
  private sectionCompletionTimes = new Array<number>(2).fill(0);
  private sectionTimes = new Array<number>(2).fill(0);
  private previousLevel = 0;
  private previousSection = 0;

  // Session-tracked state
  private staffRollLatch = false;

  process(currentState: GameState): ProcessedGameState {
    const result = createProcessedGameState();

    // 1. Common fields + Easy-specific input
    copyCommonFields(currentState, result);
    result.hanabiScore = currentState.hanabiScore;

    // 2. Reset detection (timeFrames == 0)
    if (currentState.timeFrames === 0) {
      this.reset();
      return result;
    }

    // 3. Section tracking (no regret verdicts in Easy)
    const currentSection = Math.floor(currentState.level / 100);

    if (this.previousSection < currentSection && this.previousLevel > 0) {
      recordSectionCrossing(
        this.sectionCompletionTimes,
        this.sectionTimes,
        null,
        this.previousSection,
        currentState.timeFrames,
        null
      );
    }

    result.sectionTimes = [...this.sectionTimes];

    result.currentSectionTime =
      currentState.timeFrames - sectionStartTime(this.sectionCompletionTimes, currentSection);

    this.previousLevel = currentState.level;
    this.previousSection = currentSection;

    result.speedLevel = currentState.level;
    result.maxLockFrame = EASY_MAX_LOCK_FRAME;

    // 4. Section time display formatting
    const { sectionTimeDisplays: timeDisplays, cumulativeTimeDisplays: cumulativeDisplays } =
      computeSectionTimeDisplays(result.sectionTimes, 2);

    applyCurrentSectionRealtime(
      result.sectionTimes,
      result.currentSectionTime,
      currentSection,
      2,
      timeDisplays,
      cumulativeDisplays
    );

    result.sectionTimeDisplays = timeDisplays;
    result.cumulativeTimeDisplays = cumulativeDisplays;

    // 5. Status card
    result.remainingStaffRollFrames = MAX_STAFF_ROLL_FRAMES - currentState.staffRollTime;
    this.staffRollLatch = applyStaffRollStatus(result, this.staffRollLatch, "CREDIT ROLL!!", () => {
      result.statusCardTitle = "NORMAL\nPLAY";
    });

    return result;
  }

  reset(): void {
    this.sectionCompletionTimes = new Array<number>(2).fill(0);
    this.sectionTimes = new Array<number>(2).fill(0);
    this.previousLevel = 0;
    this.previousSection = 0;
    this.staffRollLatch = false;
  }
}
