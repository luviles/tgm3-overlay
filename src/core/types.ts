/**
 * Core type definitions — ported 1:1 from Tgm3Visualizer.Core (C#).
 *
 * Field names are camelCase versions of the original C# properties so the two
 * codebases can be diffed against each other. Computed C# properties
 * (TimeSeconds, Section) are computed inline where the original used them.
 */

/** TGM3 game types (memory value at 0x4B3D5C) */
export enum GameType {
  None = 0,
  Easy = 1,
  Shirase = 2,
  Master = 3,
  Sakura = 4,
  Qualified_Master = 5,
  Doubles = 6,
}

/**
 * Raw game state read from memory (mirrors C# GameState).
 * The Rust backend reads memory and serializes this shape as JSON.
 */
export interface GameState {
  finalGrade: number;
  sectionGradePoints: number;
  sectionRegretCount: number;
  awardedGradePoints: number;
  decayTime: number;
  internalGrade: number;
  level: number;
  timeFrames: number;
  gameType: GameType;
  seventyPercentCheckpointCount: number;
  sectionCoolFlag: number;
  staffRollTime: number;
  staffRollTetrisCount: number;
  staffRollLineClear: number;
  hanabiScore: number;

  // Player info
  nickname: string;
  // playtime: number; // still shipped by the Rust payload, but no FE
  // consumer since the migration — commented out (kept here for reference)
  decorationPoints: number;
  worldEasyHiScore: number;
  classicEasyHiScore: number;
  worldSakuraHiGrade: number;
  classicSakuraHiGrade: number;
  worldMasterCurrentGrade: number;
  classicMasterCurrentGrade: number;
  worldShiraseHiGrade: number;
  classicShiraseHiGrade: number;
  /** [7] NEWEST first (matches the original C# read order; the grade-history calculator reverses it internally) */
  worldMasterGradeHistory: number[];
  classicMasterGradeHistory: number[];
  worldDemotionPoints: number;
  classicDemotionPoints: number;

  gameProcessStatus: number;
  fieldStatus: number;
  gameFlag: number;

  /**
   * Playfield data (10 wide x 22 high), index [y][x], y=0 is bottom row.
   * Block types: 0=empty, 2=Red, 3=Green, 4=Pink, 5=Blue, 6=Orange,
   * 7=Yellow, 8=Cyan, 9=flash (locked) normal, 0x12-0x18=jewel, 0x19=flash jewel
   */
  playfield: number[][];

  lockDelay: number;
  shiftMoveResetCount: number;
  rotationMoveResetCount: number;
  garbageQuota: number;

  // Sakura mode
  sakuraStageLimitTime: number;
  sakuraStageElapsedTime: number;
  sakuraStageLevel: number;
  sakuraClearedStageLevel: number;

  masterExamFlags: number;
}

/** Mirrors C# `new GameState()` defaults (all zeros / empty). */
export function createGameState(): GameState {
  return {
    finalGrade: 0,
    sectionGradePoints: 0,
    sectionRegretCount: 0,
    awardedGradePoints: 0,
    decayTime: 0,
    internalGrade: 0,
    level: 0,
    timeFrames: 0,
    gameType: GameType.None,
    seventyPercentCheckpointCount: 0,
    sectionCoolFlag: 0,
    staffRollTime: 0,
    staffRollTetrisCount: 0,
    staffRollLineClear: 0,
    hanabiScore: 0,
    nickname: "",
    decorationPoints: 0,
    worldEasyHiScore: 0,
    classicEasyHiScore: 0,
    worldSakuraHiGrade: 0,
    classicSakuraHiGrade: 0,
    worldMasterCurrentGrade: 0,
    classicMasterCurrentGrade: 0,
    worldShiraseHiGrade: 0,
    classicShiraseHiGrade: 0,
    worldMasterGradeHistory: new Array<number>(7).fill(0),
    classicMasterGradeHistory: new Array<number>(7).fill(0),
    worldDemotionPoints: 0,
    classicDemotionPoints: 0,
    gameProcessStatus: 0,
    fieldStatus: 0,
    gameFlag: 0,
    playfield: Array.from({ length: 22 }, () => new Array<number>(10).fill(0)),
    lockDelay: 0,
    shiftMoveResetCount: 0,
    rotationMoveResetCount: 0,
    garbageQuota: 0,
    sakuraStageLimitTime: 0,
    sakuraStageElapsedTime: 0,
    sakuraStageLevel: 0,
    sakuraClearedStageLevel: 0,
    masterExamFlags: 0,
  };
}

