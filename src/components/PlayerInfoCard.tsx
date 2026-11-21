/**
 * Login user info strip — ported from Controls/Common/PlayerInfoCard.xaml.
 *
 * Sits at the top of every mode view in the original (Grid.Row="0", height 55):
 *   [CLASSIC hi-scores]  [Nickname + Decoration Points]  [WORLD hi-scores]
 * When not logged in, only the center column shows ("TGM3 Overlay").
 *
 * Binding rules ported from ViewModelHelper.ApplyCommonPlayerInfo:
 *   Easy     -> "H{score}"
 *   Master   -> GradeConverter.toGradeName(currentGrade)
 *   Sakura   -> toSakuraGradeName(hiGrade)
 *   Shirase  -> toShiraseGradeName(hiGrade)
 *   Deco pts -> thousands-separated (N0)
 */

import { toGradeName, toSakuraGradeName, toShiraseGradeName } from "../core/converters";
import type { ProcessedGameState } from "../core/types";

function HiScoreColumn({ label, value }: { label: string; value: string }) {
  return (
    <div className="pis__col">
      <span className="pis__col-label">{label}</span>
      <span className="pis__col-value">{value}</span>
    </div>
  );
}

function ControlModeBlock({
  title,
  easy,
  master,
  sakura,
  shirase,
}: {
  title: string;
  easy: string;
  master: string;
  sakura: string;
  shirase: string;
}) {
  return (
    <div className="pis__side">
      <div className="pis__side-header">{title}</div>
      <div className="pis__side-cols">
        <HiScoreColumn label="EASY" value={easy} />
        <HiScoreColumn label="MASTER" value={master} />
        <HiScoreColumn label="SAKURA" value={sakura} />
        <HiScoreColumn label="SHIRASE" value={shirase} />
      </div>
    </div>
  );
}

export function PlayerInfoCard({ state }: { state: ProcessedGameState }) {
  const visibleNickname = state.nickname.trim().length > 0 ? state.nickname : "TGM3 Overlay";

  return (
    <div className="pis">
      {state.isLoggedIn && (
        <ControlModeBlock
          title="CLASSIC"
          easy={`H${state.classicEasyHiScore}`}
          master={toGradeName(state.classicMasterCurrentGrade)}
          sakura={toSakuraGradeName(state.classicSakuraHiGrade)}
          shirase={toShiraseGradeName(state.classicShiraseHiGrade)}
        />
      )}

      <div className="pis__center">
        {/* Per-character slots: each character (including spaces) occupies a
            fixed 1ch cell, so "AC" and "AC " compose differently while every
            nickname centers on its full string */}
        <div className="pis__nickname" aria-label={visibleNickname}>
          {Array.from(visibleNickname).map((ch, i) => (
            <span key={i} className="pis__nickchar">
              {ch}
            </span>
          ))}
        </div>
        {state.isLoggedIn && (
          <div className="pis__deco">{state.decorationPoints.toLocaleString("en-US")}</div>
        )}
      </div>

      {state.isLoggedIn && (
        <ControlModeBlock
          title="WORLD"
          easy={`H${state.worldEasyHiScore}`}
          master={toGradeName(state.worldMasterCurrentGrade)}
          sakura={toSakuraGradeName(state.worldSakuraHiGrade)}
          shirase={toShiraseGradeName(state.worldShiraseHiGrade)}
        />
      )}
    </div>
  );
}
