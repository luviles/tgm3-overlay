/**
 * Showcase scenarios — scripted ProcessedGameState streams for design review.
 *
 * Every view is a pure function of ProcessedGameState, and every dynamic
 * behaviour (COOL judgment freeze, REGRET lap flash, torikan latches, roll
 * CLEAR reveal) is a stream-reactive hook. So instead of playing the game to
 * reach a moment, each scenario IS that moment: a pure function of the frame
 * counter, replayed at game speed (60 fps) in a loop.
 *
 * Loop contract: the last RESET_FRAMES frames of every timeline emit a fresh
 * state (timeFrames = 0), which is the reset signal every latch hook uses —
 * the scenario re-arms itself before restarting. The driver also starts every
 * scenario inside that window, so switching scenarios can never carry a stale
 * latch (e.g. the Master 500-fail hold) into the next one.
 *
 * Timelines are authored with the real section constants, so the chips freeze
 * and flash at exactly the values real play would produce.
 */

import {
  createProcessedGameState,
  GameType,
  type ProcessedGameState,
} from "../core/types";
import {
  applyCurrentSectionRealtime,
  computeSectionTimeDisplays,
} from "../core/processors/base";
import { calculateGradeHistory, formatTime } from "../core/calculators";
import { toGradeName, toSakuraCurrentStageName } from "../core/converters";

/** Fresh-state gap at the end of every loop (0.8s at 60fps). */
export const RESET_FRAMES = 48;

export type ShowcaseMode = "master" | "shirase" | "easy" | "sakura";

export interface Scenario {
  id: string;
  mode: ShowcaseMode;
  /** short bar label */
  label: string;
  /** what to watch — rendered under the bar */
  note: string;
  /** timeline length in game frames, reset window included */
  frames: number;
  /** per-frame override, merged over the mode's base state */
  at: (f: number) => Partial<ProcessedGameState>;
}

// ---------------------------------------------------------------------------
// Small timeline helpers
// ---------------------------------------------------------------------------

/** Linear ramp of `f` from v0 (at f0) to v1 (at f1), clamped outside. */
function ramp(f: number, f0: number, f1: number, v0: number, v1: number): number {
  if (f <= f0) return v0;
  if (f >= f1) return v1;
  return v0 + ((f - f0) / (f1 - f0)) * (v1 - v0);
}

/** Deterministic demo stack (10x22, bottom rows filled). */
function demoPlayfield(rows: number, seed: number): number[][] {
  const pf = Array.from({ length: 22 }, () => new Array<number>(10).fill(0));
  let x = seed >>> 0;
  const rnd = () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let y = 0; y < rows; y++) {
    const w = 4 + Math.floor(rnd() * 5);
    const start = Math.floor(rnd() * (11 - w));
    for (let cx = start; cx < start + w; cx++) pf[y][cx] = 2 + Math.floor(rnd() * 7);
  }
  return pf;
}

/** Monochrome stack (Shirase past level 1000): IBM blocks (types 0x22-0x28)
 *  — the "[ ]" blocks, white in CLASSIC / green in WORLD. Same stack shape
 *  as the demo. */
function monoPlayfield(rows: number, seed: number): number[][] {
  const pf = demoPlayfield(rows, seed);
  for (const row of pf) {
    for (let x = 0; x < 10; x++) if (row[x] > 0) row[x] = 0x22;
  }
  return pf;
}

/** Living control column: lock delay draining, pips wobbling, ROTATE brushing
 *  its 8-limit (0.25s label flash) a couple of times per loop. */
function lively(f: number) {
  return {
    lockDelay: 6 + Math.floor(((f % 80) / 80) * 22),
    shiftMoveResetCount: f % 640 < 160 ? 4 : 2,
    rotationMoveResetCount: f % 960 < 40 ? 8 : 2 + Math.floor((f % 160) / 55),
  };
}

// ---------------------------------------------------------------------------
// Base states
// ---------------------------------------------------------------------------

const MODE_GAME_TYPE: Record<ShowcaseMode, GameType> = {
  master: GameType.Master,
  shirase: GameType.Shirase,
  easy: GameType.Easy,
  sakura: GameType.Sakura,
};

/** Static career record shared by every mode's base (logged-in profile). */
const WORLD_HISTORY = [13, 12, 13, 11, 12, 0, 0]; // newest first, as in memory

function buildBaseState(mode: ShowcaseMode): ProcessedGameState {
  const s = createProcessedGameState();
  s.gameType = MODE_GAME_TYPE[mode];
  s.gameProcessStatus = 3;
  s.controlMode = "WORLD";
  s.isLoggedIn = true;
  s.nickname = "DBG";
  s.decorationPoints = 200000;
  // profile records: CLASSIC H500 / MV / EX5(25) / S10(18),
  //                  WORLD   H2000 / GM(32) / ALL(28) / S13(21)
  // (Easy hanabi scores stay in the thousands)
  s.worldEasyHiScore = 2000;
  s.classicEasyHiScore = 500;
  s.worldSakuraHiGrade = 28; // "ALL"
  s.classicSakuraHiGrade = 25; // "EX5"
  s.worldMasterCurrentGrade = 32; // "GM"
  s.classicMasterCurrentGrade = 29; // "MV"
  s.worldShiraseHiGrade = 21; // "S13"
  s.classicShiraseHiGrade = 18; // "S10"
  s.worldMasterGradeHistory = [...WORLD_HISTORY];
  s.classicMasterGradeHistory = [11, 10, 11, 9, 0, 0, 0];
  s.worldDemotionPoints = 8;
  s.classicDemotionPoints = 14;
  s.playfield = demoPlayfield(6, 7919);
  s.maxLockFrame = 30;
  return s;
}

/** The base state never varies between frames of a mode, so it is built once
 *  per mode and spread-copied per frame (inner arrays are read-only). */
const BASE_CACHE = new Map<ShowcaseMode, ProcessedGameState>();

function baseState(mode: ShowcaseMode): ProcessedGameState {
  let base = BASE_CACHE.get(mode);
  if (!base) {
    base = buildBaseState(mode);
    BASE_CACHE.set(mode, base);
  }
  return base;
}

/** Shared empty field for the loop-reset window (never mutated). */
const EMPTY_PF = demoPlayfield(0, 1);

/** Decay-timer fields kept mutually consistent: the frames number tracks
 *  the same progress the gauge shows (precise decay modelling not needed —
 *  just never a stuck 0F next to a moving bar). */
function decayFields(progress: number) {
  return {
    decayTimeProgress: progress,
    decayTimeRemaining: Math.round(3600 * progress),
  };
}

/** Master-only static extras: the grade-history card data. */
const MASTER_EXTRAS: Partial<ProcessedGameState> = (() => {
  const calc = calculateGradeHistory(WORLD_HISTORY);
  return {
    gradeHistoryEntries: calc.entries,
    averageGradeDisplay: calc.averageGrade,
    averageGradeValue: calc.averageGradeValue,
    selectedDemotionPoints: 8,
    demotionProgressDisplay: "8/30",
  };
})();

/** Shirase-only static extras: the two torikan limit labels (WORLD rules). */
const SHIRASE_EXTRAS: Partial<ProcessedGameState> = {
  level500TimeLimitDisplay: "03:03:00",
  level1000TimeLimitDisplay: "06:06:00",
};

// ---------------------------------------------------------------------------
// Per-frame run fields (section list + deadlines), mirroring the processors
// exactly: computeSectionTimeDisplays + applyCurrentSectionRealtime + the
// live/frozen 70% column.
// ---------------------------------------------------------------------------

