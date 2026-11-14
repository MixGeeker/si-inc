import { lazy, Suspense, useEffect, useMemo, useState } from "react"
import type { Atlas, Location } from "../../cartography/atlas"
import { EUROPE, GLOBAL, MapCamera } from "../../cartography/camera"
import { SceneDialog } from "../Dialog"
import { EndingDialog } from "../ending/EndingDialog"
import { useGameSnapshot, useGameStore } from "../GameContext"
import { playbackSpeed, visibleRunState, type RunSetup } from "../machine"
import { SetupDialog } from "../setup/SetupDialog"
import { CampaignNews, DecisionDialog, EvolutionPanel, MarketPanel } from "./CampaignPanels"
import Hud from "./Hud"
import { hudContent } from "./hudContent"
import { mapPreview } from "./preview"
import { RegionPanel } from "./RegionPanel"

const MapViewport = lazy(() => import("../../cartography/MapViewport"))

export function WorldScene({ atlas }: { atlas: Atlas }) {
  const store = useGameStore()
  const { dispatch: send } = store
  const { scene, selection, layers: { night, cloud, current } } = useGameSnapshot()
  const location: Location | null = useMemo(() => {
    if (!selection) return null
    if (selection.countryId === undefined) return atlas.locate(selection.lon, selection.lat)
    return { ...selection, country: atlas.countries.find(c => c.id === selection.countryId) ?? null }
  }, [atlas, selection])
  const [zoom, setZoom] = useState(EUROPE.zoom)
  const [rig] = useState(() => new MapCamera(setZoom))
  const [reduced, setReduced] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches)
  const [full, setFull] = useState(Boolean(document.fullscreenElement))
  const [screenError, setScreenError] = useState("")
  useEffect(() => {
    const off = [
      store.on("run-started", (_, state) => {
        if (state.selection) rig.go({ lon: state.selection.lon, lat: state.selection.lat, zoom: EUROPE.zoom })
      }),
      store.on("return-to-preview", () => rig.go(EUROPE)),
      store.on("map-preset", event => rig.go(event.view === "global" ? GLOBAL : EUROPE)),
      store.on("focus-country", ({ selection }) => rig.go({ lon: selection.lon, lat: selection.lat, zoom: .65 })),
    ]
    return () => off.forEach(stop => stop())
  }, [store, rig])
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)")
    const update = () => setReduced(media.matches)
    const screen = () => setFull(Boolean(document.fullscreenElement))
    media.addEventListener("change", update)
    document.addEventListener("fullscreenchange", screen)
    return () => {
      media.removeEventListener("change", update)
      document.removeEventListener("fullscreenchange", screen)
    }
  }, [])

  const run = visibleRunState(scene)
  const content = hudContent(run, location === null)
  const speed = playbackSpeed(scene)
  const panel = scene.kind === "campaign" || scene.kind === "preview" ? scene.panel : null
  const back = () => send({ type: "back" })
  function start(setup: RunSetup) {
    send({ type: "start", ...setup, seed: crypto.getRandomValues(new Uint32Array(1))[0] })
  }
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await document.documentElement.requestFullscreen()
      setScreenError("")
    } catch { setScreenError("此窗口无法进入全屏。") }
  }
  function presets() {
    return <><button onClick={() => send({ type: "map-preset", view: "global" })}>全球总览</button>
      <button onClick={() => send({ type: "map-preset", view: "europe" })}>欧洲近景</button></>
  }

  return <>
    <Suspense fallback={<span className="map-loading" role="status">正在载入地图…</span>}>
      <MapViewport atlas={atlas} rig={rig} selected={location?.country} layers={{ cloud, current, reduced, speed, night }}
        pick={({ country, ...point }) => send({ type: "pick-location", selection: { ...point, countryId: country?.id ?? null } })}
        marker={run ? undefined : mapPreview.marker} showNews={() => send({ type: "open-panel", panel: "news" })}/>
    </Suspense>
    <Hud location={location} content={content} zoom={zoom} speed={speed} night={night} toggleNight={() => send({ type: "set-layer", layer: "night", enabled: !night })}
      open={p => send({ type: "open-panel", panel: p })}
      setSpeed={n => send({ type: "set-speed", speed: n })} setZoom={n => rig.zoom(n)}/>

    {panel === "world" && <SceneDialog title="世界" onBack={back}>
      {run && <MarketPanel setup={run.setup}/>}
      <fieldset><legend>环境图层</legend>
        <label><input type="checkbox" checked={cloud} onChange={e => send({ type: "set-layer", layer: "cloud", enabled: e.target.checked })}/> 大气云层</label>
        <label><input type="checkbox" checked={current} onChange={e => send({ type: "set-layer", layer: "current", enabled: e.target.checked })}/> 表层洋流</label>
      </fieldset>
      <p className="source-note">十一月气候态 · NOAA 风场与全球漂流浮标</p>
      <div className="window-actions">{presets()}</div>
      <a href="/map-credits.html" target="_blank" rel="noreferrer">地图数据与署名 ↗</a>
    </SceneDialog>}
    {panel === "region" && <SceneDialog title="地区资料" onBack={back}>
      <RegionPanel atlas={atlas} location={location} locate={c =>
        send({ type: "focus-country", selection: { countryId: c.id, lon: c.lon, lat: c.lat } })}/>
    </SceneDialog>}
    {panel === "overview" && <SceneDialog title={content.overview} onBack={back}>
      {run ? <EvolutionPanel run={run}/> : <dl className="readings">
        <div><dt>名称</dt><dd>{mapPreview.name}</dd></div><div><dt>DNA 点数</dt><dd>{mapPreview.dna}</dd></div>
        <div><dt>受感染</dt><dd>{mapPreview.infected}</dd></div><div><dt>死亡</dt><dd>{mapPreview.deaths}</dd></div>
      </dl>}
    </SceneDialog>}
    {panel === "news" && scene.kind === "preview" && <SceneDialog title={mapPreview.headline} event onBack={back}>
      <p>{mapPreview.report}</p>
    </SceneDialog>}
    {panel === "news" && scene.kind === "campaign" && <SceneDialog title="新闻" onBack={back}>
      <CampaignNews scene={scene} openDecision={(id, instanceId) => send({ type: "open-decision", id, instanceId })}/>
    </SceneDialog>}
    {panel === "menu" && <SceneDialog title="菜单" onBack={back}>
      <div className="window-actions">{run
        ? <><button onClick={back}>返回对局</button><button onClick={() => send({ type: "request-exit" })}>结束本局</button></>
        : <button onClick={() => send({ type: "open-setup" })}>新建对局</button>}
      </div>
      <div className="window-actions">{presets()}
        {document.fullscreenEnabled && <button onClick={fullscreen}>{full ? "退出全屏" : "进入全屏"}</button>}
      </div>
      <p className="source-note">拖动平移 · 滚轮或双指缩放 · Home 返回全球</p>
      {screenError && <p role="status">{screenError}</p>}
    </SceneDialog>}
    {panel === "confirm-exit" && <SceneDialog title="结束这局游戏？" onBack={back}>
      <p>本局将停止推进，进入结算。</p>
      <div className="window-actions"><button onClick={back}>取消</button><button onClick={() => send({ type: "withdraw" })}>确认结束</button></div>
    </SceneDialog>}
    {scene.kind === "setup" && <SetupDialog previous={scene.back.kind === "ending" ? scene.back.run.setup : undefined} start={start} back={back}/>}
    {scene.kind === "decision" && <DecisionDialog scene={scene} back={back}
      choose={choiceId => send({ type: "choose", id: scene.id, instanceId: scene.instanceId, choiceId })}/>}
    {scene.kind === "ending" && <EndingDialog scene={scene} restart={() => send({ type: "open-setup" })} leave={() => send({ type: "return-to-preview" })}/>}
  </>
}
