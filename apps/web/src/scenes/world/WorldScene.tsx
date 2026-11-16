import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react"
import { regions } from "../../../../../packages/rules/v0.1/world/regions"
import type { Atlas, Location } from "../../cartography/atlas"
import { EUROPE, GLOBAL, MapCamera } from "../../cartography/camera"
import { SceneDialog } from "../Dialog"
import { EndingDialog } from "../ending/EndingDialog"
import { useGameSnapshot, useGameStore } from "../GameContext"
import { playbackSpeed, visibleRunState, type NewsView, type RunSetup } from "../machine"
import { selectedPlace, type MapSelection, type PlaceFocus } from "../store"
import { SetupDialog } from "../setup/SetupDialog"
import { DecisionDialog, EvolutionPanel, MarketPanel } from "./CampaignPanels"
import Hud from "./Hud"
import { NewsOverview } from "./NewsLayer"
import { hudContent } from "./hudContent"
import { campaignNews, previewNews } from "./newsFeed"
import { mapPreview } from "./preview"
import { RegionPanel } from "./RegionPanel"
import { PopulationControls, PopulationLegend } from "./PopulationControls"
import { previewPopulations } from "./populationPreview"
import type { CountryPopulations } from "../../../../../packages/game/population"

const MapViewport = lazy(() => import("../../cartography/MapViewport"))
const noPopulation: CountryPopulations = {}

function locationFor(atlas: Atlas, selection: MapSelection | null): Location | null {
  if (!selection) return null
  if ("kind" in selection) {
    const [lon, lat] = regions[selection.id].center
    return atlas.locate(lon, lat)
  }
  if (selection.countryId === undefined) return { ...selection, ...atlas.locate(selection.lon, selection.lat) }
  return { ...selection, country: selection.countryId ? atlas.countryById.get(selection.countryId) ?? null : null }
}

