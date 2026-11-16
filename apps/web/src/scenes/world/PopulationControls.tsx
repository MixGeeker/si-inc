import { factions, type FactionId } from "../../../../../packages/rules/v0.1/factions/roster"
import { populationColors } from "../../cartography/population-field"
import { useLanguage } from "../../i18n/useLanguage"
import { useGameStore } from "../GameContext"
import type { PopulationPreview } from "./populationPreview"

export function PopulationLegend() {
  const { ui } = useLanguage()
  return <table className="population-legend" aria-label={ui.populationLayer}>
    <thead><tr><th scope="col">{ui.faction}</th><th scope="col">{ui.ordinaryPopulation}</th><th scope="col">{ui.syntheticPopulation}</th></tr></thead>
    <tbody>{(Object.keys(factions) as FactionId[]).map(id=><tr key={id}>
      <th scope="row">{factions[id].name}</th>
      {populationColors[id].map(color=><td key={color}><i style={{background:color}}/></td>)}
    </tr>)}</tbody>
  </table>
}

export function PopulationControls({ preview }: { preview: PopulationPreview }) {
  const { ui, percent } = useLanguage()
  const store = useGameStore()
  return <aside className="population-controls" aria-label={ui.populationPreview}>
    <header><strong>{ui.populationPreview}</strong>
      <button type="button" aria-label={ui.close} onClick={()=>store.dispatch({type:"close-population-preview"})}>×</button>
    </header>
    {(["peninsulaCoverage", "japanSyntheticShare"] as const).map(field=><label key={field}>
      <span>{ui[field]}</span><output>{percent.format(preview[field]/100)}</output>
      <input type="range" min="0" max="100" step="1" value={preview[field]} aria-label={ui[field]}
        aria-valuetext={percent.format(preview[field]/100)} onChange={e=>store.dispatch({type:"set-preview-population",field,percent:e.currentTarget.valueAsNumber})}/>
    </label>)}
    <PopulationLegend/>
  </aside>
}
