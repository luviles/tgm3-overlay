/**
 * Unit tests for the ported core logic.
 * Expected values were derived from the original C# implementation
 * (Tgm3Visualizer.Core) to guarantee behavioral parity.
 */

import { describe, expect, it } from "vitest";

import {
  calculateGradeHistory,
  formatGradePoints,
  formatTime,
  getSectionRange,
  getMaxDecayTime,
  isRegret,
  isShiraseRegret,
  toGradeName,
  toDisplayGrade,
  toSakuraGradeName,
  toSakuraCurrentStageName,
  toShiraseGradeName,
} from "../calculators";
import { getMaxLockFrame, MASTER_MAX_LOCK_FRAMES, SHIRASE_MAX_LOCK_FRAMES } from "../lockFrames";
import { getCoolThresholdFrames, getRegretThresholdFrames } from "../sectionConstants";
import { buildMasterSections } from "../sections";
import { GameStateProcessorManager } from "../processors";
import { createGameState, GameType } from "../types";

describe("SectionTimeCalculator.formatTime", () => {
  it("formats frames as MM:SS:ss", () => {
    expect(formatTime(3661)).toBe("01:01:01"); // 1 min 1.0166s
    expect(formatTime(3600)).toBe("01:00:00");
    expect(formatTime(5400)).toBe("01:30:00"); // 90s exactly
    expect(formatTime(60)).toBe("00:01:00");
    expect(formatTime(89)).toBe("00:01:48"); // 1.4833s -> cs = 48
  });

  it("returns empty string for zero/negative", () => {
    expect(formatTime(0)).toBe("");
    expect(formatTime(-5)).toBe("");
  });
});

describe("getSectionRange", () => {
  it("formats Master ranges (section 9 ends at 999)", () => {
    expect(getSectionRange(0)).toBe("000-100");
    expect(getSectionRange(9)).toBe("900-999");
  });

  it("formats Shirase ranges (section 9 ends at 1000)", () => {
    expect(getSectionRange(9, true)).toBe("900-1000");
    expect(getSectionRange(12, true)).toBe("1200-1300");
    expect(getSectionRange(13)).toBe("???");
  });
});

describe("GradeConverter", () => {
  it("maps grade values to names", () => {
    expect(toGradeName(0)).toBe("9");
    expect(toGradeName(8)).toBe("1");
    expect(toGradeName(9)).toBe("S1");
    expect(toGradeName(17)).toBe("S9");
    expect(toGradeName(18)).toBe("m1");
    expect(toGradeName(27)).toBe("M");
    expect(toGradeName(31)).toBe("MM");
    expect(toGradeName(32)).toBe("GM");
    expect(toGradeName(33)).toBe("GM"); // above table
    expect(toGradeName(-1)).toBe("--");
  });
});

describe("InternalGradeConverter", () => {
  it("maps internal grade to display", () => {
    expect(toDisplayGrade(0)).toBe("9");
    expect(toDisplayGrade(15)).toBe("S1");
    expect(toDisplayGrade(18)).toBe("S2");
    expect(toDisplayGrade(30)).toBe("S8");
    expect(toDisplayGrade(31)).toBe("S9");
    expect(toDisplayGrade(50)).toBe("S9"); // default arm
  });
});

describe("SakuraGradeConverter", () => {
  it("maps hi-grade values", () => {
    expect(toSakuraGradeName(1)).toBe("1");
    expect(toSakuraGradeName(20)).toBe("20");
    expect(toSakuraGradeName(21)).toBe("EX1");
    expect(toSakuraGradeName(27)).toBe("EX7");
    expect(toSakuraGradeName(28)).toBe("ALL");
    expect(toSakuraGradeName(0)).toBe("--");
  });

  it("maps 0-based current stage", () => {
    expect(toSakuraCurrentStageName(0)).toBe("1");
    expect(toSakuraCurrentStageName(19)).toBe("20");
    expect(toSakuraCurrentStageName(20)).toBe("EX1");
    expect(toSakuraCurrentStageName(-1)).toBe("1");
  });
});

