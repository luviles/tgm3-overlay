/**
 * Unified card system — one skeleton shared by all four mode views.
 *
 * Skeleton (top to bottom):
 *   PlayerInfoCard / ModeHeader / [*MasterHistoryCard] / HeroNumerals / KpiRow
 *   BandRow (StatusBand + ChipStrip)
 *   ViewBottom (SectionTimerControl | FieldCard)
 *
 * Modes parameterize the KPI cells, checkpoint chips and session card content.
 */

import { memo, useRef } from "react";
import { GameType, type GradeHistoryEntry, type ProcessedGameState } from "../core/types";
import type { SectionInfo } from "../core/sections";
import { toShiraseGradeName } from "../core/converters";
import { PlayfieldCanvas } from "./PlayfieldCanvas";
import { SectionTimerControl, type SectionTimeColumn } from "./SectionTimerControl";

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export const StatCell = memo(function StatCell({
  label,
  value,
  tone,
  flash,
}: {
  label: string;
  value: string;
  tone?: "gold" | "cyan" | "red";
  /** value increased recently: 3s burst blinking the tone colour with a
   *  tinted white (the unified blink) */
  flash?: boolean;
}) {
  const toneClass =
    tone === "gold"
      ? " cell__value--gold"
      : tone === "cyan"
        ? " cell__value--cyan"
        : tone === "red"
          ? " cell__value--red"
          : "";
  const flashClass = flash
    ? ` blink blink--3s ${tone === "red" ? "blink--hi-red" : tone === "cyan" ? "blink--hi-cyan" : "blink--hi-gold"}`
    : "";
  return (
    <div className="cell">
      <span className="cell__label">{label}</span>
      {/* key includes the value while flashing: a SECOND increment inside the
          3s window changes the value, remounts the span and restarts the
          burst animation (a kept-mounted class would not retrigger) */}
      <span
        key={flash ? `f-${value}` : "v"}
        className={`cell__value${toneClass}${flashClass}`}
      >
        {value}
      </span>
    </div>
  );
});

/** KPI row: 3 stat cells with divider lines. `tall` gives SAKURA/SHIRASE
 *  (the two KPI-bearing compact stacks) an explicit taller row. */
export function KpiRow({ children, tall }: { children: React.ReactNode; tall?: boolean }) {
  return <div className={`kpi${tall ? " kpi--tall" : ""}`}>{children}</div>;
}