/** One entry of Master mode grade history display */
export interface GradeHistoryEntry {
  gradeName: string;
  isHighlighted: boolean;
}

export interface GradeHistoryResult {
  entries: GradeHistoryEntry[];
  averageGrade: string;
  /** numeric average grade (floor of top-3 mean), null when unavailable (<4 records) */
  averageGradeValue: number | null;
}

/** Processed game state with calculated values (mirrors C# ProcessedGameState). */
export interface ProcessedGameState {
  finalGrade: number;
  internalGrade: number;
  internalGradeDisplay: string;
  sectionGradePoints: number;
  sectionRegretCount: number;
  awardedGradePoints: number;
  decayTime: number;
  level: number;
  timeFrames: number;
  gameType: GameType;
  section: number;

  sectionTimes: number[];
  cools: boolean[];
  regrets: boolean[];
  totalCools: number;

  currentSectionTime: number;
  coolDeadline: number;
  regretDeadline: number;

  remainingStaffRollFrames: number;
  seventyPercentTimes: number[];
  staffRollGradePoints: number;
  staffRollClearPoints: number;

  combinedGrade: number;
  awardedGradePointsProgress: number;
  decayTimeRemaining: number;
  decayTimeProgress: number;
  isSectionCoolQualified: boolean;
  /** Master: internal grade >= 27 (S7) — the invisible roll's second condition */
  isInternalGradeQualified: boolean;

  maxSectionGradePoints: number;
  maxStaffRollGradePoints: number;

  statusCardTitle: string;
  statusCardSubtitle: string;
  showStaffRollTime: boolean;

  isPromotionExam: boolean;
  isDemotionExam: boolean;
  masterExamFlags: number;

  // Player info
  nickname: string;
  decorationPoints: number;
  isLoggedIn: boolean;
  worldEasyHiScore: number;
  classicEasyHiScore: number;
  worldSakuraHiGrade: number;
  classicSakuraHiGrade: number;
  worldMasterCurrentGrade: number;
  classicMasterCurrentGrade: number;
  worldShiraseHiGrade: number;
  classicShiraseHiGrade: number;
  worldMasterGradeHistory: number[];
  classicMasterGradeHistory: number[];
  worldDemotionPoints: number;
  classicDemotionPoints: number;

  gameProcessStatus: number;
  isInvisible: boolean;
  isStaffRollActive: boolean;
  controlMode: string;

  playfield: number[][];

  lockDelay: number;
  shiftMoveResetCount: number;
  rotationMoveResetCount: number;

  speedLevel: number;
  maxLockFrame: number;
  garbageQuota: number;
  maxGarbageQuota: number;
  level500TimeLimitExceeded: boolean;
  level1000TimeLimitExceeded: boolean;
  hanabiScore: number;

  // Sakura mode
  sakuraStageLimitTime: number;
  sakuraStageElapsedTime: number;
  sakuraStageLevelDisplay: string;
  sakuraClearedStageLevel: number;
  remainingJewelBlocks: number;
  sakuraStageTimes: number[];
  sakuraStageCleared: boolean[];
  sakuraStageForfeited: boolean[];
  exStageTier: number;
  clearedStageStatus: number;

  // Common display
  formattedTime: string;

  // Section display
  sectionTimeDisplays: string[];
  cumulativeTimeDisplays: string[];
  seventyPercentTimeDisplays: string[];

  // Shirase display
  garbageQuotaText: string;
  level500TimeLimitDisplay: string;
  level1000TimeLimitDisplay: string;

