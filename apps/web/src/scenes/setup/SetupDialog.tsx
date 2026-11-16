import { useState } from "react"
import { isFactionId, isRegionId, standardScenario } from "../../../../../packages/rules/v0.1/scenario"
import { regionIds } from "../../../../../packages/rules/v0.1/world/regions"
import { useLanguage } from "../../i18n/useLanguage"
import type { RunSetup } from "../machine"
import { SceneDialog } from "../Dialog"

export function SetupDialog({ previous, start, back }: { previous?: RunSetup; start: (setup: RunSetup) => void; back: () => void }) {
  const { ui, scenario } = useLanguage()
  const { difficulty, factions, rules } = standardScenario
  const [factionId, setFaction] = useState<string>(previous?.factionId ?? "")
  const [startRegionId, setRegion] = useState<string>(previous?.startRegionId ?? "")
  const faction = isFactionId(factionId) ? scenario.factions[factionId] : null
  return <SceneDialog title={ui.newRun} onBack={back}>
    <form className="setup-form" onSubmit={e => {
      e.preventDefault()
      if (isFactionId(factionId) && isRegionId(startRegionId)) start({ factionId, startRegionId, difficultyId: difficulty.id })
    }}>
      <label>{ui.faction}<select required value={factionId} onChange={e => setFaction(e.target.value)}>
        <option value="">{ui.chooseFaction}</option>{Object.entries(factions).map(([id, f]) => <option key={id} value={id}>{f.name}</option>)}
      </select></label>
      {faction && <p className="source-note">{ui.factionProfile(faction.strength, faction.risk, faction.ability.name)}</p>}
      <label>{ui.startMarket}<select required value={startRegionId} onChange={e => setRegion(e.target.value)}>
        <option value="">{ui.selectContinent}</option>{regionIds.map(id => <option key={id} value={id}>{scenario.regions[id]}</option>)}
      </select></label>
      <p>{ui.setupSummary(scenario.difficulty, ui.tokens(rules.initialBtoken), rules.maxWeeks)}</p>
      <div className="window-actions"><button type="submit" disabled={!faction || !isRegionId(startRegionId)}>{ui.enterMap}</button></div>
    </form>
  </SceneDialog>
}
