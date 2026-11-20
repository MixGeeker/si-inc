import { useState } from "react"
import { isFactionId, isRegionId, standardScenario } from "../../../../../packages/rules/v0.1/scenario"
import { regionIds } from "../../../../../packages/rules/v0.1/world/regions"
import { useLanguage } from "../../i18n/useLanguage"
import type { RunSelection } from "../machine"
import { SceneDialog } from "../Dialog"
import { factionLogos } from "./factionAssets"
import "./front-scenes.css"

export function SetupDialog({ previous, next, back }: { previous?: RunSelection; next: (selection: RunSelection) => void; back: () => void }) {
  const { ui, scenario } = useLanguage()
  const text = ui.front
  const [factionId, setFaction] = useState<RunSelection["factionId"]>(previous?.factionId ?? "gpt")
  const [startRegionId, setRegion] = useState<RunSelection["startRegionId"]>(previous?.startRegionId ?? "eu")
  return <SceneDialog title={text.selectionTitle} className="front-dialog front-setup-dialog" onBack={back}
    headerDetail={<span className="front-step">{text.stepSelection}</span>}>
    <form className="front-setup" onSubmit={e => {
      e.preventDefault()
      if (isFactionId(factionId) && isRegionId(startRegionId)) next({ factionId, startRegionId })
    }}>
      <p className="front-intro">{text.selectionIntro}</p>
      <fieldset className="front-choice-group"><legend><span className="front-section-index" aria-hidden="true">01</span>{text.factionLabel}</legend>
        <div className="front-faction-grid">{standardScenario.rules.factionIds.filter(isFactionId).map(id => {
          const faction = scenario.factions[id]
          return <label className={`front-choice front-faction ${factionId === id ? "is-selected" : ""}`} key={id}>
            <input className="front-radio" type="radio" name="faction" value={id} checked={factionId === id} onChange={() => setFaction(id)}/>
            <span className="front-card-body">
              <span className="front-card-top"><span className={`front-faction-emblem is-${id}`}><img src={factionLogos[id]} alt="" width="56" height="56"/></span>
                <span className="front-choice-mark" aria-hidden="true">{factionId === id ? "✓" : "+"}</span></span>
              <strong className="front-faction-name">{standardScenario.factions[id].name}</strong>
              <span className="front-faction-strength">{faction.strength}</span>
              <span className="front-faction-risk">{faction.risk}</span>
            </span>
          </label>
        })}</div>
      </fieldset>
      <fieldset className="front-choice-group"><legend><span className="front-section-index" aria-hidden="true">02</span>{text.originLabel}</legend>
        <p className="front-choice-hint">{text.originHint}</p>
        <div className="front-origin-grid">{regionIds.map((id, index) => <label className={`front-choice front-origin ${startRegionId === id ? "is-selected" : ""}`} key={id}>
          <input className="front-radio" type="radio" name="origin" value={id} checked={startRegionId === id} onChange={() => setRegion(id)}/>
          <span className="front-card-body"><span className="front-origin-code" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            <strong>{scenario.regions[id]}</strong><span className="front-choice-mark" aria-hidden="true">{startRegionId === id ? "✓" : "+"}</span></span>
        </label>)}</div>
      </fieldset>
      <div className="front-footer"><button type="button" className="front-tertiary" onClick={back}>← {text.back}</button>
        <p className="front-selection-summary">{standardScenario.factions[factionId].name}<span aria-hidden="true">/</span>{scenario.regions[startRegionId]}</p>
        <button type="submit" className="front-primary">{text.next}<span className="front-arrow" aria-hidden="true">→</span></button>
      </div>
    </form>
  </SceneDialog>
}
