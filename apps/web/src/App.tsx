import { Component, lazy, Suspense, useState, type CSSProperties, type ReactNode } from "react"
import { layers, layerKeys, regionIds, regions, snapshot, type Layer, type RegionId } from "./world/snapshot"

const Globe = lazy(() => import("./world/Globe"))

class GlobeBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    return this.state.failed
      ? <div className="scene-message" role="status">无法显示 3D 地球，仍可从地区列表查看三个指标。</div>
      : this.props.children
  }
}

function coordinates(id: RegionId) {
  const [lon, lat] = regions[id].center
  return `${Math.abs(lat)}°${lat < 0 ? "S" : "N"} · ${Math.abs(lon)}°${lon < 0 ? "W" : "E"}`
}

export default function App() {
  const [selected, setSelected] = useState<RegionId>("ea")
  const [focus, setFocus] = useState({ id: selected })
  const [layer, setLayer] = useState<Layer>("adoptionBps")
  const current = snapshot[selected]

  function locate(id: RegionId) {
    setSelected(id)
    setFocus({ id })
  }
  return <main className="shell" style={{ "--layer": layers[layer].color } as CSSProperties}>
    <header className="masthead">
      <span className="brand"><i aria-hidden="true" />SINGULARITY <b>INC.</b></span>
      <span className="station"><span aria-hidden="true">●</span> 世界观测站</span>
    </header>
    <div className="heading">
      <p className="eyebrow">FIELD ATLAS <span>/</span> 01</p>
      <h1>全球态势台</h1>
      <p>在地球上查看 AI 普及、用户依赖与区域封锁。</p>
    </div>
    <div className="workspace">
      <section className="world-panel" aria-label="世界地图">
        <div className="panel-bar"><b>全球视图</b><span><i className="status-dot" /> 演示快照</span></div>
        <div className="stage">
          <GlobeBoundary><Suspense fallback={<div className="scene-message" role="status">正在载入地球…</div>}>
            <Globe selected={selected} layer={layer} focus={focus} onPick={setSelected} />
          </Suspense></GlobeBoundary>
          <span className="stage-code" aria-hidden="true">FIG. 01 <i>/</i> WORLD</span>
          <div className="map-key"><i /> 传播线路</div>
        </div>
        <div className="map-caption"><span>拖动旋转 · 滚轮或双指缩放 · 点选地区</span><span>12 个地区</span></div>
      </section>
      <section className="layer-panel" aria-label="地图图层">
        <div className="layer-picker"><b>地图图层</b><div className="layer-buttons">
          {layerKeys.map(key => <button type="button" key={key} aria-pressed={key === layer} onClick={() => setLayer(key)}>
            <i style={{ background: layers[key].color }} />{layers[key].label}</button>)}
        </div></div>
        <div className="legend"><span>{layers[layer].description}</span><span className="scale">0% <i /> 100%</span></div>
      </section>
      <aside className="dossier" aria-label="地区详情">
        <div className="panel-bar"><b>地区档案</b><span className="mono">REG / {selected.toUpperCase()}</span></div>
        <div className="dossier-body">
          <p className="eyebrow">REGION PROFILE</p>
          <h2 aria-live="polite">{regions[selected].name}</h2>
          <p className="coords">{coordinates(selected)}</p>
          <label htmlFor="region">定位地区</label>
          <div className="picker"><select id="region" value={selected} onChange={e => {
            const id = regionIds.find(id => id === e.currentTarget.value)
            if (id) locate(id)
          }}>{regionIds.map(id => <option key={id} value={id}>{regions[id].name}</option>)}</select>
            <button type="button" onClick={() => locate(selected)} aria-label="重新定位所选地区" title="重新定位所选地区">◎</button>
          </div>
          <div className="metric-list">
            {layerKeys.map(key => <div className="metric" key={key}>
              <div><span>{layers[key].label}</span><strong>{current[key] / 100}<small>%</small></strong></div>
              <div className="track" aria-hidden="true"><i style={{ width: `${current[key] / 100}%`, background: layers[key].color }} /></div>
            </div>)}
          </div>
        </div>
      </aside>
    </div>
  </main>
}
