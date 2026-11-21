/**
 * Showcase control bar — floating overlay while a scenario plays.
 *
 * Keyboard: ←/→ switch scenario, Space pause, R restart, Esc exit.
 * Slow-motion (0.5×/0.25×/0.1×) makes the 4-frame blink phases inspectable.
 */

import { useEffect } from "react";
import type { Scenario } from "../showcase/scenarios";
import { MODE_TITLE_COLORS } from "./cards";

export function ShowcaseBar({
  scenario,
  index,
  total,
  playing,
  speed,
  blocked,
  onPrev,
  onNext,
  onTogglePlay,
  onCycleSpeed,
  onRestart,
  onExit,
}: {
  scenario: Scenario;
  index: number;
  total: number;
  playing: boolean;
  speed: number;
  /** settings panel is open — ignore keys (it owns Esc) */
  blocked: boolean;
  onPrev: () => void;
  onNext: () => void;
  onTogglePlay: () => void;
  onCycleSpeed: () => void;
  onRestart: () => void;
  onExit: () => void;
}) {
  useEffect(() => {
    if (blocked) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") onPrev();
      else if (e.key === "ArrowRight") onNext();
      else if (e.key === " ") {
        e.preventDefault();
        onTogglePlay();
      } else if (e.key === "r" || e.key === "R") onRestart();
      else if (e.key === "Escape") onExit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [blocked, onPrev, onNext, onTogglePlay, onRestart, onExit]);

  // the mode chip wears the mode's own signature colour (same as the
  // in-app mode header)
  const colors = MODE_TITLE_COLORS[scenario.mode.toUpperCase()] ?? {
    main: "#e8ecff",
    glow: "#313b66",
  };

  return (
    <div className="scbar" role="toolbar" aria-label="Debug scenario controls">
      <div className="scbar__row">
        <span
          className="scbar__mode"
          style={{ color: colors.main, textShadow: `0 0 10px ${colors.glow}66` }}
        >
          {scenario.mode.toUpperCase()}
        </span>
        <button type="button" className="scbar__btn" onClick={onPrev} title="Previous (←)">
          ‹
        </button>
        <span className="scbar__label">{scenario.label}</span>
        <button type="button" className="scbar__btn" onClick={onNext} title="Next (→)">
          ›
        </button>
        <span className="scbar__index">
          {index + 1}/{total}
        </span>
        <span className="scbar__sep" />
        <button
          type="button"
          className="scbar__btn scbar__btn--wide"
          onClick={onTogglePlay}
          title="Pause / play (Space)"
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <button
          type="button"
          className="scbar__btn scbar__btn--wide"
          onClick={onCycleSpeed}
          title="Playback speed"
        >
          {speed}×
        </button>
        <button type="button" className="scbar__btn" onClick={onRestart} title="Restart (R)">
          ⟳
        </button>
        <button type="button" className="scbar__btn scbar__btn--exit" onClick={onExit} title="Exit showcase (Esc)">
          ✕
        </button>
      </div>
      <div className="scbar__note">{scenario.note}</div>
    </div>
  );
}
