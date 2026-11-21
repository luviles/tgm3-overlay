/**
 * Grade value → display name converters.
 * Ported from Tgm3Visualizer.Core/Calculations/*Converter.cs
 */

/** Grade value to name mapping for TGM3 Master mode (index = grade value). */
const GRADE_NAMES = [
  "9", "8", "7", "6", "5", "4", "3", "2", "1", // 0-8
  "S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", // 9-17
  "m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9", // 18-26
  "M", // 27
  "MK", // 28 - Master K
  "MV", // 29 - Master V
  "MO", // 30 - Master O
  "MM", // 31 - Master M
  "GM", // 32 - Grand Master
];

/** Convert grade numeric value to display name (GradeConverter.ToGradeName). */
export function toGradeName(gradeValue: number): string {
  if (gradeValue < 0) {
    return "--";
  } else if (gradeValue >= GRADE_NAMES.length) {
    return "GM";
  }
  return GRADE_NAMES[gradeValue];
}

/** Internal grade (0-31) → display string (InternalGradeConverter.ToDisplayGrade). */
const INTERNAL_GRADE_NAMES = [
  "9", // 0
  "8", // 1
  "7", // 2
  "6", // 3
  "5", // 4
  "4", // 5
  "4", // 6
  "3", // 7
  "3", // 8
  "2", // 9
  "2", // 10
  "2", // 11
  "1", // 12
  "1", // 13
  "1", // 14
  "S1", // 15
  "S1", // 16
  "S1", // 17
  "S2", // 18
  "S3", // 19
  "S4", // 20
  "S4", // 21
  "S4", // 22
  "S5", // 23
  "S5", // 24
  "S6", // 25
  "S6", // 26
  "S7", // 27
  "S7", // 28
  "S8", // 29
  "S8", // 30
];

export function toDisplayGrade(internalGrade: number): string {
  // C# switch `_ => "S9"` covers 31+ AND any negative value
  if (internalGrade >= 0 && internalGrade <= 30) {
    return INTERNAL_GRADE_NAMES[internalGrade];
  }
  return "S9";
}

/** Sakura hi-grade value (1-based) → display name (SakuraGradeConverter.ToGradeName). */
export function toSakuraGradeName(grade: number): string {
  if (grade >= 1 && grade <= 20) return String(grade);
  if (grade >= 28) return "ALL";
  switch (grade) {
    case 21: return "EX1";
    case 22: return "EX2";
    case 23: return "EX3";
    case 24: return "EX4";
    case 25: return "EX5";
    case 26: return "EX6";
    case 27: return "EX7";
    default: return "--";
  }
}

/** Sakura current stage (0-based memory value) → display name. */
export function toSakuraCurrentStageName(zeroBasedStage: number): string {
  if (zeroBasedStage < 0) return "1";
  return toSakuraGradeName(zeroBasedStage + 1);
}

/** Shirase grade value → display name (ShiraseGradeConverter.ToGradeName). */
export function toShiraseGradeName(grade: number): string {
  if (grade >= 21) return "S13";
  switch (grade) {
    case 0: return "--";
    case 9: return "S1";
    case 10: return "S2";
    case 11: return "S3";
    case 12: return "S4";
    case 13: return "S5";
    case 14: return "S6";
    case 15: return "S7";
    case 16: return "S8";
    case 17: return "S9";
    case 18: return "S10";
    case 19: return "S11";
    case 20: return "S12";
    default: return "--";
  }
}
