/**
 * Showcase scenario sanity: every streamed state must be a coherent
 * ProcessedGameState — the views and their latch hooks assume the same
 * invariants the real processors produce.
 */

import { describe, expect, it } from "vitest";
import { RESET_FRAMES, SCENARIOS, stateAt } from "./scenarios";
import { GameType } from "../core/types";

describe("showcase scenarios", () => {
  it("catalog is non-empty with unique ids and valid lengths", () => {
    expect(SCENARIOS.length).toBeGreaterThan(0);
    const ids = SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of SCENARIOS) {
      expect(s.frames).toBeGreaterThan(RESET_FRAMES);
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.note.length).toBeGreaterThan(0);
    }
  });

  for (const sc of SCENARIOS) {
    it(`${sc.id}: streamed states stay coherent`, () => {
      for (let f = 0; f < sc.frames; f += 37) {
        const s = stateAt(sc, f);
        expect(s.gameType).not.toBe(GameType.None);
        expect(s.gameProcessStatus).toBe(3);
        expect(s.playfield).toHaveLength(22);
        expect(s.playfield[0]).toHaveLength(10);
        expect(s.timeFrames).toBeGreaterThanOrEqual(0);
        if (s.timeFrames > 0) {
          expect(s.section).toBe(Math.floor(s.level / 100));
          expect(s.formattedTime).not.toBe("00:00:00");
          expect(s.currentSectionTime).toBeGreaterThanOrEqual(0);
        }
      }
    });

    it(`${sc.id}: reset window re-arms the latches`, () => {
      expect(stateAt(sc, sc.frames - 1).timeFrames).toBe(0);
      expect(stateAt(sc, sc.frames - RESET_FRAMES).timeFrames).toBe(0);
      expect(stateAt(sc, sc.frames - RESET_FRAMES - 1).timeFrames).toBeGreaterThan(0);
    });

    it(`${sc.id}: negative frames (driver start) emit the fresh state`, () => {
      expect(stateAt(sc, -1).timeFrames).toBe(0);
      expect(stateAt(sc, -RESET_FRAMES).timeFrames).toBe(0);
    });
  }
});
