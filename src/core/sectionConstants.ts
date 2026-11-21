/**
 * Time constants for Cool/Regret detection (in seconds at 60fps).
 * Ported from Tgm3Visualizer.Core/Models/SectionConstants.cs
 */

/** C# int.MaxValue sentinel used for "no threshold" */
export const INT_MAX = 0x7fffffff;

/** Maximum section time for Cool (seconds). Section 9 has no Cool. */
const COOL_TIMES = [52, 52, 49, 45, 45, 42, 42, 38, 38];

/** Maximum section time before Regret (seconds), Master mode. */
const REGRET_TIMES = [90, 75, 75, 68, 60, 60, 50, 50, 50, 50];

/** Shirase Regret time limits (seconds). Sections 0-1: 60s, 2-12: 50s. */
const SHIRASE_REGRET_TIMES = [60, 60, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50];

export const getCoolThresholdFrames = (section: number): number =>
  section < COOL_TIMES.length ? COOL_TIMES[section] * 60 : INT_MAX;

export const getRegretThresholdFrames = (section: number): number =>
  section < REGRET_TIMES.length ? REGRET_TIMES[section] * 60 : INT_MAX;

export const getShiraseRegretThresholdFrames = (section: number): number =>
  section < SHIRASE_REGRET_TIMES.length ? SHIRASE_REGRET_TIMES[section] * 60 : INT_MAX;

/** Shirase Level Time Limits (frames at 60fps) — WORLD control mode */
export const SHIRASE_WORLD_LEVEL500_LIMIT = 183 * 60; // 10980 frames
export const SHIRASE_WORLD_LEVEL1000_LIMIT = 366 * 60; // 21960 frames

/** Shirase Level Time Limits (frames at 60fps) — CLASSIC control mode */
export const SHIRASE_CLASSIC_LEVEL500_LIMIT = 148 * 60; // 8880 frames
export const SHIRASE_CLASSIC_LEVEL1000_LIMIT = 296 * 60; // 17760 frames

/** The two torikan limits for the active control mode ("WORLD"/"CLASSIC"). */
export function getShiraseLimits(controlMode: string): { limit500: number; limit1000: number } {
  return controlMode === "WORLD"
    ? { limit500: SHIRASE_WORLD_LEVEL500_LIMIT, limit1000: SHIRASE_WORLD_LEVEL1000_LIMIT }
    : { limit500: SHIRASE_CLASSIC_LEVEL500_LIMIT, limit1000: SHIRASE_CLASSIC_LEVEL1000_LIMIT };
}
