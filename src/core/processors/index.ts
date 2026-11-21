/**
 * Game state processor dispatcher.
 * Mirrors the GameType switch in the original GameDataService.OnTimerTick.
 */

import {
  createProcessedGameState,
  GameType,
  type GameState,
  type ProcessedGameState,
} from "../types";
import { copyCommonFields } from "./base";
import { EasyModeProcessor } from "./easy";
import { MasterModeProcessor } from "./master";
import { SakuraModeProcessor } from "./sakura";
import { ShiraseModeProcessor } from "./shirase";

function createCommonState(rawState: GameState): ProcessedGameState {
  const result = createProcessedGameState();
  copyCommonFields(rawState, result);
  return result;
}

/**
 * Processes a raw game state with the mode-appropriate processor.
 * Each processor keeps session state (section times, cools, latches), so the
 * same instance must be reused across ticks for a given game session.
 */
export class GameStateProcessorManager {
  private readonly master = new MasterModeProcessor();
  private readonly shirase = new ShiraseModeProcessor();
  private readonly easy = new EasyModeProcessor();
  private readonly sakura = new SakuraModeProcessor();

  process(rawState: GameState): ProcessedGameState {
    switch (rawState.gameType) {
      case GameType.Master:
      case GameType.Qualified_Master:
        return this.master.process(rawState);
      case GameType.Shirase:
        return this.shirase.process(rawState);
      case GameType.Easy:
        return this.easy.process(rawState);
      case GameType.Sakura:
        return this.sakura.process(rawState);
      default:
        return createCommonState(rawState);
    }
  }
}