  // Master display
  gradeDisplay: string;
  internalGradeText: string;
  staffRollGradePointsDisplay: string;
  demotionProgressDisplay: string;
  gradeHistoryEntries: GradeHistoryEntry[];
  averageGradeDisplay: string;
  /** numeric adjusted-average grade, null when unavailable (<4 records) */
  averageGradeValue: number | null;
  selectedDemotionPoints: number;
}

/** Mirrors C# ProcessedGameState property initializers. */
export function createProcessedGameState(): ProcessedGameState {
  return {
    finalGrade: 0,
    internalGrade: 0,
    internalGradeDisplay: "",
    sectionGradePoints: 0,
    sectionRegretCount: 0,
    awardedGradePoints: 0,
    decayTime: 0,
    level: 0,
    timeFrames: 0,
    gameType: GameType.None,
    section: 0,
    sectionTimes: new Array<number>(10).fill(0),
    cools: new Array<boolean>(10).fill(false),
    regrets: new Array<boolean>(10).fill(false),
    totalCools: 0,
    currentSectionTime: 0,
    coolDeadline: 0,
    regretDeadline: 0,
    remainingStaffRollFrames: 0,
    seventyPercentTimes: new Array<number>(10).fill(0),
    staffRollGradePoints: 0,
    staffRollClearPoints: 0,
    combinedGrade: 0,
    awardedGradePointsProgress: 0,
    decayTimeRemaining: 0,
    decayTimeProgress: 0,
    isSectionCoolQualified: false,
    isInternalGradeQualified: false,
    maxSectionGradePoints: 0,
    maxStaffRollGradePoints: 0,
    statusCardTitle: "NORMAL\nPLAY",
    statusCardSubtitle: "",
    showStaffRollTime: false,
    isPromotionExam: false,
    isDemotionExam: false,
    masterExamFlags: 0,
    nickname: "",
    decorationPoints: 0,
    isLoggedIn: false,
    worldEasyHiScore: 0,
    classicEasyHiScore: 0,
    worldSakuraHiGrade: 0,
    classicSakuraHiGrade: 0,
    worldMasterCurrentGrade: 0,
    classicMasterCurrentGrade: 0,
    worldShiraseHiGrade: 0,
    classicShiraseHiGrade: 0,
    worldMasterGradeHistory: new Array<number>(7).fill(0),
    classicMasterGradeHistory: new Array<number>(7).fill(0),
    worldDemotionPoints: 0,
    classicDemotionPoints: 0,
    gameProcessStatus: 0,
    isInvisible: false,
    isStaffRollActive: false,
    controlMode: "",
    playfield: Array.from({ length: 22 }, () => new Array<number>(10).fill(0)),
    lockDelay: 0,
    shiftMoveResetCount: 0,
    rotationMoveResetCount: 0,
    speedLevel: 0,
    maxLockFrame: 0,
    garbageQuota: 0,
    maxGarbageQuota: 0,
    level500TimeLimitExceeded: false,
    level1000TimeLimitExceeded: false,
    hanabiScore: 0,
    sakuraStageLimitTime: 0,
    sakuraStageElapsedTime: 0,
    sakuraStageLevelDisplay: "1",
    sakuraClearedStageLevel: 0,
    remainingJewelBlocks: 0,
    sakuraStageTimes: new Array<number>(27).fill(0),
    sakuraStageCleared: new Array<boolean>(27).fill(false),
    sakuraStageForfeited: new Array<boolean>(27).fill(false),
    exStageTier: 0,
    clearedStageStatus: 0,
    formattedTime: "00:00:00",
    sectionTimeDisplays: new Array<string>(27).fill(""),
    cumulativeTimeDisplays: new Array<string>(27).fill(""),
    seventyPercentTimeDisplays: new Array<string>(10).fill(""),
    garbageQuotaText: "",
    level500TimeLimitDisplay: "",
    level1000TimeLimitDisplay: "",
    gradeDisplay: "--",
    internalGradeText: "0 (Grade 9)",
    staffRollGradePointsDisplay: "+0",
    demotionProgressDisplay: "0/30",
    gradeHistoryEntries: [],
    averageGradeDisplay: "",
    averageGradeValue: null,
    selectedDemotionPoints: 0,
  };
}
