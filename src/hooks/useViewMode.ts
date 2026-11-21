/**
 * Mode view switching — ported from MainWindow.UpdateViewIfNeeded.
 *
 * Rules (original):
 * - gameProcessStatus transitions FROM 3 (playing) to non-3 -> overlay view
 * - ignore ticks while gameProcessStatus != 3 (e.g. demo = 2)
 * - a real mode -> GameType.None: keep the previous view (waiting screen)
 * - Doubles: unsupported, keep previous view
 * - Qualified_Master: keep previous view (Master -> QM stays on Master view)
 * - otherwise: switch to the mode's view
 */

import { useEffect, useRef, useState } from "react";
import { GameType } from "../core/types";

type ViewMode = "overlay" | "easy" | "master" | "shirase" | "sakura";

interface ViewSwitchState {
  gameType: GameType;
  processStatus: number;
}

export function useViewMode(rawGameType: GameType, rawProcessStatus: number): ViewMode {
  const [view, setView] = useState<ViewMode>("overlay");
  const tracker = useRef<ViewSwitchState>({ gameType: GameType.None, processStatus: -1 });

  useEffect(() => {
    const t = tracker.current;

    // Game stopped playing: back to the overlay
    if (t.processStatus === 3 && rawProcessStatus !== 3) {
      tracker.current = { gameType: GameType.None, processStatus: -1 };
      setView("overlay");
      return;
    }

    // Ignore everything while not playing (2 = demo, etc.)
    if (rawProcessStatus !== 3) return;

    // Real mode -> None: keep previous view (waiting screen)
    if (t.gameType !== GameType.None && rawGameType === GameType.None) return;

    // Doubles not supported: keep previous view
    if (rawGameType === GameType.Doubles) return;

    // Qualified Master: keep previous view (Master -> QM transition)
    if (rawGameType === GameType.Qualified_Master) return;

    // Same game type: no change
    if (rawGameType === t.gameType) return;

    tracker.current = { gameType: rawGameType, processStatus: rawProcessStatus };

    switch (rawGameType) {
      case GameType.Easy:
        setView("easy");
        break;
      case GameType.Master:
        setView("master");
        break;
      case GameType.Shirase:
        setView("shirase");
        break;
      case GameType.Sakura:
        setView("sakura");
        break;
      default:
        break;
    }
  }, [rawGameType, rawProcessStatus]);

  return view;
}
