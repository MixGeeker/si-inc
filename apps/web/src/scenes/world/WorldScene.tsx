import { lazy, Suspense, useEffect, useMemo, useState } from "react"
import type { Atlas, Location } from "../../cartography/atlas"
import { EUROPE, GLOBAL, MapCamera } from "../../cartography/camera"
import { SceneDialog } from "../Dialog"
import { EndingDialog } from "../ending/EndingDialog"
import { useGameSnapshot, useGameStore } from "../GameContext"
import { playbackSpeed, visibleRunState, type NewsView, type RunSetup } from "../machine"
import { SetupDialog } from "../setup/SetupDialog"
import { DecisionDialog, EvolutionPanel, MarketPanel } from "./CampaignPanels"
import Hud, { type PlaceLevel } from "./Hud"
import { NewsOverview } from "./NewsLayer"
import { hudContent } from "./hudContent"
import { campaignNews, previewNews } from "./newsFeed"
import { countryLines, fixtureCountry, marketCenter, marketCountries, marketOfCountry, worldMarkets, type PlaceNav } from "./placeFixture"
import type { RegionId } from "../../../../../packages/rules/v0.1/world/regions"
import { mapPreview } from "./preview"
import { RegionPanel } from "./RegionPanel"

const MapViewport = lazy(() => import("../../cartography/MapViewport"))

export function WorldScene({ atlas }: { atlas: Atlas }) {
  const store = useGameStore()
  const { dispatch: send } = store
  const { scene, selection, layers: { night, cloud, current }, sound } = useGameSnapshot()
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
  const [placeNav, setPlaceNav] = useState<PlaceNav>({})
  useEffect(() => {
    const off = [
      store.on("run-started", (_, state) => {
        setPlaceNav({})
        if (state.selection) rig.go({ lon: state.selection.lon, lat: state.selection.lat, zoom: EUROPE.zoom })
        store.dispatch({ type: "set-layer", layer: "night", enabled: false })
      }),
      store.on("return-to-preview", () => {
        rig.go(EUROPE)
        store.dispatch({ type: "set-layer", layer: "night", enabled: true })
      }),
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
  const focusedCountry = selection?.countryId ? location?.country ?? null : null
  const factionId = run?.setup.factionId
  const place: PlaceLevel | null = useMemo(() => {
    if (!factionId) return null
    if (placeNav.countryId) {
      const known = fixtureCountry(placeNav.countryId)
      const { lines, footer } = countryLines(placeNav.countryId, factionId)
      return {
        kind: "country",
        name: known?.name ?? focusedCountry?.name ?? "地区",
        lines, footer,
        backLabel: placeNav.marketId ? `返回${marketCenter(placeNav.marketId).name}` : "返回全球",
      }
    }
    if (placeNav.marketId) {
      const center = marketCenter(placeNav.marketId)
      return {
        kind: "market",
        name: center.name,
        reward: placeNav.marketId === "ea" ? "30% 未领 · 70% 未领" : "30% 未记 · 70% 未记",
        countries: marketCountries(placeNav.marketId, factionId),
        note: "这一市场还没有试玩人口",
      }
    }
    return { kind: "world", markets: worldMarkets(factionId) }
  }, [factionId, focusedCountry, placeNav])
  const placeThumb: Location | null = useMemo(() => {
    if (place?.kind === "country" && placeNav.countryId) {
      const known = fixtureCountry(placeNav.countryId)
      const country = focusedCountry?.id === placeNav.countryId ? focusedCountry : null
      if (known) return { lon: known.lon, lat: known.lat, country }
      if (focusedCountry) return { lon: focusedCountry.lon, lat: focusedCountry.lat, country: focusedCountry }
    }
    if (place?.kind === "market" && placeNav.marketId) {
      const center = marketCenter(placeNav.marketId)
      return { lon: center.lon, lat: center.lat, country: null }
    }
    return null
  }, [focusedCountry, place, placeNav])
  useEffect(() => {
    if (!selection?.countryId) return
    const marketId = marketOfCountry(selection.countryId)
    setPlaceNav(marketId ? { marketId, countryId: selection.countryId } : { countryId: selection.countryId })
  }, [selection?.countryId])
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
      <MapViewport atlas={atlas} rig={rig} selected={location?.country} layers={{ cloud, current, reduced, speed, night }}
        pick={({ country, ...point }) => send({ type: "pick-location", selection: { ...point, countryId: country?.id ?? null } })}
        marker={run ? undefined : mapPreview.marker} showNews={() => openNews("current", "preview")}/>
    </Suspense>
    <Hud location={location} place={place} placeThumb={placeThumb} content={content} zoom={zoom} speed={speed} night={night} toggleNight={() => send({ type: "set-layer", layer: "night", enabled: !night })}
      newsItems={newsItems} newsView={newsView} newsItemId={newsItemId} newsWeek={run ? run.completedWeek : null}
      openNews={openNews} closeNews={back} decide={(id, instanceId) => send({ type: "open-decision", id, instanceId })}
      open={panelName => { if (newsView) send({ type: "back" }); send({ type: "open-panel", panel: panelName }) }}
      chooseMarket={(id: RegionId) => {
        setPlaceNav({ marketId: id })
        const center = marketCenter(id)
        rig.go({ lon: center.lon, lat: center.lat, zoom: .42 })
      }}
      chooseCountry={id => {
        const country = fixtureCountry(id)
        if (!country) return
        setPlaceNav({ marketId: "ea", countryId: id })
        rig.go({ lon: country.lon, lat: country.lat, zoom: .65 })
        send({ type: "pick-location", selection: { lon: country.lon, lat: country.lat, countryId: id } })
      }}
      placeBack={() => setPlaceNav(nav => nav.countryId && nav.marketId ? { marketId: nav.marketId } : {})}
      setSpeed={n => send({ type: "set-speed", speed: n })} setZoom={n => rig.zoom(n)}/>
    {newsView === "archive" && (
      <NewsOverview items={newsItems} itemId={newsItemId} dated={run !== null} open={openNews} close={back}
        decide={(id, instanceId) => send({ type: "open-decision", id, instanceId })}/>
    )}

    {panel === "world" && <SceneDialog title="世界" onBack={back}>
      {run && <MarketPanel setup={run.setup}/>}
      <fieldset><legend>环境图层</legend>
        <label><input type="checkbox" checked={cloud} onChange={e => send({ type: "set-layer", layer: "cloud", enabled: e.target.checked })}/> 白天显示云层</label>
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