describe("ShiraseGradeConverter", () => {
  it("maps shirase grades", () => {
    expect(toShiraseGradeName(0)).toBe("--");
    expect(toShiraseGradeName(9)).toBe("S1");
    expect(toShiraseGradeName(20)).toBe("S12");
    expect(toShiraseGradeName(21)).toBe("S13");
    expect(toShiraseGradeName(25)).toBe("S13");
    expect(toShiraseGradeName(5)).toBe("--");
  });
});

describe("DecayTimeMaxCalculator", () => {
  it("returns decay rate by internal grade", () => {
    expect(getMaxDecayTime(0)).toBe(125);
    expect(getMaxDecayTime(1)).toBe(80);
    expect(getMaxDecayTime(12)).toBe(30);
    expect(getMaxDecayTime(30)).toBe(10);
    expect(getMaxDecayTime(31)).toBe(10);
    expect(getMaxDecayTime(99)).toBe(10); // above table -> last
    expect(getMaxDecayTime(-1)).toBe(125); // below table -> first
  });
});

describe("RegretCalculator", () => {
  it("Master regret at threshold boundaries (strictly greater)", () => {
    expect(isRegret(5400, 0)).toBe(false); // exactly 90s
    expect(isRegret(5401, 0)).toBe(true);
    expect(isRegret(3001, 1)).toBe(false); // below 75s threshold
    expect(isRegret(4501, 1)).toBe(true);
    expect(isRegret(4500, 1)).toBe(false);
    expect(isRegret(1, 99)).toBe(false); // beyond table
  });

  it("Shirase regret boundaries", () => {
    expect(isShiraseRegret(3600, 0)).toBe(false); // 60s
    expect(isShiraseRegret(3601, 0)).toBe(true);
    expect(isShiraseRegret(3001, 2)).toBe(true); // 50s
    expect(isShiraseRegret(3000, 2)).toBe(false);
  });
});

describe("SectionConstants thresholds", () => {
  it("cool/regret thresholds in frames", () => {
    expect(getCoolThresholdFrames(0)).toBe(52 * 60);
    expect(getCoolThresholdFrames(9)).toBe(0x7fffffff); // no cool for section 9
    expect(getRegretThresholdFrames(0)).toBe(90 * 60);
    expect(getRegretThresholdFrames(9)).toBe(50 * 60);
  });
});

describe("LockFrameConstants", () => {
  it("master lock frames by speed level", () => {
    expect(getMaxLockFrame(MASTER_MAX_LOCK_FRAMES, 0)).toBe(30);
    expect(getMaxLockFrame(MASTER_MAX_LOCK_FRAMES, 999)).toBe(17); // index 9
    expect(getMaxLockFrame(MASTER_MAX_LOCK_FRAMES, 1299)).toBe(15); // index 12
    expect(getMaxLockFrame(MASTER_MAX_LOCK_FRAMES, 5000)).toBe(15); // beyond -> last
  });

  it("shirase lock frames", () => {
    expect(getMaxLockFrame(SHIRASE_MAX_LOCK_FRAMES, 0)).toBe(18);
    expect(getMaxLockFrame(SHIRASE_MAX_LOCK_FRAMES, 1300)).toBe(15); // index 13
  });
});

describe("formatGradePoints", () => {
  it("formats with smart decimals", () => {
    expect(formatGradePoints(0.12)).toBe("+0.12");
    expect(formatGradePoints(0.1)).toBe("+0.1");
    expect(formatGradePoints(1.0)).toBe("+1");
    expect(formatGradePoints(1.6)).toBe("+1.6");
    expect(formatGradePoints(0.04)).toBe("+0.04");
    expect(formatGradePoints(0)).toBe("+0");
  });
});