function runFields(o: {
  tf: number;
  level: number;
  sectionTimes: number[];
  regrets: boolean[];
  cools?: boolean[];
  seventy?: number[];
  coolDeadline?: number;
  regretDeadline?: number;
  count: number;
}): Partial<ProcessedGameState> {
  // processor invariant: the array is ALWAYS full-length with 0 for sections
  // not yet completed. Scenarios pass only the completed laps — pad here so
  // the NEXT section's slot reads 0 (not undefined) and its live row ticks.
  const sectionTimes = [...o.sectionTimes];
  while (sectionTimes.length < o.count) sectionTimes.push(0);

  const section = Math.floor(o.level / 100);
  const sectionStart = sectionTimes.slice(0, section).reduce((a, b) => a + b, 0);
  const currentSectionTime = Math.max(0, o.tf - sectionStart);

  const { sectionTimeDisplays, cumulativeTimeDisplays } = computeSectionTimeDisplays(
    sectionTimes,
    o.count
  );
  const drawn = applyCurrentSectionRealtime(
    sectionTimes,
    currentSectionTime,
    section,
    o.count,
    sectionTimeDisplays,
    cumulativeTimeDisplays
  );

  const seventyPercentTimeDisplays = new Array<string>(10).fill("");
  if (o.seventy) {
    for (let i = 0; i < o.seventy.length && i < 10; i++) {
      if (o.seventy[i] > 0) seventyPercentTimeDisplays[i] = formatTime(o.seventy[i]);
    }
    if (drawn && section < 9 && o.seventy[section] === 0) {
      seventyPercentTimeDisplays[section] = formatTime(currentSectionTime);
    }
  }

  return {
    timeFrames: o.tf,
    formattedTime: formatTime(o.tf),
    level: o.level,
    section,
    currentSectionTime,
    sectionTimes,
    regrets: o.regrets,
    cools: o.cools ?? new Array<boolean>(13).fill(false),
    seventyPercentTimes: o.seventy ?? new Array<number>(10).fill(0),
    coolDeadline: o.coolDeadline ?? 0,
    regretDeadline: o.regretDeadline ?? 0,
    sectionTimeDisplays,
    cumulativeTimeDisplays,
    seventyPercentTimeDisplays,
  };
}

// ---------------------------------------------------------------------------
// MASTER scenarios
// ---------------------------------------------------------------------------

const M_PF = demoPlayfield(6, 104729);

/**
 * COOL earned: countdown ticks toward the deadline, the x70 crossing (40.0s,
 * limit 45s) freezes the chip at -00:05:00 with the 3s cyan burst, the
 * section clears at 45s (REGRET margin lap flashes cyan), and section 5
 * restarts both countdowns.
 */
const mCoolAward: Scenario = {
  id: "master-cool-award",
  mode: "master",
  label: "COOL EARNED",
  note: "From level 430: COOL chip freezes at the 70% crossing + 3s cyan burst; section lap flashes cyan on clear.",
  frames: 1948,
  at: (f) => {
    const T0 = 10200; // sections 0-3: [2700, 2650, 2500, 2350]
    const E0 = 1200; // picked up 20s into section 4, level 430
    const FX70 = 1080; // x70 (level 470) at 38.0s -> COOL (deadline 45s)
    const FCLR = 1380; // level 500 at 43.0s (lap 2580, within the 45s COOL)
    const tf = T0 + E0 + f;
    const cleared = f >= FCLR;
    const level =
      f < FX70
        ? Math.floor(ramp(f, 0, FX70, 430, 470))
        : f < FCLR
          ? Math.floor(ramp(f, FX70, FCLR, 470, 500))
          : 500 + Math.floor(ramp(f, FCLR, 1900, 0, 24));
    const judged = f >= FX70;
    const sectionTimes = cleared ? [2700, 2650, 2500, 2350, 2580] : [2700, 2650, 2500, 2350, 0];
    return {
      ...MASTER_EXTRAS,
      ...lively(f),
      playfield: M_PF,
      ...runFields({
        tf,
        level,
        count: 10,
        sectionTimes,
        regrets: [false, false, false, false, false],
        cools: [true, true, true, true, judged],
        // section 3's 70% (2600) keeps the grace limit above the table limit,
        // so section 4 runs the plain 45s deadline
        seventy: [2200, 2150, 2050, 2600, judged ? 2280 : 0],
        coolDeadline: cleared ? 12780 + 2400 : 12900,
        regretDeadline: cleared ? 12780 + 3600 : 13800,
      }),
      combinedGrade: 13,
      gradeDisplay: toGradeName(13),
      internalGradeText: "16 (Grade S1)",
      maxSectionGradePoints: judged ? 5 : 4,
      awardedGradePoints: Math.floor(ramp(f, 0, 1200, 60, 96)),
      awardedGradePointsProgress: ramp(f, 0, 1200, 0.6, 0.96),
      ...decayFields(0.15 + 0.85 * (1 - (f % 2400) / 2400)),
      staffRollGradePointsDisplay: "+0",
    };
  },
};

/**
 * COOL missed: crossing at 47s — 2s PAST the 45s deadline. The chip freezes
 * white at +00:02:00 (no burst), and the section still clears without a
 * regret (cyan margin lap at 50s).
 */
const mCoolMiss: Scenario = {
  id: "master-cool-miss",
  mode: "master",
  label: "COOL MISSED",
  note: "Chip freezes white at +00:02:00 past the deadline — no burst; cyan margin lap still fires.",
  frames: 1248,
  at: (f) => {
    const T0 = 10200;
    const E0 = 2610; // picked up at level 452, 43.5s into section 4
    const FX70 = 210; // x70 (level 470) at 47.0s (deadline 45s) -> no COOL
    const FCLR = 390; // level 500 at 50.0s
    const tf = T0 + E0 + f;
    const cleared = f >= FCLR;
    const level =
      f < FX70
        ? Math.floor(ramp(f, 0, FX70, 452, 470))
        : f < FCLR
          ? Math.floor(ramp(f, FX70, FCLR, 470, 500))
          : 500 + Math.floor(ramp(f, FCLR, 1200, 0, 24));
    const sectionTimes = cleared ? [2700, 2650, 2500, 2350, 3000] : [2700, 2650, 2500, 2350, 0];
    return {
      ...MASTER_EXTRAS,
      ...lively(f),
      playfield: M_PF,
      ...runFields({
        tf,
        level,
        count: 10,
        sectionTimes,
        regrets: [false, false, false, false, false],
        cools: [true, true, true, true, false],
        seventy: [2200, 2150, 2050, 2600, f >= FX70 ? 2820 : 0],
        coolDeadline: cleared ? 13200 + 2520 : 12900,
        regretDeadline: cleared ? 13200 + 3600 : 13800,
      }),
      combinedGrade: 13,
      gradeDisplay: toGradeName(13),
      internalGradeText: "16 (Grade S1)",
      maxSectionGradePoints: 4,
      awardedGradePoints: Math.floor(ramp(f, 0, 1200, 55, 90)),
      awardedGradePointsProgress: ramp(f, 0, 1200, 0.55, 0.9),
      ...decayFields(0.15 + 0.85 * (1 - (f % 2400) / 2400)),
      staffRollGradePointsDisplay: "+0",
    };
  },
};

/**
 * REGRET lap: section 2's 75s window runs out — the chip counts down the last
 * 2s, flips to +red, and the section completes at 77s with the 3s red lap
 * flash (+00:02:00 overdue). KPI REGRET increments with its own red flash and
 * the section list row turns red.
 */
const mRegret: Scenario = {
  id: "master-regret",
  mode: "master",
  label: "REGRET LAP",
  note: "Deadline -00:02:00 → +red, then the 77s section lap flashes red +00:02:00; list row goes red.",
  frames: 1248,
  at: (f) => {
    const T0 = 5750; // sections 0-1: [2900, 2850]
    const E0 = 4380; // picked up at level 277, 73s into section 2 (x70 judged, no COOL)
    const FCLR = 240; // level 300 at 77.0s -> regret lap 4620 (limit 75s)
    const tf = T0 + E0 + f;
    const cleared = f >= FCLR;
    const level =
      f < FCLR
        ? Math.floor(ramp(f, 0, FCLR, 277, 300))
        : 300 + Math.floor(ramp(f, FCLR, 1200, 0, 18));
    const sectionTimes = cleared ? [2900, 2850, 4620] : [2900, 2850, 0];
    return {
      ...MASTER_EXTRAS,
      ...lively(f),
      playfield: M_PF,
      ...runFields({
        tf,
        level,
        count: 10,
        sectionTimes,
        regrets: [false, false, cleared],
        cools: [true, false, false],
        seventy: [2100, 2200, 4300],
        coolDeadline: cleared ? 10370 + 2940 : 8690,
        regretDeadline: cleared ? 10370 + 4080 : 10250,
      }),
      combinedGrade: 12,
      gradeDisplay: toGradeName(12),
      internalGradeText: "15 (Grade S1)",
      sectionRegretCount: cleared ? 1 : 0,
      maxSectionGradePoints: 1,
      awardedGradePoints: Math.floor(ramp(f, 0, 1200, 40, 80)),
      awardedGradePointsProgress: ramp(f, 0, 1200, 0.4, 0.8),
      ...decayFields(0.2 + 0.8 * (1 - (f % 2100) / 2100)),
      staffRollGradePointsDisplay: "+0",
    };
  },
};

/**
 * Level-500 torikan (7:00): a slow run crosses 500 at 7:01 — every indicator
 * locks at the crossing: the COOL chip holds section 4's frozen verdict, the
 * REGRET chip holds the section-4 lap in red, hero level/time freeze, and
 * the section list stops at five rows.
 */
