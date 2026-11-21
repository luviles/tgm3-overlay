/**
 * TGM3 Overlay — main app shell.
 *
 * Fixed 480x1080 OBS side panel (game 1440x1080 + this strip = 1920x1080).
 * Font: Kode Mono everywhere (tabular numerals by construction).
 * Settings (corner gear): per-mode grade-up sound volume/mute and the Master
 * roll-practice playfield toggles.
 *
 * Showcase (hidden, unlocked in settings): scripted game-state streams that
 * replace the live state while active, so design moments (COOL judgment,
 * torikan deaths, roll clears) can be reviewed without playing.
 */

import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useGameMonitor } from "./hooks/useGameMonitor";
import { useViewMode } from "./hooks/useViewMode";
import { useGradeUpSound } from "./hooks/useGradeUpSound";
import { useSettings } from "./hooks/useSettings";
import { useShowcase } from "./hooks/useShowcase";
import { PlayerInfoCard } from "./components/PlayerInfoCard";
import { ModeStandby } from "./components/cards";
import { SettingsPanel } from "./components/SettingsPanel";
import { ShowcaseBar } from "./components/ShowcaseBar";
import { MasterModeView } from "./views/MasterModeView";
import { ShiraseModeView } from "./views/ShiraseModeView";
import { EasyModeView } from "./views/EasyModeView";
import { SakuraModeView } from "./views/SakuraModeView";
import { SCENARIOS } from "./showcase/scenarios";
import { createProcessedGameState, GameType } from "./core/types";
import "./App.css";

export default function App() {
  const { state: liveState } = useGameMonitor();
  const [settings, updateSettings] = useSettings();
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Showcase: scenario index = active, null = live game only
  const [showcaseIdx, setShowcaseIdx] = useState<number | null>(null);
  // session-only unlock (five clicks on the settings title): never persisted,
  // every launch starts locked again
  const [showcaseUnlocked, setShowcaseUnlocked] = useState(false);
  const scenario = showcaseIdx !== null ? (SCENARIOS[showcaseIdx] ?? null) : null;
  const showcase = useShowcase(scenario);

  const state = showcase.state ?? liveState;

  const view = useViewMode(
    state?.gameType ?? GameType.None,
    state?.gameProcessStatus ?? -1
  );
  // a scenario pins its mode view and feeds the sound hook its own stream
  const activeView = scenario ? scenario.mode : view;

  const soundMode =
    state?.gameType === GameType.Qualified_Master ? GameType.Master : state?.gameType;
  useGradeUpSound(
    soundMode ?? GameType.None,
    state?.combinedGrade ?? 0,
    state?.timeFrames ?? 0,
    activeView === "master" || activeView === "shirase",
    settings
  );

  const unlockShowcase = useCallback(() => setShowcaseUnlocked(true), []);

  // capture/demo support: TGM3_SHOWCASE=<scenario id> auto-starts the
  // scenario player in that scenario (used by the README GIF capture
  // script); a normal launch returns null and nothing happens
  useEffect(() => {
    invoke<string | null>("showcase_override")
      .then((id) => {
        if (!id) return;
        const idx = SCENARIOS.findIndex((s) => s.id === id);
        if (idx >= 0) setShowcaseIdx(idx);
      })
      .catch(() => undefined);
  }, []);

  const switchScenario = useCallback((delta: number) => {
    setShowcaseIdx((i) => (i === null ? 0 : (i + delta + SCENARIOS.length) % SCENARIOS.length));
  }, []);

  // stable identities: the bar's key listener and the panel's Esc listener
  // re-subscribe whenever a dep changes (App re-renders per game tick)
  const prevScenario = useCallback(() => switchScenario(-1), [switchScenario]);
  const nextScenario = useCallback(() => switchScenario(1), [switchScenario]);
  const exitShowcase = useCallback(() => setShowcaseIdx(null), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  return (
    <main className="app">
      {/* corner cluster: always visible (rests dimmed over the login card,
          full on hover) */}
      <div className="corner-actions">
        <button
          type="button"
          className="corner-btn"
          onClick={() => setSettingsOpen(true)}
          title="Settings"
          aria-label="Settings"
        >
          ⚙
        </button>
      </div>

      {activeView === "overlay" || !state ? (
        <>
          {/* Same card, same slot as in-game: the strip stays put across the
              waiting -> game transition. */}
          <PlayerInfoCard state={state ?? createProcessedGameState()} />
          <ModeStandby />
        </>
      ) : activeView === "master" ? (
        <MasterModeView state={state} settings={settings} />
      ) : activeView === "shirase" ? (
        <ShiraseModeView state={state} />
      ) : activeView === "easy" ? (
        <EasyModeView state={state} />
      ) : (
        <SakuraModeView state={state} />
      )}

      {scenario && (
        <ShowcaseBar
          scenario={scenario}
          index={showcaseIdx ?? 0}
          total={SCENARIOS.length}
          playing={showcase.playing}
          speed={showcase.speed}
          blocked={settingsOpen}
          onPrev={prevScenario}
          onNext={nextScenario}
          onTogglePlay={showcase.togglePlay}
          onCycleSpeed={showcase.cycleSpeed}
          onRestart={showcase.restart}
          onExit={exitShowcase}
        />
      )}

      {settingsOpen && (
        <SettingsPanel
          settings={settings}
          onUpdate={updateSettings}
          onClose={closeSettings}
          showcaseUnlocked={showcaseUnlocked}
          onUnlockShowcase={unlockShowcase}
          onOpenShowcase={() => {
            setShowcaseIdx(0);
            setSettingsOpen(false);
          }}
        />
      )}
    </main>
  );
}