describe("GradeHistoryCalculator", () => {
  it("excludes highest, highlights top 3, averages them", () => {
    // oldest first: memory values. reversed (newest first) = [2,7,9,3,5,0,1]
    // valid grades newest-first: i0 g1, i1 g6, i2 g8, i3 g2, i4 g4, i6 g0 (i5 invalid)
    // exclude highest = g8(i2); top3 = g6(i1), g4(i4), g2(i3) -> avg 4 -> name(4) = "5"
    const history = [1, 0, 5, 3, 9, 7, 2];
    const result = calculateGradeHistory(history);
    expect(result.entries.map((e) => e.gradeName)).toEqual(["8", "3", "1", "7", "5", "9"]);
    expect(result.entries.map((e) => e.isHighlighted)).toEqual([false, true, false, true, true, false]);
    expect(result.averageGrade).toBe("5");
  });

  it("realistic Master grades: GM excluded, M/m7/m2 selected", () => {
    // memory values oldest first: [28,0,20,33,15,18,25]
    // reversed: [25,18,15,33,20,0,28] -> grades [24,17,14,32,19,-1,27]
    // names: m7, S9, S6, GM, m2, (invalid), M
    // exclude g32(GM,i3); top3 = g27(i6), g24(i0), g19(i4); avg = floor(70/3)=23 -> "m6"
    const result = calculateGradeHistory([28, 0, 20, 33, 15, 18, 25]);
    expect(result.entries.map((e) => e.gradeName)).toEqual(["m7", "S9", "S6", "GM", "m2", "M"]);
    expect(result.entries.map((e) => e.isHighlighted)).toEqual([true, false, false, false, true, true]);
    expect(result.averageGrade).toBe("m6");
  });

  it("returns No History when empty", () => {
    const result = calculateGradeHistory([0, 0, 0, 0, 0, 0, 0]);
    expect(result.entries).toEqual([{ gradeName: "No History", isHighlighted: false }]);
    expect(result.averageGrade).toBe("N/A");
  });

  it("no average with fewer than 4 valid grades", () => {
    const result = calculateGradeHistory([0, 0, 0, 2, 3, 0, 0]);
    expect(result.averageGrade).toBe("N/A");
  });
});

