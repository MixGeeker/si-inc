import { factions, type FactionId } from "../../../../../packages/rules/v0.1/factions/roster"
import { populationColors } from "../../cartography/population-field"
import { useGameStore } from "../GameContext"
import type { PopulationPreview } from "./populationPreview"

const fields = [
  { field: "peninsulaCoverage", label: "朝鲜半岛覆盖率" },
  { field: "japanSyntheticShare", label: "日本合成人占总人口" },
] as const

export function PopulationLegend() {
  return <table className="population-legend" aria-label="人口分布">
    <thead><tr><th scope="col">AI 阵营</th><th scope="col">普通沉浸</th><th scope="col">现役合成人</th></tr></thead>
    <tbody>{(Object.keys(factions) as FactionId[]).map(id=><tr key={id}>
      <th scope="row">{factions[id].name}</th>
      {populationColors[id].map(color=><td key={color}><i style={{background:color}}/></td>)}
    </tr>)}</tbody>
  </table>
}

export function PopulationControls({ preview }: { preview: PopulationPreview }) {
  const store = useGameStore()
  return <aside className="population-controls" aria-label="东亚人口分布示例">
    <header><strong>东亚人口分布示例</strong>
      <button type="button" aria-label="关闭" onClick={()=>store.dispatch({type:"close-population-preview"})}>×</button>
    </header>
    {fields.map(({field,label})=><label key={field}>
      <span>{label}</span><output>{preview[field]}%</output>
      <input type="range" min="0" max="100" step="1" value={preview[field]} aria-label={label}
        aria-valuetext={preview[field] + "%"} onChange={e=>store.dispatch({type:"set-preview-population",field,percent:e.currentTarget.valueAsNumber})}/>
    </label>)}
    <PopulationLegend/>
  </aside>
}
