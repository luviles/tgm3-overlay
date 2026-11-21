/**
 * Subscribes to the Rust backend's memory poll thread and exposes
 * the processed game state (mode-aware). Connection state is not tracked
 * here — the standby screen communicates waiting without it.
 */

import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { GameStateProcessorManager } from "../core/processors";
import type { GameState, ProcessedGameState } from "../core/types";

export function useGameMonitor(): { state: ProcessedGameState | null } {
  const [state, setState] = useState<ProcessedGameState | null>(null);
  const managerRef = useRef<GameStateProcessorManager | null>(null);

  useEffect(() => {
    if (!managerRef.current) managerRef.current = new GameStateProcessorManager();
    const manager = managerRef.current;

    let disposed = false;
    const unlisteners: Array<() => void> = [];

    listen<GameState>("game-state", (event) => {
      setState(manager.process(event.payload));
    }).then((un) => {
      if (disposed) un();
      else unlisteners.push(un);
    });

    return () => {
      disposed = true;
      for (const un of unlisteners) un();
    };
  }, []);

  return { state };
}
