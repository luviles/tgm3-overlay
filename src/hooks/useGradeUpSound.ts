/**
 * Grade-up sound trigger — ported from MasterModeViewModel #10 and
 * ShiraseModeViewModel #4.
 *
 * Master: previous >= 0 && combined > previous && combined <= 32 -> play
 * Shirase: previous >= 0 && combined > previous               -> play
 * Reset (timeFrames == 0): previous resets to -1
 *
 * Each mode tracks its own previous grade (the original had one player per
 * mode ViewModel). Easy/Sakura have no grade-up sound in the original.
 * Volume/mute come from the per-mode settings.
 */

import { useEffect, useRef } from "react";
import { GameType } from "../core/types";
import type { Settings } from "./useSettings";
import gradeUpUrl from "../assets/GradeUp.wav";

let audioCache: HTMLAudioElement | null = null;

function playGradeUpSound(volume: number) {
  try {
    if (!audioCache) {
      audioCache = new Audio(gradeUpUrl);
    }
    audioCache.volume = Math.max(0, Math.min(1, volume));
    audioCache.currentTime = 0;
    void audioCache.play().catch(() => undefined);
  } catch {
    // mirror the original's swallow-and-log behavior
  }
}

export function useGradeUpSound(
  gameType: GameType,
  combinedGrade: number,
  timeFrames: number,
  enabled: boolean,
  settings: Settings
) {
  const previous = useRef<Partial<Record<GameType, number>>>({});

  useEffect(() => {
    if (!enabled) return;

    if (timeFrames === 0) {
      previous.current[gameType] = -1;
      return;
    }

    const prev = previous.current[gameType] ?? -1;
    const rose = prev >= 0 && combinedGrade > prev;
    const capped = gameType === GameType.Master ? combinedGrade <= 32 : true;

    if (rose && capped) {
      // Qualified_Master is mapped to Master by the caller before dispatch
      const isMaster = gameType === GameType.Master;
      const { volume, muted } = isMaster
        ? { volume: settings.masterVolume, muted: settings.masterMuted }
        : { volume: settings.shiraseVolume, muted: settings.shiraseMuted };
      if (!muted && volume > 0) {
        playGradeUpSound(volume / 100);
      }
    }
    previous.current[gameType] = combinedGrade;
  }, [gameType, combinedGrade, timeFrames, enabled, settings]);
}