const mTorikan500: Scenario = {
  id: "master-torikan-500",
  mode: "master",
  label: "LV500 TORIKAN",
  note: "7:01 crossing — everything freezes at death: held COOL verdict, red section lap, frozen hero.",
  frames: 1608,
  at: (f) => {
    const T0 = 19400; // sections 0-3 (slow, all regretted): [5000, 4900, 4800, 4700]
    const E0 = 5200; // picked up 6:50 into the run
    const FDEATH = 660; // level 500 at 7:01.00 (limit 7:00) -> run over
    const dead = f >= FDEATH;
    const tf = dead ? 25260 : T0 + E0 + f;
    const level = dead ? 500 : Math.floor(ramp(f, 0, FDEATH, 460, 500));
    const sectionTimes = dead
      ? [5000, 4900, 4800, 4700, 5860]
      : [5000, 4900, 4800, 4700, 0];
    return {
      ...MASTER_EXTRAS,
      ...lively(Math.min(f, FDEATH)),
      playfield: M_PF,
      ...runFields({
        tf,
        level,
        count: 10,
        sectionTimes,
        regrets: [true, true, true, true, dead],
        cools: [false, false, false, false, false],
        seventy: [4300, 4200, 4100, 4050, 4900],
        coolDeadline: 22100,
        regretDeadline: 23000,
      }),
      combinedGrade: 7,
      gradeDisplay: toGradeName(7),
      internalGradeText: "12 (Grade 1)",
      sectionRegretCount: 4,
      maxSectionGradePoints: 0,
      awardedGradePoints: 30,
      awardedGradePointsProgress: 0.3,
      ...decayFields(0.4),
      staffRollGradePointsDisplay: "+0",
    };
  },
};

/**
 * The credit-roll CLEAR pair (FADING / INVISIBLE) mid-roll: the clock
 * counts down in white; reaching 0 latches "CLEAR!!" (3s gold blink, then
 * static gold). The roll kind explains itself through the conditions:
 * FADING has the 9 COOLs but internal grade 17 < 27 (cyan band); INVISIBLE
 * met both (full gold band).
 */
function rollClearTimeline(f: number, invisible: boolean): Partial<ProcessedGameState> {
  const laps = [2000, 1950, 1900, 1850, 1800, 1800, 1750, 1750, 2100]; // sum 16900
  const CLEAR_AT = 360; // remaining hits 0 — survived
  const cleared = f >= CLEAR_AT;
  const remaining = Math.max(0, CLEAR_AT - f);

  return {
    ...MASTER_EXTRAS,
    ...lively(f),
    playfield: demoPlayfield(invisible ? 5 : 3, invisible ? 7717 : 31337),
    ...runFields({
      tf: 16900 + f,
      level: 999,
      count: 10,
      sectionTimes: [...laps, 0],
      regrets: new Array<boolean>(10).fill(false),
      cools: [true, true, true, true, true, true, true, true, true, false],
      coolDeadline: 0,
      regretDeadline: 0,
    }),
    isInvisible: invisible,
    isStaffRollActive: true,
    showStaffRollTime: true,
    statusCardTitle: invisible ? "INVISIBLE ROLL!!" : "FADING ROLL!",
    statusCardSubtitle: cleared ? "CLEAR!!" : formatTime(remaining),
    remainingStaffRollFrames: remaining,
    staffRollGradePoints: 1,
    staffRollClearPoints: cleared ? (invisible ? 1.6 : 0.5) : 0,
    maxStaffRollGradePoints: cleared ? (invisible ? 2.6 : 1.5) : 1,
    staffRollGradePointsDisplay: cleared ? (invisible ? "+2.6" : "+1.5") : "+1",
    combinedGrade: cleared && invisible ? 15 : 14,
    gradeDisplay: toGradeName(cleared && invisible ? 15 : 14),
    internalGrade: invisible ? 27 : 17,
    internalGradeText: invisible ? "27 (Grade S7)" : "17 (Grade S1)",
    isInternalGradeQualified: invisible,
    maxSectionGradePoints: 9,
    isSectionCoolQualified: true,
    awardedGradePoints: 100,
    awardedGradePointsProgress: 1,
    ...decayFields(0.9),
  };
}

/** FADING + CLEAR: cyan band, white clock to 0, CLEAR!! lands gold. */
const mFadingClear: Scenario = {
  id: "master-fading-clear",
  mode: "master",
  label: "FADING + CLEAR",
  note: "Cyan band, COOL 9 met but internal 17 < 27 (hence fading). Clock to 0 → CLEAR!! gold blink → gold.",
  frames: 1048,
  at: (f) => rollClearTimeline(f, false),
};

/**
 * The FAIL runs with their full approach: climb 980→999 — the final
 * section's REGRET verdict fires at the crossing (the `finalRegret` pick
 * decides which side: overran the 50s window, or dodged it) — then the
 * in-game 3-second pause, the credit roll entry, and 10 seconds in the
 * stack tops out. Everything freezes at the death reading (roll clock at
 * 00:44:41) and CLEAR!! never comes.
 */
function rollFailApproach(f: number, invisible: boolean, finalRegret: boolean): Partial<ProcessedGameState> {
  const laps = [2000, 1950, 1900, 1850, 1800, 1800, 1750, 1750, 2100]; // sum 16900
  // regret run: picked up at 48.3s, lap 3130 (> 50s window); clean run: 33.3s, lap 2240
  const E0 = finalRegret ? 2900 : 2000;
  const F999 = finalRegret ? 230 : 240;
  const LAP9 = finalRegret ? 3130 : 2240;
  const FROLL = F999 + 180; // the in-game 3s pause, then the roll starts
  const FDEATH = FROLL + 600; // top out 10s into the roll (2665 left)

  const reached = f >= F999;
  const rolling = f >= FROLL;
  const dead = f >= FDEATH;
  const tf = reached ? 16900 + LAP9 : 16900 + E0 + f;
  const remaining = rolling ? (dead ? 2665 : 3265 - (f - FROLL)) : 0;

  return {
    ...MASTER_EXTRAS,
    ...lively(Math.min(f, FDEATH)),
    playfield: dead
      ? demoPlayfield(17, invisible ? 7717 : 31337)
      : demoPlayfield(invisible ? 5 : 3, invisible ? 7717 : 31337),
    ...runFields({
      tf,
      level: reached ? 999 : Math.floor(ramp(f, 0, F999, 980, 999)),
      count: 10,
      sectionTimes: reached ? [...laps, LAP9] : [...laps, 0],
      regrets: reached && finalRegret ? [false, false, false, false, false, false, false, false, false, true] : new Array<boolean>(10).fill(false),
      cools: [true, true, true, true, true, true, true, true, true, false],
      coolDeadline: 0, // section 9 has no COOL
      regretDeadline: rolling ? 0 : 16900 + 3000,
    }),
    isInvisible: invisible,
    isStaffRollActive: rolling,
    showStaffRollTime: rolling,
    statusCardTitle: !rolling
      ? "NORMAL\nPLAY"
      : invisible
        ? "INVISIBLE ROLL!!"
        : "FADING ROLL!",
    // frozen at the death reading — no CLEAR!! ever
    statusCardSubtitle: rolling ? formatTime(remaining) : "",
    remainingStaffRollFrames: remaining,
    staffRollGradePoints: rolling ? 1 : 0,
    maxStaffRollGradePoints: rolling ? 1 : 0,
    staffRollGradePointsDisplay: rolling ? "+1" : "+0",
    combinedGrade: 14,
    gradeDisplay: toGradeName(14),
    internalGrade: invisible ? 27 : 17,
    internalGradeText: invisible ? "27 (Grade S7)" : "17 (Grade S1)",
    isInternalGradeQualified: invisible,
    maxSectionGradePoints: 9,
    isSectionCoolQualified: true,
    sectionRegretCount: reached && finalRegret ? 1 : 0,
    awardedGradePoints: 100,
    awardedGradePointsProgress: 1,
    ...decayFields(0.9),
  };
}

/** FADING + FAIL: the 900-999 section REGRETS, then the roll death. */
const mFadingFail: Scenario = {
  id: "master-fading-fail",
  mode: "master",
  label: "FADING + FAIL",
  note: "999 crossing REGRETS the final section (+00:02:17 red lap) → 3s pause → FADING ROLL! → dies 10s in.",
  frames: 1468,
  at: (f) => rollFailApproach(f, false, true),
};

/** INVISIBLE + CLEAR: full gold treatment; +1.6 clear points raise the grade. */
const mInvisClear: Scenario = {
  id: "master-invis-clear",
  mode: "master",
  label: "INVIS + CLEAR",
  note: "Gold band (both roll conditions met). CLEAR!! gold blink; grade +1 → KPI flash + grade-up sound.",
  frames: 1048,
  at: (f) => rollClearTimeline(f, true),
};