describe("GameStateProcessorManager", () => {
  it("dispatches by game type and passes common fields through", () => {
    const mgr = new GameStateProcessorManager();
    const raw = createGameState();
    raw.gameType = GameType.None;
    raw.level = 150;
    raw.timeFrames = 3600;
    raw.gameFlag = 0x10; // WORLD
    const out = mgr.process(raw);
    expect(out.controlMode).toBe("WORLD");
    expect(out.section).toBe(1);
    expect(out.formattedTime).toBe("01:00:00");
    expect(out.shiftMoveResetCount).toBe(0);
    expect(out.rotationMoveResetCount).toBe(0);
  });

  it("Master: tracks sections, speed level, deadlines", () => {
    const mgr = new GameStateProcessorManager();
    const raw = createGameState();
    raw.gameType = GameType.Master;

    // reset tick first
    raw.level = 0;
    raw.timeFrames = 0;
    mgr.process(raw);

    // section 0 progress (60s COOL threshold, 90s REGRET)
    raw.level = 50;
    raw.timeFrames = 3000;
    raw.sectionCoolFlag = 1; // COOL earned in section 0
    let out = mgr.process(raw);
    expect(out.totalCools).toBe(1);
    expect(out.speedLevel).toBe(150); // 50 + 1*100
    expect(out.maxLockFrame).toBe(30); // index 1

    // cross into section 1 at 60s
    raw.level = 150;
    raw.timeFrames = 3600;
    raw.sectionCoolFlag = 0;
    out = mgr.process(raw);
    expect(out.sectionTimes[0]).toBe(3600);
    expect(out.regrets[0]).toBe(false); // 60s <= 90s
    expect(out.currentSectionTime).toBe(0);
    expect(out.regretDeadline).toBe(3600 + 75 * 60);
    expect(out.statusCardTitle).toBe("NORMAL\nPLAY");
    expect(out.gradeDisplay).toBe("9"); // combined grade 0
  });

  it("Master: section list carries cumulative times (settings column option)", () => {
    const mgr = new GameStateProcessorManager();
    const raw = createGameState();
    raw.gameType = GameType.Master;

    // reset tick first
    raw.level = 0;
    raw.timeFrames = 0;
    mgr.process(raw);

    // an in-section tick first (crossings need a recorded previous level),
    // then complete section 0 at 60s and play 5s into section 1
    raw.level = 50;
    raw.timeFrames = 3000;
    mgr.process(raw);
    raw.level = 150;
    raw.timeFrames = 3600;
    const out = mgr.process(raw);

    const done = buildMasterSections(out);
    expect(done[0].time).toBe("01:00:00");
    expect(done[0].cumulativeTime).toBe("01:00:00");

    raw.timeFrames = 3900;
    const out2 = mgr.process(raw);
    const live = buildMasterSections(out2);
    expect(live[1].time).toBe("00:05:00");
    expect(live[1].cumulativeTime).toBe("01:05:00");
  });

  it("Master: cool deadline grace (prev cool time + 120)", () => {
    const mgr = new GameStateProcessorManager();
    const raw = createGameState();
    raw.gameType = GameType.Master;

    raw.timeFrames = 0;
    raw.level = 0;
    mgr.process(raw);

    // 70% checkpoint at 2500f in section 0 (cool earned at 2500)
    raw.level = 70;
    raw.timeFrames = 2500;
    raw.seventyPercentCheckpointCount = 1;
    raw.sectionCoolFlag = 1;
    mgr.process(raw);

    // section 1: grace limit = 2500 + 120 = 2620 < 52*60
    raw.level = 110;
    raw.timeFrames = 4000;
    raw.seventyPercentCheckpointCount = 1;
    raw.sectionCoolFlag = 0;
    const out = mgr.process(raw);
    // section 0 completed at 4000
    expect(out.sectionTimes[0]).toBe(4000);
    // cool deadline for section 1 = 4000 + min(52*60, 2500+120)
    expect(out.coolDeadline).toBe(4000 + 2620);
  });

  it("Master: grace uses the PREVIOUS section's 70% time on the crossing tick", () => {
    // Regression: on the tick where this section crosses its own 70%,
    // the deadline must still use the previous section's 70% time — not the
    // just-updated one (which made the award freeze show "+00:02:00").
    const mgr = new GameStateProcessorManager();
    const raw = createGameState();
    raw.gameType = GameType.Master;

    raw.timeFrames = 0;
    raw.level = 0;
    mgr.process(raw);

    // section 0: 70% at 2500 with COOL
    raw.level = 70;
    raw.timeFrames = 2500;
    raw.seventyPercentCheckpointCount = 1;
    raw.sectionCoolFlag = 1;
    mgr.process(raw);

    // section 1 completes at 4500 (this tick); the same tick crosses
    // section 1's 70% (checkpoint count 1 -> 2) with the COOL flag firing
    raw.level = 170;
    raw.timeFrames = 4000 + 500;
    raw.seventyPercentCheckpointCount = 2;
    raw.sectionCoolFlag = 1;
    const out = mgr.process(raw);
    // grace = section 0's 2500 + 120 = 2620 -> deadline = 4500 + 2620
    // (old bug used this tick's own 70% time: 4500 + 120 = 4620)
    expect(out.coolDeadline).toBe(4500 + 2620);
  });

  it("Master: cool deadline stays FIXED through and after the x70 crossing", () => {
    // Regression for the missed-COOL flicker: pre-crossing ticks show a
    // small grace deadline, and neither the crossing tick nor later ticks
    // may re-derive the deadline from THIS section's 70% time.
    const mgr = new GameStateProcessorManager();
    const raw = createGameState();
    raw.gameType = GameType.Master;
    raw.timeFrames = 0;
    raw.level = 0;
    mgr.process(raw);

    // section 0: 70% at 2000 with COOL -> section 1 grace = 2120
    raw.level = 70;
    raw.timeFrames = 2000;
    raw.seventyPercentCheckpointCount = 1;
    raw.sectionCoolFlag = 1;
    mgr.process(raw);

    // enter section 1 at 4000: deadline = 4000 + 2120 = 6120
    raw.level = 110;
    raw.timeFrames = 4000;
    raw.sectionCoolFlag = 0;
    const enter = mgr.process(raw);
    expect(enter.coolDeadline).toBe(6120);

    // x70 crossing of section 1 at 6500 (past the 6120 deadline, missed):
    // deadline must NOT jump to 6500-4000+120 (=6620)
    raw.level = 170;
    raw.timeFrames = 6500;
    raw.seventyPercentCheckpointCount = 2;
    const crossing = mgr.process(raw);
    expect(crossing.coolDeadline).toBe(6120);

    // and a later tick keeps it fixed too
    raw.timeFrames = 7000;
    const after = mgr.process(raw);
    expect(after.coolDeadline).toBe(6120);
  });

  it("Shirase: garbage quota and status cards", () => {
    const mgr = new GameStateProcessorManager();
    const raw = createGameState();
    raw.gameType = GameType.Shirase;
    raw.gameFlag = 0x10; // WORLD

    raw.timeFrames = 0;
    raw.level = 0;
    const reset = mgr.process(raw);
    expect(reset.level500TimeLimitDisplay).toBe(formatTime(183 * 60));

    raw.level = 550;
    raw.timeFrames = 10000;
    const out = mgr.process(raw);
    expect(out.maxGarbageQuota).toBe(20); // section 5
    expect(out.garbageQuotaText).toBe("0/20");
    expect(out.statusCardTitle).toBe("RISING\nGARBAGE");

    raw.level = 1200;
    const out2 = mgr.process(raw);
    expect(out2.statusCardTitle).toBe("MONOCHROME\nBLOCK");
  });

  it("Easy: hanabi score passthrough", () => {
    const mgr = new GameStateProcessorManager();
    const raw = createGameState();
    raw.gameType = GameType.Easy;
    raw.level = 30;
    raw.timeFrames = 1000;
    raw.hanabiScore = 777;
    const out = mgr.process(raw);
    expect(out.hanabiScore).toBe(777);
    expect(out.maxLockFrame).toBe(30);
  });

  it("Sakura: same-tick clear + stage advance attributes the clear to the finished stage", () => {
    const mgr = new GameStateProcessorManager();
    const raw = createGameState();
    raw.gameType = GameType.Sakura;

    // reset tick, then play stage 0 (idx 0)
    raw.timeFrames = 0;
    mgr.process(raw);
    raw.timeFrames = 100;
    raw.sakuraStageLevel = 0;
    raw.sakuraClearedStageLevel = 0;
    raw.sakuraStageLimitTime = 3600;
    raw.sakuraStageElapsedTime = 1800;
    let out = mgr.process(raw);
    expect(out.sakuraStageCleared[0]).toBe(false);

    // next tick: stage 1 AND cleared=1 arrive together (memory race) —
    // the clear belongs to stage 0, and stage 0 must NOT be forfeited
    raw.timeFrames = 1900;
    raw.sakuraStageLevel = 1;
    raw.sakuraClearedStageLevel = 1;
    raw.sakuraStageElapsedTime = 100;
    out = mgr.process(raw);
    expect(out.sakuraStageCleared[0]).toBe(true);
    expect(out.sakuraStageForfeited[0]).toBe(false);
    expect(out.sakuraStageCleared[1]).toBe(false); // the new stage is not "cleared"
  });

  it("Sakura: level-20 clear first observed on an EX-stage tick still latches the tier", () => {
    const mgr = new GameStateProcessorManager();
    const raw = createGameState();
    raw.gameType = GameType.Sakura;

    raw.timeFrames = 0;
    mgr.process(raw);

    // the 20th clear and the EX1 stage transition land on the same tick:
    // cleared=20 first observed with stage index already 20
    raw.timeFrames = 20000;
    raw.sakuraStageLevel = 20;
    raw.sakuraClearedStageLevel = 20;
    raw.sakuraStageLimitTime = 3600;
    raw.sakuraStageElapsedTime = 60;
    const out = mgr.process(raw);
    expect(out.clearedStageStatus).toBe(2); // rainbow latched
    expect(out.exStageTier).toBeGreaterThanOrEqual(5); // 20-clear tier, not stuck at 3
  });

  it("Sakura: jewel count and stage tracking", () => {
    const mgr = new GameStateProcessorManager();
    const raw = createGameState();
    raw.gameType = GameType.Sakura;
    raw.timeFrames = 0;
    mgr.process(raw);

    raw.timeFrames = 500; // leave the reset path
    raw.sakuraStageLevel = 3;
    raw.sakuraStageElapsedTime = 1234;
    raw.playfield[0][0] = 0x12;
    raw.playfield[0][1] = 0x19;
    raw.playfield[1][0] = 0x05; // normal block, not jewel
    const out = mgr.process(raw);
    expect(out.remainingJewelBlocks).toBe(2);
    expect(out.sakuraStageTimes[3]).toBe(1234);
    expect(out.sakuraStageLevelDisplay).toBe("4");
  });
});
