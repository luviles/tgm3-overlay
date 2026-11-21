/**
 * Calculation helpers: decay time, regret, grade history, section time formatting.
 * Ported from Tgm3Visualizer.Core/Calculations/
 */

import { getRegretThresholdFrames, getShiraseRegretThresholdFrames, INT_MAX } from "./sectionConstants";
import { toGradeName } from "./converters";
import type { GradeHistoryResult } from "./types";

// Re-export converters so callers can import everything calculation-related from here
export * from "./converters";

// ---------------------------------------------------------------------------
// DecayTimeMaxCalculator
// ---------------------------------------------------------------------------

const DECAY_RATES = [
  125, // 0
  80, // 1
  80, // 2
  50, // 3
  45, // 4
  45, // 5
  45, // 6
  40, // 7
  40, // 8
  40, // 9
  40, // 10
  40, // 11
  30, // 12
  30, // 13
  30, // 14
  20, // 15
  20, // 16
  20, // 17
  20, // 18
  20, // 19
  15, // 20
  15, // 21
  15, // 22
  15, // 23
  15, // 24
  15, // 25
  15, // 26
  15, // 27
  15, // 28
  15, // 29
  10, // 30
  10, // 31+
];

/** Maximum decay time for a given internal grade (0-31+). */
export function getMaxDecayTime(internalGrade: number): number {
  if (internalGrade < 0) return DECAY_RATES[0];
  if (internalGrade >= DECAY_RATES.length) return DECAY_RATES[DECAY_RATES.length - 1];
  return DECAY_RATES[internalGrade];
}

// ---------------------------------------------------------------------------
// RegretCalculator
// ---------------------------------------------------------------------------

/** True if a Master mode Regret was triggered for the section. */
export function isRegret(sectionTimeFrames: number, section: number): boolean {
  const threshold = getRegretThresholdFrames(section);
  if (threshold === INT_MAX) return false;
  return sectionTimeFrames > threshold;
}

/** True if a Shirase Regret was triggered for the section. */
export function isShiraseRegret(sectionTimeFrames: number, section: number): boolean {
  const threshold = getShiraseRegretThresholdFrames(section);
  if (threshold === INT_MAX) return false;
  return sectionTimeFrames > threshold;
}

// ---------------------------------------------------------------------------
// GradeHistoryCalculator
// ---------------------------------------------------------------------------

/**
 * Format grade points with smart decimal handling:
 * +0.12 → "+0.12", +0.10 → "+0.1", +1.00 → "+1"
 *
 * Note: C# Math.Round uses banker's rounding, but reachable values here are
 * multiples of 0.02 (0.6/0.1/0.04 combinations), so no midpoint ever occurs
 * and half-up rounding is equivalent.
 */
export function formatGradePoints(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  if (rounded === Math.floor(rounded)) {
    return `+${rounded}`;
  }
  const formatted = rounded.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return `+${formatted}`;
}

/**
 * Master mode grade history display:
 * - Excludes the single highest grade (smallest index among ties)
 * - Selects top 3 from remaining (largest index among ties)
 * - Computes average of selected 3
 *
 * Input array is oldest-first; internal ordering here is newest-first
 * (mirrors C# `.Reverse().Select(...)` where index 0 = newest).
 */
export function calculateGradeHistory(masterGradeHistory: number[]): GradeHistoryResult {
  const result: GradeHistoryResult = {
    entries: [],
    averageGrade: "N/A",
    averageGradeValue: null,
  };

  // Memory values are +1 compared to actual grade values:
  // Memory 0 = invalid (-1), Memory 1+ = valid (grade 0+ = "9", "8", ...)
  const all = [...masterGradeHistory]
    .reverse()
    .map((memoryValue, index) => ({ memoryValue, grade: memoryValue - 1, index }));

  const valid = all.filter((x) => x.memoryValue > 0);

  if (valid.length === 0) {
    result.entries.push({ gradeName: "No History", isHighlighted: false });
    return result;
  }

  // Step 1: find top 1 to exclude (highest grade, smallest index for ties)
  const excluded = [...valid].sort((a, b) => b.grade - a.grade || a.index - b.index)[0];

  const remaining = valid.filter((x) => x.index !== excluded.index);

  // Step 2: pick top 3 from remaining (highest grade, largest index for ties)
  const top234 = [...remaining]
    .sort((a, b) => b.grade - a.grade || b.index - a.index)
    .slice(0, 3);

  const top234Indices = new Set(top234.map((x) => x.index));

  for (const item of valid) {
    result.entries.push({
      gradeName: toGradeName(item.grade),
      isHighlighted: top234Indices.has(item.index),
    });
  }

  // Adjusted Average Grade (needs at least 4 valid grades: 1 excluded + 3 selected)
  if (top234.length === 3) {
    const avgGrade = Math.floor(
      top234.reduce((sum, x) => sum + x.grade, 0) / 3
    );
    result.averageGrade = toGradeName(avgGrade);
    result.averageGradeValue = avgGrade;
  }

  return result;
}

// ---------------------------------------------------------------------------
// SectionTimeCalculator
// ---------------------------------------------------------------------------

/** Format frames as MM:SS:ss (minutes:seconds:centiseconds). */
export function formatTime(frames: number): string {
  if (frames <= 0) return "";

  const minutes = Math.floor(frames / 3600);
  const seconds = Math.floor((frames % 3600) / 60);
  const centiseconds = Math.floor(((frames % 60) * 100) / 60);

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}:${String(centiseconds).padStart(2, "0")}`;
}

/**
 * Signed countdown text for deadline chips: "-" while non-negative (time
 * remaining), "+" once negative (overrun). Always at least 1 frame so a
 * just-crossed zero never renders as formatTime's empty string.
 */
export function signedTime(remaining: number): string {
  return `${remaining >= 0 ? "-" : "+"}${formatTime(Math.max(1, Math.abs(remaining)))}`;
}

/**
 * Section range display text ("000-099").
 * Supports Master (0-9, ends at 999) and Shirase (0-12, section 9 ends at 1000).
 */
export function getSectionRange(section: number, isShirase = false): string {
  if (section < 0 || section > 12) return "???";

  const start = section * 100;
  const end = section === 9 && !isShirase ? 999 : (section + 1) * 100;
  return `${String(start).padStart(3, "0")}-${String(end).padStart(3, "0")}`;
}
