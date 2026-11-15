import { useState } from "react"
import { isFactionId, isRegionId, standardScenario } from "../../../../../packages/rules/v0.1/scenario"
import type { RunSetup } from "../machine"
import { SceneDialog } from "../Dialog"

export function SetupDialog({ previous, start, back }: { previous?: RunSetup; start: (setup: RunSetup) => void; back: () => void }) {
  const { difficulty, factions, regions, rules } = standardScenario
  const [factionId, setFaction] = useState<string>(previous?.factionId ?? "")
  const [startRegionId, setRegion] = useState<string>(previous?.startRegionId ?? "")
  const faction = isFactionId(factionId) ? factions[factionId] : null
  return <SceneDialog title="新建对局" onBack={back}>
    <form className="setup-form" onSubmit={e => {
      e.preventDefault()
      if (isFactionId(factionId) && isRegionId(startRegionId)) start({ factionId, startRegionId, difficultyId: difficulty.id })
    }}>
      <label>AI 阵营<select required value={factionId} onChange={e => setFaction(e.target.value)}>
        <option value="">选择阵营</option>{Object.entries(factions).map(([id, f]) => <option key={id} value={id}>{f.name}</option>)}
      </select></label>
      {faction && <p className="source-note">{faction.strength}。{faction.risk}。专属能力为「{faction.ability.name}」。</p>}
      <label>起始市场<select required value={startRegionId} onChange={e => setRegion(e.target.value)}>
        <option value="">选择市场</option>{Object.entries(regions).map(([id, r]) => <option key={id} value={id}>{r.name}</option>)}
      </select></label>
      <p>{difficulty.name}难度 · {rules.initialBtoken} token · {rules.maxWeeks} 周上限</p>
      <div className="window-actions"><button type="submit" disabled={!faction || !isRegionId(startRegionId)}>进入地图</button></div>
    </form>
  </SceneDialog>
}
