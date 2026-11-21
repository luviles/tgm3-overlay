/**
 * App settings, persisted to localStorage.
 *
 * - Grade-up sound volume/mute per mode (Master, Shirase)
 * - Master roll practice: hide the visualizer's playfield during FADING /
 *   INVISIBLE roll (defaults visible). A CLEAR judgment always reveals the
 *   field regardless of these toggles (handled in the view).
 */

import { useCallback, useEffect, useState } from "react";

/** Which two time columns the Master section timer shows. */
export type MasterSectionTimes = "section-cumulative" | "seventy-cumulative" | "seventy-section";

export interface Settings {
  masterVolume: number; // 0-100
  masterMuted: boolean;
  shiraseVolume: number; // 0-100
  shiraseMuted: boolean;
  showPlayfieldFadingRoll: boolean;
  showPlayfieldInvisibleRoll: boolean;
  masterSectionTimes: MasterSectionTimes;
}

const DEFAULT_SETTINGS: Settings = {
  masterVolume: 100,
  masterMuted: false,
  shiraseVolume: 100,
  shiraseMuted: false,
  showPlayfieldFadingRoll: true,
  showPlayfieldInvisibleRoll: true,
  masterSectionTimes: "section-cumulative",
};

const STORAGE_KEY = "tgm3-overlay.settings";

function load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const [settings, setSettings] = useState<Settings>(load);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // private mode etc. — non-fatal
    }
  }, [settings]);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => ({ ...s, ...patch }));
  }, []);

  return [settings, update];
}