/** Thin fill bar (0..1). */
export const ProgressBar = memo(function ProgressBar({
  value,
  tone,
}: {
  value: number;
  tone?: "gold" | "cyan" | "red";
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const cls = tone === "cyan" ? " pbar--cyan" : tone === "red" ? " pbar--red" : "";
  return (
    <div className={`pbar${cls}`}>
      <div className="pbar__fill" style={{ width: `${pct}%` }} />
    </div>
  );
});

// ---------------------------------------------------------------------------
// ModeHeader — arcade title with per-mode identity color
// ---------------------------------------------------------------------------

export const MODE_TITLE_COLORS: Record<string, { main: string; glow: string }> = {
  MASTER: { main: "#B4DCFF", glow: "#3D6BFF" },
  SHIRASE: { main: "#FF808C", glow: "#E8112D" },
  EASY: { main: "#C8FFC8", glow: "#22DD77" },
  SAKURA: { main: "#FFC8FF", glow: "#C44DD8" },
};

export function ModeHeader({
  mode,
  state,
}: {
  mode: string;
  state: ProcessedGameState;
}) {
  const colors = MODE_TITLE_COLORS[mode] ?? { main: "#fff", glow: "#333" };

  return (
    <div className="modehead">
      <div
        className="modehead__title"
        style={{ color: colors.main, textShadow: `0 0 18px ${colors.glow}55` }}
      >
        {mode}
      </div>
      <div className="modehead__control">{state.controlMode}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MasterHistoryCard — career record, MASTER only
// ---------------------------------------------------------------------------

interface CareerSlot {
  filled: boolean;
  gradeName: string;
  highlighted: boolean;
}

/**
 * Rebuilds the 7 physical history slots (oldest→newest, left→right) from the
 * raw newest-first memory array. The calculator's entries list only valid
 * grades in ascending slot order, so filled slots consume entries in order —
 * empty slots keep their position instead of collapsing.
 */
function careerSlots(raw: number[], entries: GradeHistoryEntry[]): CareerSlot[] {
  let ei = 0;

  return Array.from({ length: 7 }, (_, i) => {
    const mem = raw[6 - i]; // slot i (oldest-first) = raw newest-first index 6-i
    if (mem > 0 && ei < entries.length) {
      const e = entries[ei++];
      return { filled: true, gradeName: e.gradeName, highlighted: e.isHighlighted };
    }
    return { filled: false, gradeName: "", highlighted: false };
  });
}

/** Trophy-shelf rendering of the grade history + average + demotion. */
export function MasterHistoryCard({ state }: { state: ProcessedGameState }) {
  // control-mode-selected career data, picked once for slots + verdicts
  const raw =
    state.controlMode === "WORLD"
      ? state.worldMasterGradeHistory
      : state.classicMasterGradeHistory;

  const slots = careerSlots(raw, state.gradeHistoryEntries);
  const recordCount = slots.filter((s) => s.filled).length;

  // AVERAGE GRADE emphasis — the PROMOTION EXAM transition, exactly once:
  // the moment the run's mode flag flips NORMAL PLAY -> PROMOTIONAL EXAM,
  // the value flashes gold for 3s, then rests in static gold for the rest
  // of the run. Everything else stays plain white. Refs init from the
  // current state (mount-safe: attaching mid-exam shows no flash).
  const prevExam = useRef(state.isPromotionExam);
  const promoFlashUntil = useRef(0);
  const promoLatched = useRef(false);

  if (state.timeFrames === 0) {
    promoLatched.current = false; // new run: re-arm the one-shot
  } else if (state.isPromotionExam && !prevExam.current) {
    promoFlashUntil.current = Date.now() + 3000;
    promoLatched.current = true;
  }
  prevExam.current = state.isPromotionExam;

  const promoFlashing = promoLatched.current && Date.now() < promoFlashUntil.current;

  return (
    <div className="career">
      <div className="career__head">
        <span className="career__label">GRADE HISTORY</span>
      </div>

      <div className="career__axis" aria-hidden="true">
        <span>OLD</span>
        <span className="career__axisline" />
        <span>NEW</span>
      </div>

      <div className="career__track">
        {slots.map((slot, i) => (
          <div
            key={i}
            className={[
              "career__badge",
              slot.filled ? "career__badge--filled" : "career__badge--empty",
              slot.highlighted ? "career__badge--hi" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {slot.filled ? slot.gradeName : <i className="career__socket" />}
          </div>
        ))}
      </div>

      <div className="career__meta career__meta--first">
        <span className="career__k">AVERAGE GRADE</span>
        <span className="career__right">
          <span
            className={`career__v career__v--avg${
              promoLatched.current ? " career__v--promo" : ""
            }${promoFlashing ? " blink blink--3s blink--hi-gold" : ""}`}
          >
            {recordCount >= 4 ? state.averageGradeDisplay : "--"}
          </span>
        </span>
      </div>
      <div className="career__meta">
        <span className="career__k">DEMOTION POINTS</span>
        <span className="career__right">
          <span className="career__demobar">
            <span
              className="career__demofill"
              style={{ width: `${Math.min(1, state.selectedDemotionPoints / 30) * 100}%` }}
            />
          </span>
          <span className={`career__v${state.selectedDemotionPoints >= 30 ? " career__v--danger" : ""}`}>
            {state.demotionProgressDisplay}
          </span>
        </span>
      </div>
    </div>
  );
}

/** Waiting screen: occupies the ModeHeader's exact slot so switching into a
 *  game mode swaps content in place without moving anything. */
export function ModeStandby() {
  return (
    <div className="modehead modehead--standby">
      <div className="modehead__title standby__title">STANDBY</div>
      <div className="standby__line">
        waiting for game start<span className="standby__cursor" aria-hidden="true" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hero numerals — LEVEL / TIME
// ---------------------------------------------------------------------------

export function HeroNumerals({
  state,
  compact,
}: {
  state: ProcessedGameState;
  /** fixed compact height for the EASY/SAKURA/SHIRASE stacks */
  compact?: boolean;
}) {
  return (
    <div className={`hero${compact ? " hero--compact" : ""}`}>
      <div className="hero__cell">
        <span className="cell__label">LEVEL</span>
        <span className="hero__value">{state.level}</span>
      </div>
      <div className="hero__divider" />
      <div className="hero__cell">
        <span className="cell__label">TIME</span>
        <span className="hero__value">{state.formattedTime}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatusBand — full-width status (normal / exam / staff roll)
// ---------------------------------------------------------------------------

function StatusBand({
  state,
  titleOverride,
}: {
  state: ProcessedGameState;
  /** torikan freeze: the condition card locks to the state at death */
  titleOverride?: string;
}) {
  // Emphasis matrix:
  // - before the roll: promotional exam = gold, demotional exam = red
  // - during the roll (any run, exams included): FADING = cyan (moderate
  //   success), INVISIBLE = the full gold treatment (complete success)
  const rolling = state.showStaffRollTime;
  const cleared = rolling && state.remainingStaffRollFrames <= 0;

  // the roll clock counts down in white; the CLEAR verdict lands with a 3s
  // gold blink, then rests in static gold. Refs init from the current state
  // (mount-safe — no fabricated blink).
  const prevCleared = useRef(cleared);
  const clearBlinkUntil = useRef(0);
  if (cleared && !prevCleared.current) {
    clearBlinkUntil.current = Date.now() + 3000;
  }
  prevCleared.current = cleared;
  const clearFlashing = cleared && Date.now() < clearBlinkUntil.current;

  const subtitleCls = !rolling
    ? ""
    : cleared
      ? clearFlashing
        ? " statusband__subtitle--clear blink blink-gold blink--3s blink--hi-gold"
        : " statusband__subtitle--clear"
      : "";

  let tint = "";
  if (rolling) {
    // the full gold treatment: Master's INVISIBLE roll, Shirase's BIG
    // BLOCK ROLL and Easy's CREDIT ROLL; Master's FADING roll stays in the
    // moderate cyan
    const goldRoll = state.gameType === GameType.Shirase || state.gameType === GameType.Easy;
    tint = state.isInvisible || goldRoll ? "statusband--promo" : "statusband--fading";
  } else if (state.isDemotionExam) {
    tint = "statusband--demo";
  } else if (state.isPromotionExam) {
    tint = "statusband--promo";
  }

  return (
    <div className={["statusband", tint].filter(Boolean).join(" ")}>
      <div className="statusband__title">{titleOverride ?? state.statusCardTitle}</div>
      {rolling && (
        <div className={`statusband__subtitle${subtitleCls}`}>{state.statusCardSubtitle}</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ChipStrip — two compact chips; the countdown clock values carry the
// information (no live bars, so chip geometry never shifts)
// ---------------------------------------------------------------------------

export interface CheckpointChip {
  label: string;
  value: string;
  tone?: "cyan" | "red";
  /** moment-event burst: 3s energized flash on the value */
  flash?: "cyan" | "red";
  /** persistent red blink (verdict locked until the game ends) */
  blink?: boolean;
}

function ChipStrip({ left, right }: { left: CheckpointChip; right: CheckpointChip }) {
  return (
    <div className="deadlines">
      <CheckpointChipView chip={left} />
      <CheckpointChipView chip={right} />
    </div>
  );
}

function CheckpointChipView({ chip }: { chip: CheckpointChip }) {
  const tone = chip.tone === "cyan" ? " dl--cyan" : chip.tone === "red" ? " dl--red" : "";

  // unified blink: tinted white <-> flash colour, both phases declared by
  // the variant (identical whatever the chip's resting tone); a locked
  // verdict blinks the same way, continuously
  const emphasis = chip.flash
    ? `blink blink--3s blink--hi-${chip.flash}`
    : chip.blink
      ? "blink blink--hi-red"
      : "";

  return (
    <div className={`dl${tone}`}>
      <span className="dl__label">{chip.label}</span>
      {/* keyed by value while flashing so a new burst restarts the animation
          (see StatCell) */}
      <span
        key={chip.flash ? `f-${chip.value}` : "v"}
        className={`dl__value${emphasis ? ` ${emphasis}` : ""}`}
      >
        {chip.value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Session cards — mode insight panels (fill the left column's lower half)
// ---------------------------------------------------------------------------

export function MasterSession({ state }: { state: ProcessedGameState }) {
  // >= 27 (S7): the moment the grade ticks over, a 3s cyan blink — then the
  // value rests in plain cyan for the rest of the run. Refs init from the
  // current state (mount-safe).
  const prevQualified = useRef(state.isInternalGradeQualified);
  const gradeFlashUntil = useRef(0);
  if (state.isInternalGradeQualified && !prevQualified.current) {
    gradeFlashUntil.current = Date.now() + 3000;
  }
  prevQualified.current = state.isInternalGradeQualified;
  const gradeFlashing = state.isInternalGradeQualified && Date.now() < gradeFlashUntil.current;

  return (
    <div className="session">
      <div className="session__row">
        <span className="session__k">Internal Grade</span>
        <span
          className={`session__v${
            state.isInternalGradeQualified ? " session__v--qualified" : ""
          }${gradeFlashing ? " blink blink--3s blink--hi-cyan" : ""}`}
        >
          {state.internalGradeText}
        </span>
      </div>
      <div className="session__row session__row--bar">
        <span className="session__k">Grade Points</span>
        <ProgressBar value={state.awardedGradePointsProgress} tone="gold" />
        <span className="session__v session__v--num">{state.awardedGradePoints}</span>
      </div>
      <div className="session__row session__row--bar">
        <span className="session__k">Point Decay Timer</span>
        <ProgressBar value={state.decayTimeProgress} tone="cyan" />
        <span className="session__v session__v--num">{state.decayTimeRemaining}F</span>
      </div>
      <div className="session__row">
        <span className="session__k">Staff Roll Grade</span>
        <span className="session__v">{state.staffRollGradePointsDisplay}</span>
      </div>
    </div>
  );
}

/**
 * Shirase level-limit ladder ("torikan") — same visual language as the
 * Sakura EX ladder.
 *
 * Two sequential checkpoints, each judged ONCE, the moment its level is
 * FIRST reached (pending before, PASS within the limit / FAIL over it
 * after — a FAIL ends the run):
 * - LEVEL 500 within 03:03 (WORLD) / 02:28 (CLASSIC)
 * - LEVEL 1000 within 06:06 (WORLD) / 04:56 (CLASSIC)
 * Live garbage quota (rising-garbage mode, levels 500-999) rides below.
 * On a torikan death the quota locks OFF — the garbage section was never
 * entered (fail at 500) or already left behind (fail at 1000).
 */
export function ShiraseLadder({
  state,
  torikanFailed,
}: {
  state: ProcessedGameState;
  torikanFailed?: boolean;
}) {
  const tiers = [
    {
      req: `LEVEL 500 BY ${state.level500TimeLimitDisplay}`,
      judged: state.level >= 500,
      failed: state.level500TimeLimitExceeded,
    },
    {
      req: `LEVEL 1000 BY ${state.level1000TimeLimitDisplay}`,
      judged: state.level >= 1000,
      failed: state.level1000TimeLimitExceeded,
    },
  ];

  // Garbage quota (rising-garbage mode, levels 500-999): always rendered at
  // a fixed layout — inactive levels show an empty bar and "--" so nothing
  // shifts when the range is entered or left.
  const quotaActive = !torikanFailed && state.maxGarbageQuota > 0;

  return (
    <div className="ladder">
      <div className="ladder__head">
        <span className="ladder__label">TIME REQUIREMENTS</span>
      </div>
      <div className="ladder__rows">
        {tiers.map((t) => (
          <div
            key={t.req}
            className={[
              "ladder__row",
              t.judged && !t.failed ? " ladder__row--on" : "",
              t.judged && t.failed ? " ladder__row--fail" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <i className="ladder__node" aria-hidden="true" />
            <span className="ladder__req">{t.req}</span>
            <span
              className={`ladder__reward${
                t.judged ? (t.failed ? " ladder__reward--fail" : " ladder__reward--pass") : ""
              }`}
            >
              {t.judged ? (t.failed ? "FAIL" : "PASS") : "--"}
            </span>
          </div>
        ))}
      </div>

      <div className="ladder__head ladder__head--gap">
        <span className="ladder__label">GARBAGE QUOTA</span>
      </div>
      <div className="ladder__gauge">
        <ProgressBar
          value={quotaActive ? state.garbageQuota / state.maxGarbageQuota : 0}
          tone="red"
        />
        <span className="ladder__v ladder__v--num">
          {quotaActive ? state.garbageQuotaText : "OFF"}
        </span>
      </div>
    </div>
  );
}

/**
 * Sakura EX-stage unlock ladder.
 *
 * Game rules (three sequential unlocks):
 * - 19+ of the 20 regular stages cleared (skip = 1-min stage limit exceeded)
 *   -> EX1-3
 * - all 20 cleared without skips, total time over 5:00 -> EX1-5
 * - all 20 cleared within 5:00 -> EX1-7 (final stages)
 *
 * The tiers are EXCLUSIVE — the run earns exactly one of EX1-3 / EX1-5 /
 * EX1-7 — so only the highest satisfied tier stays lit; when a higher tier
 * unlocks, the lower rows switch off instantly. The moment a tier unlocks,
 * its row celebrates with the 3s gold blink, then rests in static gold.
 */
export function SakuraExLadder({ state }: { state: ProcessedGameState }) {
  // exclusive tier from the processor's latch (3 / 5 / 7)
  const tier = state.exStageTier === 7 ? 3 : state.exStageTier === 5 ? 2 : state.exStageTier === 3 ? 1 : 0;

  // 3s gold celebration at the moment the tier rises. Refs init from the
  // current tier so mounting mid-run does not fabricate a flash.
  const prevTier = useRef(tier);
  const flashUntil = useRef(0);
  if (tier > prevTier.current) {
    flashUntil.current = Date.now() + 3000;
  }
  prevTier.current = tier;
  const flashing = tier > 0 && Date.now() < flashUntil.current;

  const tiers = [
    { req: "19+ STAGES CLEAR", reward: "EX 1-3" },
    { req: "ALL 20 STAGES CLEAR", reward: "EX 1-5" },
    { req: "ALL 20 STAGES CLEAR WITHIN 5:00", reward: "EX 1-7" },
  ];

  return (
    <div className="ladder ladder--gold">
      <div className="ladder__head">
        <span className="ladder__label">EXTRA STAGE REQUIREMENTS</span>
      </div>
      <div className="ladder__rows">
        {tiers.map((t, i) => {
          const lit = tier === i + 1; // the highest satisfied tier only
          return (
            <div key={t.reward} className={`ladder__row${lit ? " ladder__row--on" : ""}`}>
              <i
                className={`ladder__node${lit && flashing ? " ladder__node--blink" : ""}`}
                aria-hidden="true"
              />
              <span className="ladder__req">{t.req}</span>
              <span
                className={`ladder__reward${
                  lit && flashing
                    ? " blink blink-gold blink--3s blink--hi-gold"
                    : ""
                }`}
              >
                {t.reward}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Easy HANABI showcase — the mode's score-specialized panel (Easy has no
 * KPI row). The live score appears exactly ONCE as the giant numeral; the
 * gauge shows progress toward the profile best without repeating numbers;
 * the bottom line carries the record and the NEW BEST verdict.
 */
export function EasyScore({ state }: { state: ProcessedGameState }) {
  const best = state.controlMode === "WORLD" ? state.worldEasyHiScore : state.classicEasyHiScore;
  const hasBest = best > 0;
  const leading = hasBest && state.hanabiScore > best;
  const progress = hasBest ? Math.min(1, state.hanabiScore / best) : 0;

  // the moment the score passes the profile best: NEW BEST lands with a 3s
  // gold blink, then rests in static gold. Refs init from the current state
  // (mount-safe — no fabricated blink).
  const prevLeading = useRef(leading);
  const flashUntil = useRef(0);
  if (leading && !prevLeading.current) {
    flashUntil.current = Date.now() + 3000;
  }
  prevLeading.current = leading;
  const flashing = leading && Date.now() < flashUntil.current;

  return (
    <div className="hshow">
      <div className="ladder__head">
        <span className="ladder__label">HANABI</span>
      </div>

      <div className="hshow__score">{state.hanabiScore}</div>

      <div className="hshow__gauge">
        <ProgressBar value={progress} tone="gold" />
      </div>

      <div className="hshow__meta">
        <span className="hshow__k">PROFILE BEST</span>
        <span
          className={`hshow__best${leading ? " hshow__best--lead" : ""}${
            flashing ? " blink blink--3s blink--hi-gold" : ""
          }`}
        >
          {leading ? "NEW BEST" : hasBest ? `H${best}` : "--"}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FieldCard — playfield + control limits (lock delay, move resets) as ONE card
// ---------------------------------------------------------------------------

const Pips = memo(function Pips({
  count,
  max,
  tone,
}: {
  count: number;
  max: number;
  tone: "cyan" | "red";
}) {
  return (
    <span className={`pips pips--${tone}`}>
      {Array.from({ length: max }, (_, i) => (
        <i key={i} className={i < count ? "on" : ""} />
      ))}
    </span>
  );
});

function FieldCard({
  state,
  hidePlayfield,
}: {
  state: ProcessedGameState;
  /** Master roll practice: blank the field (card geometry unchanged) */
  hidePlayfield?: boolean;
}) {
  const isWorld = state.controlMode === "WORLD";

  // Instant-lock penalty: the moment a move-reset count reaches its limit
  // (SHIFT 10 / ROTATE 8), flash that label red for 250ms. Refs init from
  // the current counts so mounting already-over-limit does not flash.
  const prevShift = useRef(state.shiftMoveResetCount);
  const prevRotate = useRef(state.rotationMoveResetCount);
  const shiftFlashUntil = useRef(0);
  const rotateFlashUntil = useRef(0);

  if (isWorld && state.shiftMoveResetCount >= 10 && prevShift.current < 10) {
    shiftFlashUntil.current = Date.now() + 250;
  }
  if (isWorld && state.rotationMoveResetCount >= 8 && prevRotate.current < 8) {
    rotateFlashUntil.current = Date.now() + 250;
  }
  prevShift.current = state.shiftMoveResetCount;
  prevRotate.current = state.rotationMoveResetCount;

  const shiftFlashing = Date.now() < shiftFlashUntil.current;
  const rotateFlashing = Date.now() < rotateFlashUntil.current;

  return (
    <div className="fieldcard">
      <div className="field-area">
        <PlayfieldCanvas
          playfield={state.playfield}
          controlMode={state.controlMode}
          hidden={hidePlayfield}
        />
        {hidePlayfield && (
          <div className="field-hidden">
            <svg className="field-hidden__icon" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M1 1 L23 23"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
            <div className="field-hidden__title">PLAYFIELD HIDDEN</div>
            <div className="field-hidden__sub">
              The playfield stays hidden during this credit roll.
              <br />
              You can change this in Settings.
            </div>
          </div>
        )}
      </div>
      <div className="fieldcard__controls">
        <div className="fctl__row">
          <span className="fctl__k">LOCK</span>
          <span className="fctl__v">
            {state.maxLockFrame > 0 ? `${state.lockDelay}/${state.maxLockFrame}F` : "N/A"}
          </span>
          <ProgressBar
            value={state.maxLockFrame > 0 ? state.lockDelay / state.maxLockFrame : 0}
            tone="gold"
          />
        </div>
        <div
          className={`fctl__row fctl__row--pips${isWorld ? "" : " fctl__row--locked"}`}
        >
          <span className="fctl__group">
            <span className={`fctl__k${shiftFlashing ? " fctl__k--flash" : ""}`}>SHIFT</span>
            <Pips count={isWorld ? state.shiftMoveResetCount : 0} max={10} tone="cyan" />
          </span>
          <span className="fctl__group">
            <Pips count={isWorld ? state.rotationMoveResetCount : 0} max={8} tone="red" />
            <span className={`fctl__k${rotateFlashing ? " fctl__k--flash" : ""}`}>ROTATE</span>
          </span>
          {!isWorld && <span className="fctl__lock">WORLD RULE</span>}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Shared view layout blocks (identical in all four modes)
// ---------------------------------------------------------------------------

/** Status band + checkpoint chips row. */
export function BandRow({
  state,
  left,
  right,
  statusTitle,
}: {
  state: ProcessedGameState;
  left: CheckpointChip;
  right: CheckpointChip;
  /** torikan freeze: locks the condition card to the state at death */
  statusTitle?: string;
}) {
  return (
    <div className="band-row">
      <StatusBand state={state} titleOverride={statusTitle} />
      <ChipStrip left={left} right={right} />
    </div>
  );
}

/** Bottom split: section-time list | playfield card. `hidePlayfield` blanks
 *  the field (Master roll practice) while keeping the card geometry. */
export function ViewBottom({
  sections,
  columns,
  sectionWord,
  state,
  hidePlayfield,
  colourByPosition,
}: {
  sections: SectionInfo[];
  columns: [SectionTimeColumn, SectionTimeColumn];
  sectionWord?: string;
  state: ProcessedGameState;
  hidePlayfield?: boolean;
  colourByPosition?: boolean;
}) {
  return (
    <div className="view-bottom">
      <div className="view-bottom__left">
        <div className="listcard">
          <SectionTimerControl
            sections={sections}
            columns={columns}
            sectionWord={sectionWord}
            colourByPosition={colourByPosition}
          />
        </div>
      </div>
      <div className="view-bottom__right">
        <FieldCard state={state} hidePlayfield={hidePlayfield} />
      </div>
    </div>
  );
}

// Mode KPI value helpers
// ---------------------------------------------------------------------------

/** Shirase grade uses the Shirase converter on the combined grade. */
export function shiraseGrade(state: ProcessedGameState): string {
  return toShiraseGradeName(state.combinedGrade);
}