/** INVISIBLE + FAIL: the 900-999 section DODGES the regret, then the roll death. */
const mInvisFail: Scenario = {
  id: "master-invis-fail",
  mode: "master",
  label: "INVIS + FAIL",
  note: "999 crossing dodges the final-section regret (-00:12:66 cyan lap) → gold roll → dies 10s in.",
  frames: 1468,
  at: (f) => rollFailApproach(f, true, false),
};

/**
 * Grade-up moment: grade points fill to 100, the internal grade ticks over —
 * KPI GRADE flashes white↔gold for 3s with the grade-up sound, points reset
 * and start filling again. Decay timer draining in parallel.
 */
const mGradeUp: Scenario = {
  id: "master-grade-up",
  mode: "master",
  label: "GRADE UP",
  note: "Points hit 100 → GRADE S4→S5: 3s white/gold KPI flash + grade-up sound; decay timer drains.",
  frames: 1248,
  at: (f) => {
    const T0 = 8100; // sections 0-2: [2800, 2700, 2600]
    const E0 = 1500; // picked up at level 350, 25s into section 3
    const FG = 450; // points reach 100 -> internal grade up
    const tf = T0 + E0 + f;
    const graded = f >= FG;
    const level = Math.floor(ramp(f, 0, 1200, 350, 395));
    const points = graded ? ramp(f, FG, 1200, 0, 35) : ramp(f, 0, FG, 40, 99);
    const decayProgress = 0.1 + 0.9 * (1 - (f % 1800) / 1800);
    return {
      ...MASTER_EXTRAS,
      ...lively(f),
      playfield: M_PF,
      ...runFields({
        tf,
        level,
        count: 10,
        sectionTimes: [2800, 2700, 2600, 0],
        regrets: [false, false, false],
        cools: [true, true, false],
        seventy: [2200, 2100, 2050, 0],
        coolDeadline: 10800, // section 3 x70 not crossed yet
        regretDeadline: 12180,
      }),
      combinedGrade: graded ? 14 : 13,
      gradeDisplay: toGradeName(graded ? 14 : 13),
      internalGradeText: graded ? "17 (Grade S1)" : "16 (Grade S1)",
      maxSectionGradePoints: 3,
      awardedGradePoints: Math.floor(points),
      awardedGradePointsProgress: points / 100,
      ...decayFields(decayProgress),
      staffRollGradePointsDisplay: "+0",
    };
  },
};

/**
 * COOL + REGRET in one section, watched from the start: picked up at level
 * 230, the x70 crossing (level 270) comes at 47.0s — under the 49s COOL
 * limit (2s margin, chip freezes + cyan burst) — and then the section
 * CHOKES, crawling to a 77.0s completion past the 75s regret line. The list
 * shows all three verdict styles: section 0 COOL-only (cyan), section 1
 * regret-only (red), section 2 both — the bonus and penalty cancel out
 * (+1 − 1 = 0), so the live cyan value settles into plain white at the
 * clear.
 */
const mCoolRegret: Scenario = {
  id: "master-cool-regret",
  mode: "master",
  label: "COOL + REGRET",
  note: "From 230: COOL earned at x70 (47s, live) — then the section chokes past 75s. Row 200s settles white (+1 −1 = 0).",
  frames: 2868,
  at: (f) => {
    const T0 = 7600; // sections 0-1: [2900, 4700] (section 1 regretted)
    const E0 = 2200; // picked up at level 230, 36.7s into section 2
    const FX70 = 620; // x70 (level 270) at 47.0s -> COOL (limit 49s, margin 120)
    const FCLR = 2420; // level 300 at 77.0s -> lap 4620 > 75s limit -> REGRET
    const tf = T0 + E0 + f;
    const judged = f >= FX70;
    const cleared = f >= FCLR;
    const level =
      f < FX70
        ? Math.floor(ramp(f, 0, FX70, 230, 270))
        : f < FCLR
          ? Math.floor(ramp(f, FX70, FCLR, 270, 300))
          : 300 + Math.floor(ramp(f, FCLR, 2800, 0, 18));
    return {
      ...MASTER_EXTRAS,
      ...lively(f),
      playfield: M_PF,
      ...runFields({
        tf,
        level,
        count: 10,
        sectionTimes: cleared ? [2900, 4700, 4620] : [2900, 4700, 0],
        regrets: cleared ? [false, true, true] : [false, true],
        cools: [true, false, judged],
        seventy: [2100, 2200, judged ? 2820 : 0],
        // section 2 has no grace (section 1 no cool): plain 49s deadline
        coolDeadline: cleared ? 12220 + 2940 : 10540,
        regretDeadline: cleared ? 12220 + 4080 : 12100,
      }),
      combinedGrade: 12,
      gradeDisplay: toGradeName(12),
      internalGradeText: "15 (Grade S1)",
      sectionRegretCount: cleared ? 2 : 1,
      maxSectionGradePoints: judged ? 2 : 1,
      awardedGradePoints: Math.floor(ramp(f, 0, 2800, 40, 85)),
      awardedGradePointsProgress: ramp(f, 0, 2800, 0.4, 0.85),
      ...decayFields(0.2 + 0.8 * (1 - (f % 2100) / 2100)),
      staffRollGradePointsDisplay: "+0",
    };
  },
};

/**
 * The EXAM EXEMPTION, A/B against the torikan death: the exact same run and
 * the exact same 7:01 level-500 crossing as master-torikan-500 — but this
 * one is a PROMOTIONAL EXAM, so the 7:00 limit does not apply. Nothing
 * freezes: the gold exam band holds, the level rolls on into section 5, the
 * chips start fresh countdowns and the section list keeps ticking.
 */
const mExamExempt: Scenario = {
  id: "master-exam-exempt",
  mode: "master",
  label: "PROMO EXAM 7:00+",
  note: "Same 7:01 crossing as LV500 TORIKAN — but a promotional exam: no death, gold band holds, run continues.",
  frames: 1848,
  at: (f) => {
    const T0 = 19400; // sections 0-3 (slow, all regretted): [5000, 4900, 4800, 4700]
    const E0 = 5200; // picked up 6:50 into the run, level 486
    const FX = 660; // level 500 at 7:01.00 (over the 7:00 limit) -> EXEMPT
    const crossed = f >= FX;
    const tf = T0 + E0 + f;
    const level = crossed
      ? 500 + Math.floor(ramp(f, FX, 1800, 0, 28))
      : Math.floor(ramp(f, 0, FX, 460, 500));
    return {
      ...MASTER_EXTRAS,
      ...lively(f),
      playfield: M_PF,
      ...runFields({
        tf,
        level,
        count: 10,
        sectionTimes: crossed ? [5000, 4900, 4800, 4700, 5860] : [5000, 4900, 4800, 4700, 0],
        regrets: [true, true, true, true, crossed],
        cools: [false, false, false, false, false],
        seventy: [4300, 4200, 4100, 4050, 4900],
        coolDeadline: crossed ? 25260 + 2520 : 22100,
        regretDeadline: crossed ? 25260 + 3600 : 23000,
      }),
      isPromotionExam: true,
      statusCardTitle: "PROMOTIONAL\nEXAM",
      combinedGrade: 13,
      gradeDisplay: toGradeName(13),
      internalGradeText: "17 (Grade S1)",
      sectionRegretCount: crossed ? 5 : 4,
      maxSectionGradePoints: 0,
      awardedGradePoints: 45,
      awardedGradePointsProgress: 0.45,
      ...decayFields(0.5),
      staffRollGradePointsDisplay: "+0",
    };
  },
};

/**
 * The invisible-roll REQUIREMENTS being met, one at a time: an all-cool run
 * sits at COOL 8 / internal grade 26 in section 8. The x70 crossing at 870
 * earns the 9th COOL — the KPI COOL cell lights its static cyan glow. The
 * clean section completes at 900 and the internal grade naturally reaches
 * 27 — the Internal Grade value lights up too: the next roll would be
 * INVISIBLE. Then the run dies at 950 and both glows hold through death.
 */
