import { factions, type FactionId } from "../../../../../packages/rules/v0.1/factions/roster"
import { populationColors } from "../../cartography/country-field"
import { useLanguage } from "../../i18n/useLanguage"
import { useGameStore } from "../GameContext"
import type { PopulationPreview } from "./populationPreview"

const legendAccents: Record<FactionId, readonly [string, string]> = {
  gpt: ["#63ffb0", "#24e882"],
  claude: ["#ffb921", "#ff8017"],
  grok: ["#d585ff", "#ad54ff"],
}

function LegendSwatch({ faction, color, synthetic }: { faction: FactionId; color: string; synthetic: boolean }) {
  const [brightDot, deepDot] = legendAccents[faction]
  return <svg className="legend-glyph" viewBox="-8 -8 16 16" aria-hidden="true">
    <rect x="-6.4" y="-6.4" width="12.8" height="12.8" rx="3.2" fill={color}/>
    <circle cx={synthetic ? -1.8 : 0} cy={synthetic ? -1.4 : 0} r={synthetic ? 2.6 : 2.5} fill={brightDot}/>
    {synthetic && <circle cx="2.5" cy="2.4" r="1.9" fill={deepDot}/>}
  </svg>
}

export function PopulationLegend() {
  const { ui } = useLanguage()
  return <table className="population-legend" aria-label={ui.populationLayer}>
    <thead><tr><th scope="col">{ui.faction}</th><th scope="col">{ui.ordinaryPopulation}</th><th scope="col">{ui.syntheticPopulation}</th></tr></thead>
    <tbody>{(Object.keys(factions) as FactionId[]).map(id=><tr key={id}>
      <th scope="row">{factions[id].name}</th>
      {populationColors[id].map((color, idx)=><td key={color}>
        <LegendSwatch faction={id} color={color} synthetic={idx === 1}/>
      </td>)}
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
