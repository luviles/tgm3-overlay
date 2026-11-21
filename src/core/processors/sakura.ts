/**
 * Sakura mode processor: stage progress, jewel blocks, stage time limits.
 * Ported from Tgm3Visualizer.Core/Processors/SakuraModeProcessor.cs
 */

import { toSakuraCurrentStageName } from "../calculators";
import { SAKURA_MAX_LOCK_FRAME } from "../lockFrames";
import { copyCommonFields, computeSectionTimeDisplays } from "./base";
import { createProcessedGameState, type GameState, type ProcessedGameState } from "../types";

export class SakuraModeProcessor {
  private stageTimes = new Array<number>(27).fill(0);
  private stageCleared = new Array<boolean>(27).fill(false);
  private stageForfeited = new Array<boolean>(27).fill(false);
  private previousStageLevel = -1;
  private previousClearedStageLevel = 0;
  private clearedReached19 = false;
  private clearedReached20 = false;
  private latchedCumulativeFrames = 0;

  process(currentState: GameState): ProcessedGameState {
    const result = createProcessedGameState();

    // 1. Common fields + Sakura-specific fields
    copyCommonFields(currentState, result);

    result.sakuraStageLimitTime = currentState.sakuraStageLimitTime;
    result.sakuraStageElapsedTime = currentState.sakuraStageElapsedTime;
    result.sakuraClearedStageLevel = currentState.sakuraClearedStageLevel;
    result.sakuraStageLevelDisplay = toSakuraCurrentStageName(currentState.sakuraStageLevel);

    // 2. Reset detection
    if (currentState.timeFrames === 0) {
      this.reset();
      return result;
    }

    // 3. Stage tracking
    const currentIdx = currentState.sakuraStageLevel;

    // Real-time: record elapsed time for current stage
    if (currentIdx >= 0 && currentIdx < 27) {
      this.stageTimes[currentIdx] = currentState.sakuraStageElapsedTime;
    }

    // Clear detection: when clearedStageLevel increases, mark the cleared
    // stage green. If the stage index advanced on the SAME tick, the clear
    // belongs to the stage just LEFT (the finished one) — not the new stage.
    const stageAdvanced =
      currentIdx > this.previousStageLevel && this.previousStageLevel >= 0;
    const clearTarget = stageAdvanced ? this.previousStageLevel : currentIdx;
    if (
      currentState.sakuraClearedStageLevel > this.previousClearedStageLevel &&
      clearTarget >= 0 &&
      clearTarget < 27
    ) {
      this.stageCleared[clearTarget] = true;
    }

    // Stage transition: a stage left behind without a clear is forfeited (red)
    if (stageAdvanced && this.previousStageLevel < 27) {
      if (!this.stageCleared[this.previousStageLevel]) {
        this.stageForfeited[this.previousStageLevel] = true;
      }
    }

    result.sakuraStageTimes = [...this.stageTimes];
    result.sakuraStageCleared = [...this.stageCleared];
    result.sakuraStageForfeited = [...this.stageForfeited];

    this.previousClearedStageLevel = currentState.sakuraClearedStageLevel;
    this.previousStageLevel = currentIdx;

    // 4. Jewel block count (0x12-0x19)
    let jewelCount = 0;
    for (let y = 0; y < 22; y++) {
      for (let x = 0; x < 10; x++) {
        const cell = currentState.playfield[y][x];
        if (cell >= 0x12 && cell <= 0x19) {
          jewelCount++;
        }
      }
    }
    result.remainingJewelBlocks = jewelCount;

    result.speedLevel = currentState.level;
    result.maxLockFrame = SAKURA_MAX_LOCK_FRAME;

    // 5. EX stage tier determination (latch)
    // The cleared counts only ever rise, so the latch is checked on every
    // tick regardless of the current stage index — gating it on
    // "still in the regular stages" could skip the latch entirely when the
    // level-20 clear is first observed on a tick that already reads EX1.
    if (!this.clearedReached19 && currentState.sakuraClearedStageLevel >= 19) {
      this.clearedReached19 = true;
    }

    if (!this.clearedReached20 && currentState.sakuraClearedStageLevel >= 20) {
      this.clearedReached20 = true;
      this.latchedCumulativeFrames = 0;
      for (let i = 0; i < 20; i++) {
        this.latchedCumulativeFrames += this.stageTimes[i];
      }
    }

    // Determine EX tier based on latch
    if (this.clearedReached20) {
      result.exStageTier = this.latchedCumulativeFrames > 5 * 60 * 60 ? 5 : 7;
    } else if (this.clearedReached19) {
      result.exStageTier = 3;
    }

    // Cleared visual status (priority: rainbow > green > normal)
    if (this.clearedReached20) result.clearedStageStatus = 2; // Rainbow
    else if (this.clearedReached19) result.clearedStageStatus = 1; // Green

    // 6. Section time display formatting
    const { sectionTimeDisplays, cumulativeTimeDisplays } = computeSectionTimeDisplays(
      result.sakuraStageTimes,
      27
    );
    result.sectionTimeDisplays = sectionTimeDisplays;
    result.cumulativeTimeDisplays = cumulativeTimeDisplays;

    return result;
  }

  reset(): void {
    this.stageTimes = new Array<number>(27).fill(0);
    this.stageCleared = new Array<boolean>(27).fill(false);
    this.stageForfeited = new Array<boolean>(27).fill(false);
    this.previousStageLevel = -1;
    this.previousClearedStageLevel = 0;
    this.clearedReached19 = false;
    this.clearedReached20 = false;
    this.latchedCumulativeFrames = 0;
  }
}