const mInvisQualify: Scenario = {
  id: "master-invis-qualify",
  mode: "master",
  label: "INVIS REQUIREMENTS",
  note: "870: 9th COOL — the increment blink. 900: internal 27 blinks cyan, then rests cyan. Game over at 950.",
  frames: 2048,
  at: (f) => {
    const T0 = 15850; // sections 0-7, ALL cooled: [2100,2050,2000,2000,1950,1950,1900,1900]
    const E0 = 1200; // picked up at level 820, 20s into section 8
    const F870 = 700; // x70 (level 870) at 31.7s -> the 9th COOL
    const F900 = 900; // level 900: clean lap 2100 -> internal grade 27
    const FDEATH = 1400; // game over at level 950
    const cooled = f >= F870;
    const crossed = f >= F900;
    const dead = f >= FDEATH;
    const tf = dead ? 18450 : T0 + E0 + f;
    const level = dead
      ? 950
      : f < F870
        ? Math.floor(ramp(f, 0, F870, 820, 870))
        : f < F900
          ? Math.floor(ramp(f, F870, F900, 870, 900))
          : Math.floor(ramp(f, F900, FDEATH, 900, 950));
    return {
      ...MASTER_EXTRAS,
      ...lively(Math.min(f, FDEATH)),
      playfield: dead ? demoPlayfield(17, 8123) : M_PF,
      ...runFields({
        tf,
        level,
        count: 10,
        sectionTimes: crossed ? [2100, 2050, 2000, 2000, 1950, 1950, 1900, 1900, 2100] : [2100, 2050, 2000, 2000, 1950, 1950, 1900, 1900, 0],
        regrets: [false, false, false, false, false, false, false, false],
        cools: [true, true, true, true, true, true, true, true, cooled],
        seventy: [2200, 2150, 2100, 2050, 2000, 1950, 1900, 1900, cooled ? 1900 : 0],
        // section 8 grace: prev 70% (1900) + 120 = 2020 < the 2280 table limit
        coolDeadline: crossed ? 0 : T0 + 2020,
        regretDeadline: crossed ? T0 + 2100 + 3000 : T0 + 3000,
      }),
      statusCardTitle: "NORMAL\nPLAY",
      combinedGrade: 15,
      gradeDisplay: toGradeName(15),
      internalGrade: crossed ? 27 : 26,
      internalGradeText: crossed ? "27 (Grade S7)" : "26 (Grade S6)",
      isInternalGradeQualified: crossed,
      maxSectionGradePoints: cooled ? 9 : 8,
      isSectionCoolQualified: cooled,
      awardedGradePoints: 90,
      awardedGradePointsProgress: 0.9,
      ...decayFields(0.6),
      staffRollGradePointsDisplay: "+0",
    };
  },
};

// ---------------------------------------------------------------------------
// SHIRASE scenarios (WORLD rules: 500 by 3:03, 1000 by 6:06)
// ---------------------------------------------------------------------------

const S_PF = demoPlayfield(7, 5171);

/**
 * Checkpoint PASS: level 500 crossed at 3:00 (limit 3:03) — the countdown
 * chip is replaced by the 3s cyan margin lap (-00:03:00), the ladder's first
 * tier turns PASS, the TO LV 1000 countdown takes over and rising-garbage
 * quota goes live.
 */
const sCheckpointPass: Scenario = {
  id: "shirase-checkpoint-pass",
  mode: "shirase",
  label: "LV500 PASS",
  note: "3:00 crossing (limit 3:03): cyan -00:03:00 lap, ladder PASS, TO LV 1000 takes over, quota live.",
  frames: 1548,
  at: (f) => {
    const T0 = 10000; // sections 0-3: [2550, 2500, 2480, 2470]
    const E0 = 530; // picked up at level 470, 7.5s on the checkpoint clock
    const FX = 270; // level 500 at 3:00.00 (limit 10980) -> margin 180
    const tf0 = T0 + E0;
    const crossed = f >= FX;
    const tf = tf0 + f;
    const level = crossed
      ? 500 + Math.floor(ramp(f, FX, 1500, 0, 25))
      : Math.floor(ramp(f, 0, FX, 470, 500));
    return {
      ...SHIRASE_EXTRAS,
      ...lively(f),
      playfield: S_PF,
      ...runFields({
        tf,
        level,
        count: 13,
        sectionTimes: crossed ? [2550, 2500, 2480, 2470, 800] : [2550, 2500, 2480, 2470, 0],
        regrets: new Array<boolean>(13).fill(false),
        regretDeadline: 13000,
      }),
      combinedGrade: 14,
      statusCardTitle: crossed ? "RISING\nGARBAGE" : "NORMAL\nPLAY",
      maxGarbageQuota: crossed ? 40 : 0,
      garbageQuota: crossed ? Math.max(0, 22 - Math.floor((f - FX) / 240)) : 0,
      garbageQuotaText: crossed
        ? `${Math.max(0, 22 - Math.floor((f - FX) / 240))}/40`
        : "",
    };
  },
};

/**
 * Checkpoint FAIL at 500 — with a section REGRET at the death crossing:
 * the 400-500 section overran its 50s window, and the 500 crossing lands
 * at 3:45, over the 3:03 limit. The regret lap burst flashes red for its
 * 3s (+00:03:33 overdue) even though the run dies on the same tick, THEN
 * the torikan freeze locks in: chip at the death lap (00:53:33), ladder
 * FAIL, status back to NORMAL PLAY, section KPI locked at 5, quota OFF.
 */
const sTorikan500: Scenario = {
  id: "shirase-torikan-500",
  mode: "shirase",
  label: "LV500 FAIL",
  note: "Death crossing carries a section regret: 3s red overdue burst (+00:03:33), then the verdict holds in red.",
  frames: 1548,
  at: (f) => {
    const T0 = 10300; // sections 0-3: [2600, 2550, 2500, 2650]
    const E0 = 2930; // picked up at level 455, the 50s window just barely left
    const FX = 270; // level 500 at 3:45.00 (limit 10980) -> FAIL, lap 3200
    const dead = f >= FX;
    const tf = dead ? 13500 : T0 + E0 + f;
    const level = dead ? 500 : Math.floor(ramp(f, 0, FX, 455, 500));
    return {
      ...SHIRASE_EXTRAS,
      ...lively(Math.min(f, FX)),
      playfield: S_PF,
      ...runFields({
        tf,
        level,
        count: 13,
        sectionTimes: dead ? [2600, 2550, 2500, 2650, 3200] : [2600, 2550, 2500, 2650, 0],
        regrets: dead ? [false, false, false, false, true] : [false, false, false, false],
        regretDeadline: 13300,
      }),
      combinedGrade: 12,
      sectionRegretCount: dead ? 1 : 0,
      level500TimeLimitExceeded: dead,
    };
  },
};

/**
 * Checkpoint FAIL at 1000: 500 was passed in time, the run dies crossing
 * 1000 at 6:09.5 (limit 6:06) — the status card locks to RISING GARBAGE
 * (the gimmick being played at death), the ladder shows 500 PASS / 1000
 * FAIL, and the garbage quota switches OFF after death.
 */
const sTorikan1000: Scenario = {
  id: "shirase-torikan-1000",
  mode: "shirase",
  label: "LV1000 FAIL",
  note: "6:09 crossing: RISING GARBAGE locks in the band, 1000 FAIL, quota OFF, section KPI 10.",
  frames: 1548,
  at: (f) => {
    const T0 = 21000; // sections 0-8 (500 passed at 3:01 earlier)
    const E0 = 900; // picked up at level 950, still under the limit
    const FX = 270; // level 1000 at 6:09.50 (limit 21960) -> FAIL
    const dead = f >= FX;
    const tf = dead ? 22170 : T0 + E0 + f;
    const level = dead ? 1000 : Math.floor(ramp(f, 0, FX, 950, 1000));
    return {
      ...SHIRASE_EXTRAS,
      ...lively(Math.min(f, FX)),
      playfield: S_PF,
      ...runFields({
        tf,
        level,
        count: 13,
        sectionTimes: dead
          ? [2600, 2500, 2450, 2400, 2350, 2300, 2250, 2200, 1950, 1170]
          : [2600, 2500, 2450, 2400, 2350, 2300, 2250, 2200, 1950, 0],
        regrets: new Array<boolean>(13).fill(false),
        regretDeadline: 24000,
      }),
      // died at the 1000 crossing without entering 1001+: still garbage mode
      statusCardTitle: "RISING\nGARBAGE",
      combinedGrade: 18,
      level1000TimeLimitExceeded: dead,
      maxGarbageQuota: 40,
      garbageQuota: 18,
      garbageQuotaText: "18/40",
    };
  },
};

/**
 * Section REGRET: section 3's 50s window expires — countdown crosses 0 into
 * +red, the section completes at 52s with the red lap flash, KPI REGRET
 * increments, and the list row turns red.
 */
