/**
 * Max lock frame constants per game mode.
 * Ported from Tgm3Visualizer.Core/Calculations/LockFrameConstants.cs
 */

/** Master mode max lock frames by speed level section (index = speedLevel / 100). */
export const MASTER_MAX_LOCK_FRAMES = [30, 30, 30, 30, 30, 30, 30, 30, 30, 17, 17, 15, 15];

/** Shirase mode max lock frames by speed level section. */
export const SHIRASE_MAX_LOCK_FRAMES = [18, 18, 17, 15, 15, 13, 12, 12, 12, 12, 12, 10, 8, 15];

/** Easy mode max lock frame (constant) */
export const EASY_MAX_LOCK_FRAME = 30;

/** Sakura mode max lock frame (constant) */
export const SAKURA_MAX_LOCK_FRAME = 30;

/**
 * Look up max lock frame from a speed-level-indexed array.
 * If speedLevel exceeds the array, the last value is returned.
 */
export function getMaxLockFrame(frames: number[], speedLevel: number): number {
  const index = Math.floor(speedLevel / 100);
  return index < frames.length ? frames[index] : frames[frames.length - 1];
}
