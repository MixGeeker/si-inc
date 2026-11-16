import { useLanguage } from "../../i18n/useLanguage"
import { standardScenario } from "../../../../../packages/rules/v0.1/scenario"
import type { Ending } from "../machine"
import { SceneDialog } from "../Dialog"

export function EndingDialog({ scene, restart, leave }: { scene: Ending; restart: () => void; leave: () => void }) {
  const { outcome, run } = scene
  const { setup } = run
  const { ui, scenario } = useLanguage()
  const ending = scenario.endings[outcome]
  return <SceneDialog title={ending.title} onBack={leave}>
    <p>{ending.body}</p>
    {outcome === "ai-victory" && <p>{scenario.epilogues[setup.factionId]}</p>}
    <p className="source-note">{standardScenario.factions[setup.factionId].name} · {scenario.regions[setup.startRegionId]} · {scenario.difficulty} · {ui.week(run.completedWeek)} · {ui.tokens(run.balance)}</p>
    <div className="window-actions"><button onClick={restart}>{ui.restart}</button><button onClick={leave}>{ui.returnMap}</button></div>
  </SceneDialog>
}