const sRegret: Scenario = {
  id: "shirase-regret",
  mode: "shirase",
  label: "REGRET LAP",
  note: "50s window expires: +red countdown, 52s lap flashes red +00:02:17, KPI REGRET increments.",
  frames: 1248,
  at: (f) => {
    const T0 = 7500; // sections 0-2: [2550, 2500, 2450]
    const E0 = 2830; // picked up at level 360, 2.8s left on the 50s window
    const FCLR = 300; // level 400 at 52.2s -> regret lap 3130 (limit 3000)
    const tf = T0 + E0 + f;
    const cleared = f >= FCLR;
    const level =
      f < FCLR
        ? Math.floor(ramp(f, 0, FCLR, 360, 400))
        : 400 + Math.floor(ramp(f, FCLR, 1200, 0, 15));
    return {
      ...SHIRASE_EXTRAS,
      ...lively(f),
      playfield: S_PF,
      ...runFields({
        tf,
        level,
        count: 13,
        sectionTimes: cleared ? [2550, 2500, 2450, 3130] : [2550, 2500, 2450, 0],
        regrets: cleared ? [false, false, false, true] : [false, false, false],
        regretDeadline: cleared ? 10630 + 3000 : 10500,
      }),
      combinedGrade: 13,
      sectionRegretCount: cleared ? 1 : 0,
    };
  },
};

/**
 * The level-1000 crossing — both sides of it: a RISING GARBAGE run climbs
 * 950→1000 and squeaks under the 6:06 torikan by one second (cyan margin
 * lap), and the moment the level counter rolls over the gimmick flips —
 * the status card becomes MONOCHROME BLOCK, IBM blocks start landing on
 * the cleared field (a row every 2s), the garbage quota switches OFF and
 * section 10's clock starts.
 */
const sMonochrome: Scenario = {
  id: "shirase-monochrome",
  mode: "shirase",
  label: "MONOCHROME 1000+",
  note: "950→1000 narrow pass (1s margin), then the mode flips: MONOCHROME BLOCK card, IBM blocks land, LAST SECTION takes the right chip.",
  frames: 1548,
  at: (f) => {
    // back half stretched so the 1000 crossing lands at 3:38.33 — 1s under
    const laps = [...SHIRASE_LAPS_TO_1000];
    for (let i = 5; i < 10; i++) laps[i] += 180;
    const F1000 = 300; // level 1000 at tf 21900 (limit 21960) -> PASS by 60
    const crossed = f >= F1000;
    const tf = 21600 + f;
    const level = crossed
      ? 1000 + Math.floor(ramp(f, F1000, 1500, 0, 50))
      : Math.floor(ramp(f, 0, F1000, 950, 1000));
    return {
      ...SHIRASE_EXTRAS,
      ...lively(f),
      // pre-1000: the garbage section's cleared field; post: IBM rows land
      playfield: crossed
        ? monoPlayfield(Math.min(3, 1 + Math.floor((f - F1000) / 120)), 6004)
        : EMPTY_PF,
      ...runFields({
        tf,
        level,
        count: 13,
        sectionTimes: crossed ? [...laps] : [...laps.slice(0, 9), 0],
        regrets: new Array<boolean>(13).fill(false),
        regretDeadline: crossed ? 21900 + 3000 : 19570 + 3000,
      }),
      statusCardTitle: crossed ? "MONOCHROME\nBLOCK" : "RISING\nGARBAGE",
      combinedGrade: 20,
      maxGarbageQuota: crossed ? 0 : 40,
      garbageQuota: crossed ? 0 : 12,
      garbageQuotaText: crossed ? "" : "12/40",
    };
  },
};

/** Sections 0-9 (through the level-1000 crossing at 21000 — both torikans
 *  passed: 500 at 10550 < 3:03, 1000 at 21000 < 6:06). */
const SHIRASE_LAPS_TO_1000 = [2200, 2150, 2100, 2050, 2050, 2100, 2050, 2100, 2050, 2150];

/** All 13 sections complete — level 1300 crossed at 28000 (7:46.67). */
const SHIRASE_FULL_LAPS = [...SHIRASE_LAPS_TO_1000, 2400, 2300, 2300];

/**
 * BIG BLOCK CLEAR: 1300 crossed, Shirase's credit roll (the pieces double
 * in size) counts down in the GOLD band —
 * surviving to 0 latches the CLEAR!! verdict. Section KPI caps at 13, both
 * ladder tiers PASS, the field plays on in single-colour big mode.
 */
const sRollClear: Scenario = {
  id: "shirase-roll-clear",
  mode: "shirase",
  label: "BIG BLOCK CLEAR",
  note: "1300 crossed — BIG BLOCK ROLL!! (gold band, 2x pieces) clock counts down; at 0: CLEAR!! Section caps at 13.",
  frames: 1548,
  at: (f) => {
    const remaining = Math.max(0, 420 - f);
    return {
      ...SHIRASE_EXTRAS,
      ...lively(f),
      playfield: monoPlayfield(5, 6002),
      ...runFields({
        tf: 28000,
        level: 1300,
        count: 13,
        sectionTimes: [...SHIRASE_FULL_LAPS],
        regrets: new Array<boolean>(13).fill(false),
        regretDeadline: 0,
      }),
      isStaffRollActive: true,
      showStaffRollTime: true,
      statusCardTitle: "BIG BLOCK ROLL!!",
      statusCardSubtitle: remaining > 0 ? formatTime(remaining) : "CLEAR!!",
      remainingStaffRollFrames: remaining,
      combinedGrade: 21,
    };
  },
};

/**
 * BIG BLOCK FAIL: the stack tops out mid-roll with 2s left on the clock —
 * everything locks in place (band, chips, section list) and CLEAR!! never
 * comes. The tall monochrome stack is the death.
 */
const sRollFail: Scenario = {
  id: "shirase-roll-fail",
  mode: "shirase",
  label: "BIG BLOCK FAIL",
  note: "BIG BLOCK roll (gold band): stack tops out with 2s on the clock — everything locks, no CLEAR!!.",
  frames: 1548,
  at: (f) => {
    const FDEATH = 180; // top out — roll clock freezes at 120 (2s)
    const dead = f >= FDEATH;
    const remaining = dead ? 120 : 300 - f;
    return {
      ...SHIRASE_EXTRAS,
      ...lively(Math.min(f, FDEATH)),
      playfield: monoPlayfield(17, 6003),
      ...runFields({
        tf: 28000,
        level: 1300,
        count: 13,
        sectionTimes: [...SHIRASE_FULL_LAPS],
        regrets: new Array<boolean>(13).fill(false),
        regretDeadline: 0,
      }),
      isStaffRollActive: true,
      showStaffRollTime: true,
      statusCardTitle: "BIG BLOCK ROLL!!",
      statusCardSubtitle: formatTime(remaining),
      remainingStaffRollFrames: remaining,
      combinedGrade: 21,
    };
  },
};

/**
 * The natural level-1300 crossing and a roll DEATH: a monochrome run climbs
 * 1250→1300, the 13th section lap locks in and the roll clock starts at its
 * full 3265 frames — then, 10 seconds into the big-mode roll, the stack
 * tops out. Everything freezes at the death reading (clock at 00:44:41)
 * and CLEAR!! never comes.
 */
const sCross1300: Scenario = {
  id: "shirase-cross-1300",
  mode: "shirase",
  label: "1300 + ROLL DEATH",
  note: "1250→1300 crossing, BIG BLOCK roll entry (gold band) — dies 10s in: frozen at 00:44:41, no CLEAR!!.",
  frames: 1448,
  at: (f) => {
    const F1300 = 300; // level 1300 at tf 28000: section 12 lap 2300, roll starts
    const FDEATH = 900; // top out 10s into the roll (2665 frames left)
    const crossed = f >= F1300;
    const dead = f >= FDEATH;
    const tf = dead ? 28600 : crossed ? 28000 : 27700 + f;
    const remaining = !crossed ? 0 : dead ? 2665 : 3265 - (f - F1300);
    const level = crossed ? 1300 : Math.floor(ramp(f, 0, F1300, 1250, 1300));
    return {
      ...SHIRASE_EXTRAS,
      ...lively(Math.min(f, FDEATH)),
      playfield: dead ? monoPlayfield(17, 6005) : monoPlayfield(4, 6005),
      ...runFields({
        tf,
        level,
        count: 13,
        sectionTimes: crossed ? [...SHIRASE_FULL_LAPS] : [...SHIRASE_FULL_LAPS.slice(0, 12), 0],
        regrets: new Array<boolean>(13).fill(false),
        regretDeadline: crossed ? 0 : 28700,
      }),
      statusCardTitle: crossed ? "BIG BLOCK ROLL!!" : "MONOCHROME\nBLOCK",
      isStaffRollActive: crossed,
      showStaffRollTime: crossed,
      // frozen at the death reading (00:44:41) — no CLEAR!! ever
      statusCardSubtitle: crossed ? formatTime(remaining) : "",
      remainingStaffRollFrames: remaining,
      combinedGrade: 21,
    };
  },
};

