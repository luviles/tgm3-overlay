/**
 * Sakura mode processor: stage progress, jewel blocks, stage time limits.
 * Ported from Tgm3Visualizer.Core/Processors/SakuraModeProcessor.cs
 */

import { formatTime, toSakuraCurrentStageName } from "../calculators";
import { SAKURA_MAX_LOCK_FRAME } from "../lockFrames";
import { copyCommonFields, computeSectionTimeDisplays } from "./base";
import { createProcessedGameState, type GameState, type ProcessedGameState } from "../types";

export class SakuraModeProcessor {
  private stageTimes = new Array<number>(27).fill(0);
  private stageCleared = new Array<boolean>(27).fill(false);
  private stageForfeited = new Array<boolean>(27).fill(false);
  private previousStageLevel = -1;
  private previousClearedStageLevel = 0;
  private previousTimeFrames = 0;
  private clearedReached19 = false;
  private clearedReached20 = false;
  private latchedCumulativeFrames = 0;

  // EX play budget: latched at the 20th clear (entry remainder + 1-minute
  // bonus) before the main clock repurposes to EX progress
  private exBudgetLatched = false;
  private exEntryBudget = 0;

  process(currentState: GameState): ProcessedGameState {
    const result = createProcessedGameState();

    // 1. Common fields + Sakura-specific fields
    copyCommonFields(currentState, result);

    result.sakuraStageLimitTime = currentState.sakuraStageLimitTime;
    result.sakuraStageElapsedTime = currentState.sakuraStageElapsedTime;
    result.sakuraStageLevel = currentState.sakuraStageLevel;
    result.sakuraClearedStageLevel = currentState.sakuraClearedStageLevel;
    result.sakuraStageLevelDisplay = toSakuraCurrentStageName(currentState.sakuraStageLevel);

    // 2. Reset detection — NOT timeFrames === 0. In Sakura the main clock
    // is the total time BUDGET (counts down), and it legitimately reaches
    // zero during the buzzer-beater: the last piece must fully lock, and a
    // clear judgment or a jewel removal can still EXTEND the time — the
    // game only ends when no extension comes. Until then the run is alive
    // and every tracker keeps recording. A NEW game is detected by the
    // budget jumping back up to its fresh 3-minute start (time extensions
    // are far smaller), or by the stage index going backwards (EX runs end
    // high and drop to 0 at the next game).
    if (
      currentState.timeFrames > this.previousTimeFrames + 1800 ||
      (this.previousStageLevel >= 0 && currentState.sakuraStageLevel < this.previousStageLevel)
    ) {
      this.reset();
      // remember the new baseline so the first live tick is not itself a
      // rise (otherwise every tick of a fresh game would re-reset)
      this.previousTimeFrames = currentState.timeFrames;
      return result;
    }
    this.previousTimeFrames = currentState.timeFrames;

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

    // 5. EX stage tier determination (latch) — REGULAR STAGES ONLY
    // The tier is decided by the 1-20 performance and FROZEN once the extra
    // stages are entered: an EX-stage clear that pushes the memory cleared
    // count to 20 (forfeit-one run playing EX 1-3) must NOT upgrade the
    // tier afterwards — the game has already decided how many EX stages
    // there are. Late EX attach with no observed regular latches leaves
    // the tier undetermined (ladder unlit) rather than guessing.
    if (currentIdx < 20) {
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
    }

    // Determine EX tier based on the frozen latches
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

    // 7. Hero TIME — OUR cumulative play time, unconditionally: the game's
    // main clock is the total time budget during stages 1-20 (3:00 ±
    // bonuses) and the EX progress time during the extra stages, so it is
    // never a plain cumulative — we display the stage laps we track
    // ourselves (completed laps + the current stage's live elapsed)
    let cumulative = 0;
    for (let i = 0; i <= currentIdx; i++) cumulative += this.stageTimes[i];
    result.formattedTime = cumulative > 0 ? formatTime(cumulative) : "00:00:00";

    // 8. EX budget: the constraint is (remaining budget at the 20th clear
    // + the 1-minute EX bonus). The main clock repurposes to EX progress
    // at entry, so the budget is latched on the clear tick — the last
    // moment it still lives in the main clock — and counted down ourselves
    result.sakuraExRemaining = -1;
    if (!this.exBudgetLatched && currentState.sakuraClearedStageLevel >= 20 && currentIdx < 20) {
      this.exBudgetLatched = true;
      this.exEntryBudget = currentState.timeFrames + 60 * 60;
    }
    if (currentIdx >= 20) {
      // missed the clear tick (late attach): fall back to latching at the
      // first EX tick — the clock may have flipped already, so this
      // underestimates (CE verification pending)
      if (!this.exBudgetLatched) {
        this.exBudgetLatched = true;
        this.exEntryBudget = currentState.timeFrames + 60 * 60;
      }
      result.sakuraExRemaining = Math.max(0, this.exEntryBudget - currentState.timeFrames);
    }

    return result;
  }

  reset(): void {
    this.stageTimes = new Array<number>(27).fill(0);
    this.stageCleared = new Array<boolean>(27).fill(false);
    this.stageForfeited = new Array<boolean>(27).fill(false);
    this.previousStageLevel = -1;
    this.previousClearedStageLevel = 0;
    this.previousTimeFrames = 0;
    this.clearedReached19 = false;
    this.clearedReached20 = false;
    this.latchedCumulativeFrames = 0;
    this.exBudgetLatched = false;
    this.exEntryBudget = 0;
  }
}
