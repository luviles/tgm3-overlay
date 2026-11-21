/**
 * Section timer list.
 *
 * Two configurable time columns (Master chooses via settings):
 * - Section Time: bold, status-coloured (red on Regret rows, cyan on Cool rows)
 * - 70% Time: cyan while that section's COOL is earned
 * - Cumulative Time: plain
 *
 * Colour rules (`colourByPosition`, used by Master so every arrangement
 * behaves the same) — the FIRST time column carries the verdicts:
 * - cyan the moment the section's COOL is earned (x70 judgment — does not
 *   wait for the section to clear)
 * - REGRET without a COOL: the whole value red
 * - COOL + REGRET: they cancel out (grade +1 − 1 = 0) — plain white
 * The second time column is always plain.
 * Other modes colour the SECTION TIME column red on Regret (classic rule).
 *
 * Headers render on two lines ("Section" / "Time").
 */

import { SectionStatus, type SectionInfo } from "../core/sections";

export type SectionTimeColumn = "section" | "seventy" | "cumulative";

interface ColumnDef {
  head: [string, string];
  cls: string;
  text: (s: SectionInfo) => string;
}

function columnDef(kind: SectionTimeColumn, sectionWord: string): ColumnDef {
  switch (kind) {
    case "section":
      return { head: [sectionWord, "Time"], cls: "sectimer__time", text: (s) => s.time };
    case "seventy":
      return {
        head: ["70%", "Time"],
        cls: "sectimer__sub",
        text: (s) => s.seventyPercentTime,
      };
    case "cumulative":
      return {
        head: ["Cumulative", "Time"],
        cls: "sectimer__sub",
        text: (s) => s.cumulativeTime,
      };
  }
}

/** Two-line header cell. */
function Head({ lines }: { lines: [string, string] }) {
  return (
    <span className="sectimer__head">
      <span>{lines[0]}</span>
      <span>{lines[1]}</span>
    </span>
  );
}

export function SectionTimerControl({
  sections,
  columns,
  sectionWord = "Section",
  colourByPosition = false,
}: {
  sections: SectionInfo[];
  columns: [SectionTimeColumn, SectionTimeColumn];
  sectionWord?: string;
  /** Master: COOL cyan on the 1st time column (immediate), REGRET red on
   *  the 2nd — regardless of which times those columns show */
  colourByPosition?: boolean;
}) {
  const defs = columns.map((c) => columnDef(c, sectionWord));

  return (
    <div className={`sectimer${colourByPosition ? " sectimer--verdict" : ""}`}>
      <div className="sectimer__header">
        <span>{sectionWord}</span>
        <Head lines={defs[0].head} />
        <Head lines={defs[1].head} />
      </div>
      <div className="sectimer__rows">
        {sections.map((s, i) => (
          <div
            key={i}
            className={`sectimer__row sectimer__row--${
              s.status === SectionStatus.Regret
                ? "regret"
                : s.status === SectionStatus.Cool
                  ? "cool"
                  : s.status === SectionStatus.None
                    ? "none"
                    : "normal"
            }`}
          >
            <span className="sectimer__range">{s.range}</span>
            {defs.map((d, ci) => {
              const regret = s.status === SectionStatus.Regret;
              const verdictCol = colourByPosition && ci === 0;
              // COOL + REGRET cancel out (grade +1 − 1 = 0): the lap rests
              // in plain white — no class
              const solid = verdictCol
                ? s.isCool && !regret
                  ? "cool"
                  : regret && !s.isCool
                    ? "regret"
                    : ""
                : "";
              return (
                <span key={ci} className={`${d.cls}${solid ? ` sectimer__col--${solid}` : ""}`}>
                  {d.text(s)}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
