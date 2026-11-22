import { calculateRunRating, totalCenters } from "../../../../../packages/game/operations"
import { standardScenario } from "../../../../../packages/rules/v0.1/scenario"
import { useLanguage } from "../../i18n/useLanguage"
import { SceneDialog } from "../Dialog"
import type { Ending } from "../machine"
import { FactionStandings } from "../world/FactionStandings"
import { formatCompactTokens } from "../world/hudContent"

export function EndingDialog({ scene, restart, leave, inspect }: { scene: Ending; restart: () => void; leave: () => void; inspect?: () => void }) {
  const { outcome, run } = scene
  const { setup } = run
  const { ui, scenario, locale, number, percent } = useLanguage()
  const ending = scenario.endings[outcome]
  const rating = calculateRunRating(run, outcome)
  const fmtTok = (n: number) => `${formatCompactTokens(n, locale, number)} token`
  return <SceneDialog title={ending.title} onBack={leave}>
    <p>{ending.body}</p>
    {outcome === "ai-victory" && <p>{scenario.epilogues[setup.factionId]}</p>}
    {rating && (
      <section className="ending-rating" aria-label={ui.ops.ratingTitle}>
        <strong>{ui.ops.ratingTitle} · {ui.ops.ratingOutOf(rating.stars)}</strong>
        <div className="ending-stars" aria-hidden="true">{"★".repeat(rating.stars)}{"☆".repeat(5 - rating.stars)}</div>
        <small>{ui.ops.ratingBreakdown(rating.speedScore, rating.shareScore, rating.score)}</small>
      </section>
    )}
    <p className="source-note">{standardScenario.factions[setup.factionId].name} · {scenario.regions[setup.startRegionId]} · {scenario.difficulty} · {ui.day(run.completedDay)} · {fmtTok(run.balance)} · {ui.ops.lifetimeTokens(fmtTok(run.lifetimeTokens))}</p>
    <p className="source-note">{ui.ops.summaryAdoption(percent.format((run.adoptionBps ?? 0) / 10000))} · {ui.ops.summarySynthetic(percent.format(run.playerSyntheticBps / 10000))} · {ui.ops.summaryCenters(totalCenters(run))} · {ui.ops.summaryExposure(percent.format(run.exposureBps / 10000))}</p>
    {(outcome === "ai-victory" || outcome === "rival-victory") && <FactionStandings run={run}/>}
    <div className="window-actions"><button onClick={restart}>{ui.restart}</button><button onClick={leave}>{ui.returnMap}</button>
      {inspect && <button type="button" onClick={inspect}>{ui.developer.open}</button>}</div>
  </SceneDialog>
}