/**
 * The LAST SECTION chip update inside the monochrome stretch — clean lap:
 * playing 1050→1150, the section 10 lap (38.3s, within the 50s window)
 * completes at the 1100 crossing. The right chip updates from section 9's
 * lap to the fresh one with the CYAN flash while the left REGRET chip
 * flashes its margin. Section 11 then runs on.
 */
const sMono1100: Scenario = {
  id: "shirase-mono-1100",
  mode: "shirase",
  label: "MONO 1100 NO-REGRET",
  note: "Section 10 completes at 1100 (38.3s, clean): LAST SECTION updates with a cyan flash; margin lap on the left.",
  frames: 1248,
  at: (f) => {
    const T0 = 21000; // sections 0-9 done (SHIRASE_LAPS_TO_1000): 1000 passed
    const E0 = 1900; // picked up at level 1050, 31.7s into section 10
    const FCLR = 400; // level 1100 at tf 23300 -> section 10 lap 2300
    const tf = T0 + E0 + f;
    const cleared = f >= FCLR;
    const level =
      f < FCLR
        ? Math.floor(ramp(f, 0, FCLR, 1050, 1100))
        : 1100 + Math.floor(ramp(f, FCLR, 1200, 0, 50));
    return {
      ...SHIRASE_EXTRAS,
      ...lively(f),
      playfield: monoPlayfield(5, 6006),
      ...runFields({
        tf,
        level,
        count: 13,
        sectionTimes: cleared ? [...SHIRASE_LAPS_TO_1000, 2300] : [...SHIRASE_LAPS_TO_1000, 0],
        regrets: new Array<boolean>(13).fill(false),
        regretDeadline: cleared ? 23300 + 3000 : 24000,
      }),
      statusCardTitle: "MONOCHROME\nBLOCK",
      combinedGrade: 20,
    };
  },
};

/**
 * The same 1100 crossing, regretted: the section 10 lap crawls to 52.2s —
 * past the 50s window — so the LAST SECTION update lands with the RED
 * flash, the left REGRET chip bursts the overdue (+00:02:17) and the KPI
 * REGRET counter ticks up.
 */
const sMono1100Regret: Scenario = {
  id: "shirase-mono-1100-regret",
  mode: "shirase",
  label: "MONO 1100 REGRET",
  note: "Section 10 completes at 1100 overran (52.2s > 50s): LAST SECTION updates with a red flash; overdue burst on the left.",
  frames: 1248,
  at: (f) => {
    const T0 = 21000;
    const E0 = 2730; // picked up at level 1050, 45.5s into section 10
    const FCLR = 400; // level 1100 at tf 24130 -> section 10 lap 3130 (regret)
    const tf = T0 + E0 + f;
    const cleared = f >= FCLR;
    const level =
      f < FCLR
        ? Math.floor(ramp(f, 0, FCLR, 1050, 1100))
        : 1100 + Math.floor(ramp(f, FCLR, 1200, 0, 50));
    return {
      ...SHIRASE_EXTRAS,
      ...lively(f),
      playfield: monoPlayfield(5, 6007),
      ...runFields({
        tf,
        level,
        count: 13,
        sectionTimes: cleared ? [...SHIRASE_LAPS_TO_1000, 3130] : [...SHIRASE_LAPS_TO_1000, 0],
        regrets: cleared
          ? [false, false, false, false, false, false, false, false, false, false, true]
          : new Array<boolean>(13).fill(false),
        regretDeadline: cleared ? 24130 + 3000 : 24000,
      }),
      statusCardTitle: "MONOCHROME\nBLOCK",
      combinedGrade: 20,
      sectionRegretCount: cleared ? 1 : 0,
    };
  },
};

// ---------------------------------------------------------------------------
// SAKURA scenarios
// ---------------------------------------------------------------------------

const K_PF = demoPlayfield(8, 971);

/** Regular-stage laps (stages 1-19), a fast realistic pace (~15s each):
 *  with an 18.3s stage 20 the run totals ~4:49 — under the 5:00 line. */
const K_LAPS = Array.from({ length: 19 }, (_, i) => 900 - i * 5);

/** Same pace a notch slower: the run totals ~5:14 — over the 5:00 line. */
const K_LAPS_SLOW = Array.from({ length: 19 }, (_, i) => 980 - i * 5);

function sakuraFields(o: {
  stageIdx: number;
  stageTimes: number[];
  cleared: boolean[];
  elapsed: number;
}): Partial<ProcessedGameState> {
  // the run clock IS the stage cumulative — completed laps + the current
  // stage's elapsed (stages run back-to-back), so the hero TIME and the
  // list's cumulative column can never disagree
  const tf = o.stageTimes.slice(0, o.stageIdx).reduce((a, b) => a + b, 0) + o.elapsed;

  const { sectionTimeDisplays, cumulativeTimeDisplays } = computeSectionTimeDisplays(
    o.stageTimes,
    27
  );
  applyCurrentSectionRealtime(
    o.stageTimes,
    o.elapsed,
    o.stageIdx,
    27,
    sectionTimeDisplays,
    cumulativeTimeDisplays
  );
  return {
    timeFrames: tf,
    formattedTime: formatTime(tf),
    level: o.stageIdx + 1,
    section: 0,
    sectionTimeDisplays,
    cumulativeTimeDisplays,
    sakuraStageTimes: o.stageTimes,
    sakuraStageCleared: o.cleared,
    sakuraStageLevelDisplay: toSakuraCurrentStageName(o.stageIdx),
  };
}

/**
 * EX-stage approach with a stage death: 19 stages cleared (EX 1-3 unlocked in
 * the ladder), stage 20's clock runs down — red blink at 10s, and at 0 the
 * FAIL blink just keeps going. JEWELS counting, ELAPSED climbing.
 */
const kLimitFail: Scenario = {
  id: "sakura-limit-fail",
  mode: "sakura",
  label: "LIMIT FAIL",
  note: "Red blink from 10s; at 0 the stage dies — blink never stops. EX ladder: EX 1-3 unlocked.",
  frames: 1548,
  at: (f) => {
    const limit = Math.max(0, 900 - f); // 15s -> 0 at f900
    const elapsed = Math.min(3600, 2700 + f);
    const cleared = [
      ...new Array<boolean>(19).fill(true),
      ...new Array<boolean>(8).fill(false),
    ];
    return {
      ...lively(Math.min(f, 900)),
      playfield: K_PF,
      ...sakuraFields({
        stageIdx: 19,
        // live elapsed in the in-progress slot (as the processor records it)
        stageTimes: [...K_LAPS, elapsed, ...new Array<number>(7).fill(0)],
        cleared,
        elapsed,
      }),
      sakuraClearedStageLevel: 19,
      clearedStageStatus: 0,
      exStageTier: 3,
      sakuraStageLimitTime: limit,
      sakuraStageElapsedTime: elapsed,
      sakuraStageLimitTimeDisplay: formatTime(Math.max(1, limit)) || "00:00:00",
      remainingJewelBlocks: Math.max(0, 4 - Math.floor(f / 240)),
    };
  },
};

/**
 * Stage CLEAR under the alarm: the limit drops below 10s (red blink), the
 * last jewels go in at 5s remaining — the chip freezes white instantly,
 * CLEARED flashes cyan, the next stage's fresh 60s clock arrives and the
 * ladder's first tier is lit (19+).
 */
const kLimitClear: Scenario = {
  id: "sakura-limit-clear",
  mode: "sakura",
  label: "LIMIT CLEAR",
  note: "Blink at 10s, cleared at 5s: chip freezes white 00:05:00, CLEARED cyan, next stage fresh 60s.",
  frames: 1248,
  at: (f) => {
    const cleared = f >= 360;
    const nextStage = f >= 600;
    const limit = nextStage ? 3600 : cleared ? 300 : Math.max(300, 660 - f);
    const elapsed = nextStage ? f - 600 : cleared ? 3300 : 2940 + f;
    const stageIdx = nextStage ? 19 : 18;
    const clearedCount = cleared ? 19 : 18;
    const stageTimes = [...K_LAPS.slice(0, 18)];
    // live elapsed in the in-progress slot (as the processor records it);
    // the cleared lap freezes at 3300 and the next stage starts ticking
    stageTimes[18] = cleared ? 3300 : elapsed;
    stageTimes[19] = nextStage ? elapsed : 0;
    const clearedArr = [...new Array<boolean>(18).fill(true), cleared];
    while (clearedArr.length < 27) clearedArr.push(false);
    while (stageTimes.length < 27) stageTimes.push(0);
    return {
      ...lively(f),
      playfield: K_PF,
      ...sakuraFields({ stageIdx, stageTimes, cleared: clearedArr, elapsed }),
      sakuraClearedStageLevel: clearedCount,
      clearedStageStatus: cleared && !nextStage ? 1 : 0,
      exStageTier: cleared ? 3 : 0,
      sakuraStageLimitTime: limit,
      sakuraStageElapsedTime: elapsed,
      sakuraStageLimitTimeDisplay: formatTime(Math.max(1, limit)) || "00:00:00",
      remainingJewelBlocks: nextStage ? 10 : cleared ? 0 : Math.max(0, 3 - Math.floor(f / 120)),
    };
  },
};

