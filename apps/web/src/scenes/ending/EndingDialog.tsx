import { endings, victoryEpilogues } from "../../../../../packages/rules/v0.1/endings/standard"
import { standardScenario } from "../../../../../packages/rules/v0.1/scenario"
import type { Ending } from "../machine"
import { SceneDialog } from "../Dialog"

export function EndingDialog({ scene, restart, leave }: { scene: Ending; restart: () => void; leave: () => void }) {
  const { outcome, run } = scene
  const { setup } = run
  const { factions, regions } = standardScenario
  const ending = outcome === "withdrawn" ? { title: "已结束本局", body: "本局由玩家主动结束。" } : endings[outcome]
  return <SceneDialog title={ending.title} onBack={leave}>
    <p>{ending.body}</p>
    {outcome === "ai-victory" && <p>{victoryEpilogues[setup.factionId]}</p>}
    <p className="source-note">{factions[setup.factionId].name} · {regions[setup.startRegionId].name} · {standardScenario.difficulty.name} · 第 {run.completedWeek} 周 · {run.balance} Btoken</p>
    <div className="window-actions"><button onClick={restart}>再开一局</button><button onClick={leave}>返回地图预览</button></div>
  </SceneDialog>
}