export function WorldScene({ atlas }: { atlas: Atlas }) {
  const store = useGameStore()
  const { dispatch: send } = store
  const showGlobal = useCallback(() => send({ type: "map-preset", view: "global" }), [send])
  const { scene, selection, layers: { night, cloud, current, population }, populationPreview, sound } = useGameSnapshot()
  const location = useMemo(() => locationFor(atlas, selection), [atlas, selection])
  const [zoom, setZoom] = useState(EUROPE.zoom)
  const [rig] = useState(() => new MapCamera(setZoom))
  const [reduced, setReduced] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches)
  const [full, setFull] = useState(Boolean(document.fullscreenElement))
  const [screenError, setScreenError] = useState("")
  useEffect(() => {
    function goToPlace(place: PlaceFocus | null) {
      if (!place) return rig.go(GLOBAL)
      const [lon, lat] = regions[place.id].center
      rig.go({ lon, lat, zoom: place.id === "eu" ? .42 : .29 })
    }
    const off = [
      store.on("run-started", ({ setup }) => {
        goToPlace({ kind: "market", id: setup.startRegionId })
        store.dispatch({ type: "set-layer", layer: "night", enabled: false })
      }),
      store.on("return-to-preview", () => {
        rig.go(EUROPE)
        store.dispatch({ type: "set-layer", layer: "night", enabled: true })
      }),
      store.on("map-preset", (event, state) => {
        if (state.scene.kind === "campaign") goToPlace(selectedPlace(state.selection))
        else rig.go(event.view === "global" ? GLOBAL : EUROPE)
      }),
      store.on("focus-place", (_, state) => goToPlace(selectedPlace(state.selection))),
      store.on("open-population-preview", () => rig.go({ lon: 133.5, lat: 37.2, zoom: .92 })),
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
  const livePopulation = run?.countryPopulations
  const example = scene.kind === "preview" ? populationPreview : null
  const populations = useMemo(() => population
    ? (example ? previewPopulations(example) : livePopulation ?? noPopulation)
    : noPopulation, [population, example, livePopulation])
  const place = selectedPlace(selection, location?.country?.id)
  const marketId = place?.id
  const singleCountry = marketId ? null : location?.country
  const selected = useMemo(() => {
    if (!marketId) return singleCountry ? [singleCountry] : []
    return Object.keys(regions[marketId].slots).flatMap(id => atlas.countryById.get(id) ?? [])
  }, [atlas, marketId, singleCountry])
  const content = hudContent(run, location === null)
  const newsItems = run ? campaignNews(run) : previewNews()
  const speed = playbackSpeed(scene)
  const panel = scene.kind === "campaign" || scene.kind === "preview" ? scene.panel : null
  const newsView = panel === "news" && (scene.kind === "preview" || scene.kind === "campaign") ? scene.newsView ?? "archive" : null
  const newsItemId = panel === "news" && (scene.kind === "preview" || scene.kind === "campaign") ? scene.newsItemId : undefined
  const back = () => send({ type: "back" })
  function openNews(view: NewsView, itemId?: string) {
    if (newsView === view && newsItemId === itemId) send({ type: "back" })
    else send({ type: "open-panel", panel: "news", newsView: view, newsItemId: itemId })
  }
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
      <MapViewport atlas={atlas} rig={rig} selected={selected} populations={populations} layers={{ cloud, current, reduced, speed, night }}
        pick={({ country, ...point }) => send({ type: "pick-location", selection: { ...point, countryId: country?.id ?? null } })}
        marker={run ? undefined : mapPreview.marker} showNews={() => openNews("current", "preview")} showGlobal={showGlobal}/>
    </Suspense>
    <Hud location={location} place={place} content={content} zoom={zoom} speed={speed} night={night} toggleNight={() => send({ type: "set-layer", layer: "night", enabled: !night })}
      newsItems={newsItems} newsView={newsView} newsItemId={newsItemId} newsWeek={run ? run.completedWeek : null}
      openNews={openNews} closeNews={back} decide={(id, instanceId) => send({ type: "open-decision", id, instanceId })}
      open={panelName => { if (newsView) send({ type: "back" }); send({ type: "open-panel", panel: panelName }) }}
      focusPlace={place => send({ type: "focus-place", place })}
      setSpeed={n => send({ type: "set-speed", speed: n })} setZoom={n => rig.zoom(n)}/>
    {example && panel === null && <PopulationControls preview={example}/>}
    {newsView === "archive" && (
      <NewsOverview items={newsItems} itemId={newsItemId} dated={run !== null} open={openNews} close={back}
        decide={(id, instanceId) => send({ type: "open-decision", id, instanceId })}/>
    )}

    {panel === "world" && <SceneDialog title="世界" onBack={back}>
      {run && <MarketPanel setup={run.setup}/>}
      <fieldset><legend>环境图层</legend>
        <label><input type="checkbox" checked={cloud} onChange={e => send({ type: "set-layer", layer: "cloud", enabled: e.target.checked })}/> 白天显示云层</label>
        <label><input type="checkbox" checked={current} onChange={e => send({ type: "set-layer", layer: "current", enabled: e.target.checked })}/> 表层洋流</label>
        <label><input type="checkbox" checked={population} onChange={e => send({ type: "set-layer", layer: "population", enabled: e.target.checked })}/> 人口分布</label>
      </fieldset>
      <p className="source-note">十一月气候态 · NOAA 风场与全球漂流浮标</p>
      {run && population && livePopulation && Object.keys(livePopulation).length > 0 && <PopulationLegend/>}
      <div className="window-actions">{presets()}
        {scene.kind === "preview" && <button type="button" onClick={()=>send({type:"open-population-preview"})}>东亚人口分布示例</button>}
      </div>
      <a href="/map-credits.html" target="_blank" rel="noreferrer">地图数据与署名 ↗</a>
    </SceneDialog>}
    {panel === "region" && <SceneDialog title="地区资料" onBack={back}>
      <RegionPanel atlas={atlas} location={location} place={place}
        chooseMarket={id => send({ type: "focus-place", place: { kind: "market", id } })}/>
    </SceneDialog>}
    {panel === "overview" && <SceneDialog title={content.overview} onBack={back}>
      {run ? <EvolutionPanel run={run}/> : <dl className="readings">
        <div><dt>名称</dt><dd>{mapPreview.name}</dd></div><div><dt>DNA 点数</dt><dd>{mapPreview.dna}</dd></div>
        <div><dt>受感染</dt><dd>{mapPreview.infected}</dd></div><div><dt>死亡</dt><dd>{mapPreview.deaths}</dd></div>
      </dl>}
    </SceneDialog>}
    {panel === "menu" && <SceneDialog title="菜单" onBack={back}>
      <div className="window-actions">{run
        ? <><button onClick={back}>返回对局</button>
          <button onClick={() => { send({ type: "back" }); send({ type: "open-panel", panel: "world" }) }}>地图与市场</button>
          <button onClick={() => send({ type: "request-exit" })}>结束本局</button></>
        : <button onClick={() => send({ type: "open-setup" })}>新建对局</button>}
      </div>
      {run && <fieldset><legend>光照</legend>
        <p className="source-note">主界面按当前光照显示第一幕或第二幕。新对局从永昼开始，正式切换以后由合成人计划决定。</p>
        <button type="button" onClick={() => send({ type: "set-layer", layer: "night", enabled: !night })}>{night ? "查看永昼" : "查看永夜"}</button>
      </fieldset>}
      <div className="window-actions">{presets()}
        {document.fullscreenEnabled && <button onClick={fullscreen}>{full ? "退出全屏" : "进入全屏"}</button>}
      </div>
      <fieldset><legend>音效</legend>
        <div className="sound-controls">
          <label className="sound-volume">音量
            <input type="range" min="0" max="100" step="1" value={sound.volume} aria-valuetext={`${sound.volume}%`}
              onChange={e => send({ type: "set-sound-volume", volume: e.currentTarget.valueAsNumber })}/>
            <span aria-hidden="true">{sound.volume}%</span>
          </label>
          <label><input type="checkbox" checked={sound.muted}
            onChange={e => send({ type: "set-sound-muted", muted: e.currentTarget.checked })}/> 静音</label>
        </div>
        <button type="button" disabled={sound.muted || sound.volume === 0}
          onClick={() => send({ type: "play-sound", cue: "test" })}>测试音效</button>
      </fieldset>
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
