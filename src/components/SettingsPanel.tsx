/**
 * Settings panel — opened from the corner gear button.
 *
 * Sections per mode: grade-up sound (volume slider + mute) and the Master
 * roll-practice playfield toggles. A roll CLEAR judgment always reveals the
 * playfield regardless of the toggles.
 *
 * Hidden showcase section: click the panel title five times to unlock the
 * scenario player (scripted game-state streams for design review).
 */

import { useEffect, useState } from "react";
import type { Settings } from "../hooks/useSettings";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="set-section">
      <div className="set-section__title">{title}</div>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="set-row">
      <span className="set-row__label">{label}</span>
      <div className="set-row__control">{children}</div>
    </div>
  );
}

function VolumeSlider({
  name,
  volume,
  muted,
  onChange,
}: {
  /** mode name for accessible labeling ("Master" / "Shirase") */
  name: string;
  volume: number;
  muted: boolean;
  onChange: (patch: { volume?: number; muted?: boolean }) => void;
}) {
  return (
    <div className="set-volume">
      <button
        type="button"
        className={`set-mute${muted ? " set-mute--off" : ""}`}
        onClick={() => onChange({ muted: !muted })}
        title={muted ? "Unmute" : "Mute"}
        aria-label={`${name} grade-up sound mute`}
      >
        {muted ? "🔇" : "🔊"}
      </button>
      <input
        type="range"
        min={0}
        max={100}
        value={volume}
        onChange={(e) => onChange({ volume: Number(e.target.value), muted: false })}
        className="set-slider"
        aria-label={`${name} grade-up volume`}
      />
      <span className="set-volume__value">{volume}%</span>
    </div>
  );
}

function Toggle({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className={`set-toggle${on ? " set-toggle--on" : ""}`}
      onClick={() => onChange(!on)}
    >
      <span className="set-toggle__knob" />
    </button>
  );
}

export function SettingsPanel({
  settings,
  onUpdate,
  onClose,
  showcaseUnlocked,
  onUnlockShowcase,
  onOpenShowcase,
}: {
  settings: Settings;
  onUpdate: (patch: Partial<Settings>) => void;
  onClose: () => void;
  /** showcase section revealed (persisted unlock) */
  showcaseUnlocked: boolean;
  onUnlockShowcase: () => void;
  /** start the scenario player (first scenario) and close the panel */
  onOpenShowcase: () => void;
}) {
  const [titleClicks, setTitleClicks] = useState(0);

  // Esc closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Hidden unlock: five clicks on the panel title
  const onTitleClick = () => {
    if (showcaseUnlocked) return;
    const clicks = titleClicks + 1;
    setTitleClicks(clicks);
    if (clicks >= 5) onUnlockShowcase();
  };

  return (
    <div className="set-backdrop" onClick={onClose}>
      <div className="set-panel" onClick={(e) => e.stopPropagation()}>
        <div className="set-panel__header">
          <span
            className={`set-panel__title${!showcaseUnlocked ? " set-panel__title--secret" : ""}`}
            onClick={onTitleClick}
          >
            SETTINGS
          </span>
          <button type="button" className="set-panel__close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <Section title="MASTER">
          <Row label="Times Shown in Section List">
            <select
              className="set-select"
              value={settings.masterSectionTimes}
              onChange={(e) =>
                onUpdate({ masterSectionTimes: e.target.value as Settings["masterSectionTimes"] })
              }
            >
              <option value="section-cumulative">Section + Cumulative</option>
              <option value="seventy-cumulative">70% + Cumulative</option>
              <option value="seventy-section">70% + Section</option>
            </select>
          </Row>
          <Row label="Show Playfield in Fading Roll">
            <Toggle
              on={settings.showPlayfieldFadingRoll}
              onChange={(v) => onUpdate({ showPlayfieldFadingRoll: v })}
            />
          </Row>
          <Row label="Show Playfield in Invisible Roll">
            <Toggle
              on={settings.showPlayfieldInvisibleRoll}
              onChange={(v) => onUpdate({ showPlayfieldInvisibleRoll: v })}
            />
          </Row>
          <Row label="Grade Up Sound">
            <VolumeSlider
              name="Master"
              volume={settings.masterVolume}
              muted={settings.masterMuted}
              onChange={(p) =>
                onUpdate({
                  masterVolume: p.volume ?? settings.masterVolume,
                  masterMuted: p.muted ?? settings.masterMuted,
                })
              }
            />
          </Row>
        </Section>

        <Section title="SHIRASE">
          <Row label="Grade Up Sound">
            <VolumeSlider
              name="Shirase"
              volume={settings.shiraseVolume}
              muted={settings.shiraseMuted}
              onChange={(p) =>
                onUpdate({
                  shiraseVolume: p.volume ?? settings.shiraseVolume,
                  shiraseMuted: p.muted ?? settings.shiraseMuted,
                })
              }
            />
          </Row>
        </Section>

        {showcaseUnlocked && (
          <Section title="DEBUG">
            <Row label="Scenario Player">
              <button type="button" className="set-open-showcase" onClick={onOpenShowcase}>
                OPEN
              </button>
            </Row>
          </Section>
        )}
      </div>
    </div>
  );
}