/**
 * The all-20 verdict, shared by both unlock scenarios: stage 20 (idx 19) is
 * cleared 18.3s in — CLEARED hits the rainbow blink, the second ladder tier
 * lights, and EX1 arrives with a fresh 60s clock. Whether the FINAL tier
 * (ALL 20 WITHIN 5:00) lights is decided by the 20-lap total the lap table
 * produces: K_LAPS totals ~4:49 (EX 1-7), K_LAPS_SLOW ~5:14 (EX 1-5).
 */
function exUnlockTimeline(f: number, laps19: number[]): Partial<ProcessedGameState> {
  const FCLR = 300; // stage 20 clears (elapsed 1100, no alarm)
  const FEX = 360; // EX1 (idx 20) arrives with the fresh 60s clock
  const cleared20 = f >= FCLR;
  const inEx = f >= FEX;
  const stageIdx = inEx ? 20 : 19;

  const stageTimes = [...laps19];
  stageTimes[19] = cleared20 ? 1100 : 800 + f;
  stageTimes[20] = inEx ? f - FEX : 0; // EX1's live elapsed
  while (stageTimes.length < 27) stageTimes.push(0);

  const cleared = [...new Array<boolean>(19).fill(true), cleared20];
  while (cleared.length < 27) cleared.push(false);

  const limit = inEx ? 3600 : cleared20 ? 2500 : 2800 - f;
  const elapsed = inEx ? f - FEX : cleared20 ? 1100 : 800 + f;
  const total = laps19.reduce((a, b) => a + b, 0) + 1100; // latched at the clear

  return {
    ...lively(Math.min(f, FCLR)),
    playfield: K_PF,
    ...sakuraFields({ stageIdx, stageTimes, cleared, elapsed }),
    sakuraClearedStageLevel: cleared20 ? 20 : 19,
    clearedStageStatus: cleared20 ? 2 : 1,
    // the processor's latch: > 5:00 -> EX 1-5, within -> EX 1-7
    exStageTier: !cleared20 ? 3 : total > 5 * 60 * 60 ? 5 : 7,
    sakuraStageLimitTime: limit,
    sakuraStageElapsedTime: elapsed,
    remainingJewelBlocks: inEx ? 10 : cleared20 ? 0 : Math.max(1, 3 - Math.floor(f / 120)),
  };
}

/** All 20 cleared at a 5:14 total — EX 1-5: the final tier stays dark. */
const kEx5Unlock: Scenario = {
  id: "sakura-ex5-unlock",
  mode: "sakura",
  label: "ALL 20 OVER 5:00",
  note: "Stage 20 clears at 5:14: EX 1-5 flashes gold 3s then rests — only that row lit (exclusive). EX1 fresh 60s.",
  frames: 1248,
  at: (f) => exUnlockTimeline(f, K_LAPS_SLOW),
};

/** All 20 cleared at a 4:49 total — EX 1-7: the final tier lights and blinks. */
const kEx7Unlock: Scenario = {
  id: "sakura-ex7-unlock",
  mode: "sakura",
  label: "ALL 20 IN 5:00",
  note: "Stage 20 clears at 4:49: EX 1-7 flashes gold 3s then rests — only that row lit (exclusive). EX1 fresh 60s.",
  frames: 1248,
  at: (f) => exUnlockTimeline(f, K_LAPS),
};

// ---------------------------------------------------------------------------
// EASY scenario
// ---------------------------------------------------------------------------

/**
 * HANABI flow: a realistic thousands-scale score — 1900 climbing in +12
 * bursts, crossing the H2000 profile best about 14s in: the gauge fills the
 * last 5%, then the verdict flips to the gold NEW BEST. Section/total clocks
 * ticking below.
 */
const eHanabi: Scenario = {
  id: "easy-hanabi",
  mode: "easy",
  label: "HANABI BEST",
  note: "1900 in +12 bursts past the H2000 profile best (~14s in) — gauge fills, then gold NEW BEST.",
  frames: 1348,
  at: (f) => {
    const tf = 2700 + f;
    return {
      ...lively(f),
      playfield: demoPlayfield(4, 4242),
      ...runFields({
        tf,
        level: Math.floor(ramp(f, 0, 1300, 120, 160)),
        count: 2,
        sectionTimes: [2700, 0],
        regrets: [false, false],
      }),
      hanabiScore: 1900 + Math.floor(f / 90) * 12,
    };
  },
};

/**
 * The EASY ending: a casual run climbs 170→200, the second section lap
 * locks in and the CREDIT ROLL starts ("CREDIT ROLL!!") — then, 10 seconds
 * in, the stack tops out. Everything freezes at the death reading (roll
 * clock at 00:44:41) and CLEAR!! never comes.
 */
const eRollDeath: Scenario = {
  id: "easy-roll-death",
  mode: "easy",
  label: "EASY ROLL DEATH",
  note: "170→200 (2nd lap 40s), credit roll entry — dies 10s in: clock frozen at 00:44:41, no CLEAR!!.",
  frames: 2148,
  at: (f) => {
    const T0 = 2700; // section 0 lap
    const E0 = 1500; // picked up at level 170, 25s into section 1
    const F200 = 900; // level 200 at tf 5100: section 1 lap 2400, roll starts
    const FDEATH = 1500; // top out 10s into the roll (2665 frames left)
    const crossed = f >= F200;
    const dead = f >= FDEATH;
    const tf = dead ? 5700 : T0 + E0 + f;
    const remaining = crossed ? (dead ? 2665 : 3265 - (f - F200)) : 0;
    const level = crossed ? 200 : Math.floor(ramp(f, 0, F200, 170, 200));
    return {
      ...lively(Math.min(f, FDEATH)),
      playfield: dead ? demoPlayfield(17, 4243) : demoPlayfield(4, 4242),
      ...runFields({
        tf,
        level,
        count: 2,
        sectionTimes: crossed ? [2700, 2400] : [2700, 0],
        regrets: [false, false],
      }),
      hanabiScore: 6000 + Math.floor(Math.min(f, FDEATH) / 60) * 50,
      statusCardTitle: crossed ? "CREDIT ROLL!!" : "NORMAL\nPLAY",
      isStaffRollActive: crossed,
      showStaffRollTime: crossed,
      // frozen at the death reading — no CLEAR!! ever
      statusCardSubtitle: crossed ? formatTime(remaining) : "",
      remainingStaffRollFrames: remaining,
    };
  },
};

// ---------------------------------------------------------------------------
// Catalog + driver
// ---------------------------------------------------------------------------

export const SCENARIOS: Scenario[] = [
  mCoolAward,
  mCoolMiss,
  mRegret,
  mCoolRegret,
  mTorikan500,
  mExamExempt,
  mFadingClear,
  mFadingFail,
  mInvisClear,
  mInvisFail,
  mInvisQualify,
  mGradeUp,
  sCheckpointPass,
  sTorikan500,
  sTorikan1000,
  sRegret,
  sMonochrome,
  sMono1100,
  sMono1100Regret,
  sCross1300,
  sRollClear,
  sRollFail,
  kLimitFail,
  kLimitClear,
  kEx5Unlock,
  kEx7Unlock,
  eHanabi,
  eRollDeath,
];

/**
 * The state a scenario streams at `frame`. The final RESET_FRAMES of every
 * timeline (and negative frame numbers, where the driver starts) emit the
 * fresh base state — timeFrames 0, the reset signal every latch hook uses.
 */
export function stateAt(scenario: Scenario, frame: number): ProcessedGameState {
  const f = ((frame % scenario.frames) + scenario.frames) % scenario.frames;
  const base = baseState(scenario.mode);
  if (f >= scenario.frames - RESET_FRAMES || frame < 0) {
    // fresh state — spread-copied, the cached base is never mutated
    return { ...base, playfield: EMPTY_PF };
  }
  return { ...base, ...scenario.at(f) };
}
