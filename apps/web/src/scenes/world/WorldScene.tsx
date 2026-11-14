import { lazy, Suspense, useEffect, useReducer, useState } from "react"
import { standardScenario } from "../../../../../packages/rules/v0.1/scenario"
import type { Atlas, Location } from "../../cartography/atlas"
import { EUROPE, GLOBAL, MapCamera } from "../../cartography/camera"
import { SceneDialog } from "../Dialog"
import { EndingDialog } from "../ending/EndingDialog"
import { initialScene, playbackSpeed, sceneReducer, visibleRun, type RunSetup } from "../machine"
import { SetupDialog } from "../setup/SetupDialog"
import { CampaignNews, DecisionDialog, EvolutionPanel, MarketPanel } from "./CampaignPanels"
import Hud from "./Hud"
import { hudContent } from "./hudContent"
import { mapPreview } from "./preview"
import { RegionPanel } from "./RegionPanel"

const MapViewport = lazy(() => import("../../cartography/MapViewport"))

export function WorldScene({ atlas }: { atlas: Atlas }) {
  const [scene, send] = useReducer(sceneReducer, initialScene)
  const [location, setLocation] = useState<Location | null>(() => atlas.locate(31.2, 49.1))
  const [zoom, setZoom] = useState(EUROPE.zoom)
  const [rig] = useState(() => new MapCamera(setZoom))
  const [night, setNight] = useState(true)
  const [cloud, setCloud] = useState(true)
  const [current, setCurrent] = useState(true)
  const [reduced, setReduced] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches)
  const [full, setFull] = useState(Boolean(document.fullscreenElement))
  const [screenError, setScreenError] = useState("")
  useEffect(() => {
    document.querySelector(".game")?.classList.toggle("day", !night)
  }, [night])
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

  const run = visibleRun(scene)
  const content = hudContent(run, location === null)
  const speed = playbackSpeed(scene)
  const panel = scene.kind === "campaign" || scene.kind === "preview" ? scene.panel : null
  const back = () => send({ type: "back" })
  function preset(view: "global" | "europe") {
    rig.go(view === "global" ? GLOBAL : EUROPE)
    setLocation(view === "global" ? null : atlas.locate(31.2, 49.1))
    back()
  }
  function start(setup: RunSetup) {
    const [lon, lat] = standardScenario.regions[setup.startRegionId].center
    rig.go({ lon, lat, zoom: EUROPE.zoom })
    setLocation(atlas.locate(lon, lat))
    send({ type: "start", ...setup })
  }
  function leave() {
    rig.go(EUROPE)
    setLocation(atlas.locate(31.2, 49.1))
    send({ type: "return-to-preview" })
  }
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await document.documentElement.requestFullscreen()
      setScreenError("")
    } catch { setScreenError("此窗口无法进入全屏。") }
  }
  function presets() {
    return <><button onClick={() => preset("global")}>全球总览</button><button onClick={() => preset("europe")}>欧洲近景</button></>
  }

  return <>
    <Suspense fallback={<span className="map-loading" role="status">正在载入地图…</span>}>
      <MapViewport atlas={atlas} rig={rig} selected={location?.country} layers={{ cloud, current, reduced, speed, night }}
        pick={setLocation} marker={run ? undefined : mapPreview.marker} showNews={() => send({ type: "open-panel", panel: "news" })}/>
    </Suspense>
    <Hud location={location} content={content} zoom={zoom} speed={speed} night={night} toggleNight={() => setNight(value => !value)}
      open={p => send({ type: "open-panel", panel: p })}
      setSpeed={n => send({ type: "set-speed", speed: n })} setZoom={n => rig.zoom(n)}/>

    {panel === "world" && <SceneDialog title="世界" onBack={back}>
      {run && <MarketPanel setup={run}/>}
      <fieldset><legend>环境图层</legend>
        <label><input type="checkbox" checked={cloud} onChange={e => setCloud(e.target.checked)}/> 大气云层</label>
        <label><input type="checkbox" checked={current} onChange={e => setCurrent(e.target.checked)}/> 表层洋流</label>
      </fieldset>
      <p className="source-note">十一月气候态 · NOAA 风场与全球漂流浮标</p>
      <div className="window-actions">{presets()}</div>
      <a href="/map-credits.html" target="_blank" rel="noreferrer">地图数据与署名 ↗</a>
    </SceneDialog>}
    {panel === "region" && <SceneDialog title="地区资料" onBack={back}>
      <RegionPanel atlas={atlas} location={location} locate={c => {
        setLocation({ country: c, lon: c.lon, lat: c.lat }); rig.go({ lon: c.lon, lat: c.lat, zoom: .65 }); back()
      }}/>
    </SceneDialog>}
    {panel === "overview" && <SceneDialog title={content.overview} onBack={back}>
      {run ? <EvolutionPanel setup={run}/> : <dl className="readings">
        <div><dt>名称</dt><dd>{mapPreview.name}</dd></div><div><dt>DNA 点数</dt><dd>{mapPreview.dna}</dd></div>
        <div><dt>受感染</dt><dd>{mapPreview.infected}</dd></div><div><dt>死亡</dt><dd>{mapPreview.deaths}</dd></div>
      </dl>}
    </SceneDialog>}
    {panel === "news" && scene.kind === "preview" && <SceneDialog title={mapPreview.headline} event onBack={back}>
      <p>{mapPreview.report}</p>
    </SceneDialog>}
    {panel === "news" && scene.kind === "campaign" && <SceneDialog title="新闻" onBack={back}>
      <CampaignNews scene={scene} openDecision={id => send({ type: "open-decision", id })}/>
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
      <p>本局的开局配置与预览选择将结束。</p>
      <div className="window-actions"><button onClick={back}>取消</button><button onClick={() => send({ type: "withdraw" })}>确认结束</button></div>
    </SceneDialog>}
    {scene.kind === "setup" && <SetupDialog previous={scene.back.kind === "ending" ? scene.back.setup : undefined} start={start} back={back}/>}
    {scene.kind === "decision" && <DecisionDialog id={scene.id} back={back} choose={choiceId => send({ type: "choose", id: scene.id, choiceId })}/>}
    {scene.kind === "ending" && <EndingDialog scene={scene} restart={() => send({ type: "open-setup" })} leave={leave}/>}
  </>
}
