/**
 * Showcase driver — replays a scripted Scenario as a live ProcessedGameState
 * stream at game speed (60 fps), so every stream-reactive hook (judgment
 * freezes, lap flashes, torikan latches) fires exactly as in real play.
 *
 * The clock starts inside the scenario's reset window (negative frames), so
 * switching scenarios always passes through a timeFrames=0 tick first — no
 * latch (e.g. the Master 500-fail hold) can leak from one scenario into the
 * next. Slow-motion speeds make sub-second blink phases inspectable.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { RESET_FRAMES, stateAt, type Scenario } from "../showcase/scenarios";
import type { ProcessedGameState } from "../core/types";

const SPEEDS = [1, 0.5, 0.25, 0.1] as const;

export function useShowcase(active: Scenario | null) {
  const [playing, setPlaying] = useState(true);
  const [speedIdx, setSpeedIdx] = useState(0);
  const [runId, setRunId] = useState(0); // bumped by restart
  const [state, setState] = useState<ProcessedGameState | null>(null);
  const frameRef = useRef(0);

  useEffect(() => {
    if (!active) {
      frameRef.current = 0;
      setState(null);
      return;
    }

    // start in the reset window: clears every latch before the action
    frameRef.current = -RESET_FRAMES;

    let raf = 0;
    let alive = true;
    let last = 0;
    let lastEmitted = -1;

    const speed = SPEEDS[speedIdx];
    const loop = (t: number) => {
      if (!alive) return;
      if (last === 0) last = t;
      const dt = Math.min(100, t - last);
      last = t;
      if (playing) frameRef.current += (dt / 1000) * 60 * speed;
      const f = Math.floor(frameRef.current);
      if (playing || lastEmitted !== f) {
        lastEmitted = f;
        setState(stateAt(active, f));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [active, playing, speedIdx, runId]);

  const restart = useCallback(() => {
    setRunId((n) => n + 1);
  }, []);

  return {
    state,
    playing,
    speed: SPEEDS[speedIdx],
    togglePlay: useCallback(() => setPlaying((p) => !p), []),
    cycleSpeed: useCallback(() => setSpeedIdx((i) => (i + 1) % SPEEDS.length), []),
    restart,
  };
}
