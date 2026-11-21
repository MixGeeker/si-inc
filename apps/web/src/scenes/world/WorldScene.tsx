import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { regions } from "../../../../../packages/rules/v0.1/world/regions"
import type { Atlas, Location } from "../../cartography/atlas"
import { EUROPE, GLOBAL, MapCamera } from "../../cartography/camera"
import { useLanguage } from "../../i18n/useLanguage"
import { SceneDialog } from "../Dialog"
import { EndingDialog } from "../ending/EndingDialog"
import { useGameSnapshot, useGameStore } from "../GameContext"
import { defaultResearchSkill, visibleRunState, type NewsView, type RunSetup } from "../machine"
import { gamePlaybackSpeed, selectedPlace, type MapSelection, type PlaceFocus } from "../store"
import { SetupDialog } from "../setup/SetupDialog"
import { StartScreen } from "../setup/StartScreen"
import { DifficultyDialog } from "../setup/DifficultyDialog"
import { SettingsDialog } from "../settings/SettingsDialog"
import { nextCommandSeq } from "../../../../../packages/game/run"
import { DecisionDialog, MarketPanel } from "./CampaignPanels"
import { ActionsDialog } from "./ActionsDialog"
import { ResearchDialog } from "./ResearchDialog"
import "./developer-panel.css"
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
const DeveloperPanel = lazy(() => import("./DeveloperPanel"))
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
  const language = useLanguage()
  const { ui, locale } = language
  const previewMarker = useMemo(() => ({ ...mapPreview.marker, label: language.ui.previewMarker }), [language])
  const { dispatch: send } = store
  const showGlobal = useCallback(() => send({ type: "map-preset", view: "global" }), [send])
  const snapshot = useGameSnapshot()
  const { scene, selection, layers: { night, cloud, current, population }, populationPreview, developer } = snapshot
  const location = useMemo(() => locationFor(atlas, selection), [atlas, selection])
  const [zoom, setZoom] = useState(EUROPE.zoom)
  const [rig] = useState(() => new MapCamera(setZoom))
  const [reduced, setReduced] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches)
  const devLauncher = useRef<HTMLButtonElement>(null)
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
      store.on("synthetic-toggled", ({ firstActivation }) => {
        if (firstActivation) store.dispatch({ type: "set-layer", layer: "night", enabled: true })
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
    media.addEventListener("change", update)
    return () => {
      media.removeEventListener("change", update)
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
  const content = hudContent(run, location === null, language)
  const newsItems = run ? campaignNews(run, language) : previewNews(language)
  const speed = gamePlaybackSpeed(snapshot)
  let playbackScene = scene
  while ("back" in playbackScene) playbackScene = playbackScene.back
  const selectedSpeed = "speed" in playbackScene ? playbackScene.speed : 1
  const manualPaused = "manualPaused" in playbackScene ? playbackScene.manualPaused : false
  const panel = scene.kind === "campaign" || scene.kind === "preview" ? scene.panel : null
  const frontScene = scene.kind === "start" || scene.kind === "settings" || scene.kind === "setup" || scene.kind === "difficulty"
  const showDeveloper = developer.open && panel === null && !frontScene
  const openDeveloper = () => send({ type: "set-developer-open", open: true })
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
  function presets() {
    return <><button onClick={() => send({ type: "map-preset", view: "global" })}>{ui.globalView}</button>
      <button onClick={() => send({ type: "map-preset", view: "europe" })}>{ui.europeView}</button></>
  }

  return <>
    <Suspense fallback={<span className="map-loading" role="status">{ui.mapLoading}</span>}>
      <MapViewport atlas={atlas} rig={rig} selected={selected} populations={populations} layers={{ cloud, current, reduced, speed, night }}
        pick={({ country, ...point }) => send({ type: "pick-location", selection: { ...point, countryId: country?.id ?? null } })}
        marker={run ? undefined : previewMarker} showNews={() => openNews("current", "preview")} showGlobal={showGlobal}/>
    </Suspense>
    <Hud location={location} place={place} content={content} zoom={zoom} selectedSpeed={selectedSpeed} manualPaused={manualPaused} paused={speed === 0}
      night={night} toggleNight={() => send({ type: "set-layer", layer: "night", enabled: !night })}
      newsItems={newsItems} newsView={newsView} newsItemId={newsItemId} newsDay={run ? run.completedDay : null}
      openNews={openNews} closeNews={back} decide={(id, instanceId) => send({ type: "open-decision", id, instanceId })}
      open={panelName => { if (newsView) send({ type: "back" }); send({ type: "open-panel", panel: panelName }) }}
      focusPlace={place => send({ type: "focus-place", place })}
      setSpeed={n => send({ type: "set-speed", speed: n })} onPause={paused => send({ type: "set-paused", paused })} setZoom={n => rig.zoom(n)}/>
    {example && panel === null && <PopulationControls preview={example}/>}
    {developer.open && <Suspense fallback={null}><DeveloperPanel hidden={!showDeveloper} close={() => {
      send({ type: "set-developer-open", open: false })
      requestAnimationFrame(() => devLauncher.current?.focus({ preventScroll: true }))
    }} openSetup={() => {
      send({ type: "open-panel", panel: "menu" }); send({ type: "open-setup" })
    }}/></Suspense>}
    {developer.enabled && !developer.open && (scene.kind === "preview" || scene.kind === "campaign") && panel === null &&
      <button type="button" className="dev-launcher" ref={devLauncher} onClick={openDeveloper} aria-expanded={false}>{ui.developer.title}</button>}
    {newsView === "archive" && (
      <NewsOverview items={newsItems} itemId={newsItemId} dated={run !== null} open={openNews} close={back}
        decide={(id, instanceId) => send({ type: "open-decision", id, instanceId })}/>
    )}

    {panel === "world" && <SceneDialog title={ui.world} onBack={back}>
      {run && <MarketPanel run={run}/>}
      <fieldset><legend>{ui.layers}</legend>
        <label><input type="checkbox" checked={cloud} onChange={e => send({ type: "set-layer", layer: "cloud", enabled: e.target.checked })}/> {ui.clouds}</label>
        <label><input type="checkbox" checked={current} onChange={e => send({ type: "set-layer", layer: "current", enabled: e.target.checked })}/> {ui.currents}</label>
        <label><input type="checkbox" checked={population} onChange={e => send({ type: "set-layer", layer: "population", enabled: e.target.checked })}/> {ui.populationLayer}</label>
      </fieldset>
      <p className="source-note">{ui.climate}</p>
      {run && population && livePopulation && Object.keys(livePopulation).length > 0 && <PopulationLegend/>}
      <div className="window-actions">{presets()}
        {scene.kind === "preview" && <button type="button" onClick={()=>send({type:"open-population-preview"})}>{ui.populationPreview}</button>}
      </div>
      <a href={locale === "en" ? "/map-credits.en.html" : "/map-credits.html"} target="_blank" rel="noreferrer">{ui.credits} ↗</a>
    </SceneDialog>}
    {panel === "region" && <SceneDialog title={ui.regionProfile} onBack={back}>
      <RegionPanel atlas={atlas} location={location} place={place} run={run}
        chooseMarket={id => send({ type: "focus-place", place: { kind: "market", id } })}
        buildCenter={run ? countryId => send({ type: "build-data-center", countryId, runId: run.runId, completedDay: run.completedDay, seq: nextCommandSeq(run) }) : undefined}
        toggleSynthetic={run ? (regionId, enabled) => send({ type: "toggle-synthetic", regionId, enabled, runId: run.runId, completedDay: run.completedDay, seq: nextCommandSeq(run) }) : undefined}
        openActions={run ? () => { send({ type: "back" }); send({ type: "open-panel", panel: "actions" }) } : undefined}/>
    </SceneDialog>}
    {panel === "actions" && scene.kind === "campaign" &&
      <ActionsDialog run={scene.run} atlas={atlas} initialRegionId={marketId} back={back}/>}
    {panel === "overview" && scene.kind === "campaign" &&
      <ResearchDialog run={scene.run} skillId={scene.researchSkillId ?? defaultResearchSkill} back={back}/>}
    {panel === "overview" && scene.kind === "preview" && <SceneDialog title={content.overview} onBack={back}>
      <dl className="readings">
        <div><dt>{ui.name}</dt><dd>{mapPreview.name}</dd></div><div><dt>{ui.dnaPoints}</dt><dd>{mapPreview.dna}</dd></div>
        <div><dt>{ui.infected}</dt><dd>{mapPreview.infected}</dd></div><div><dt>{ui.deaths}</dt><dd>{mapPreview.deaths}</dd></div>
      </dl>
    </SceneDialog>}
    {panel === "menu" && <SceneDialog title={ui.menu} onBack={back}>
      <div className="window-actions">{run
        ? <><button onClick={back}>{ui.resume}</button>
          <button onClick={() => { send({ type: "back" }); send({ type: "open-panel", panel: "world" }) }}>{ui.mapMarkets}</button>
          <button onClick={() => send({ type: "request-exit" })}>{ui.endRun}</button></>
        : <button onClick={() => send({ type: "open-setup" })}>{ui.newRun}</button>}
      </div>
      {run && <fieldset><legend>{ui.lighting}</legend>
        <p className="source-note">{ui.lightingNote}</p>
        <button type="button" onClick={() => send({ type: "set-layer", layer: "night", enabled: !night })}>{night ? ui.showDay : ui.showNight}</button>
      </fieldset>}
      <div className="window-actions">{presets()}
        <button type="button" onClick={() => send({ type: "open-settings" })}>{ui.preferences.title}</button>
        {!run && <button type="button" onClick={() => send({ type: "open-start" })}>{ui.front.title}</button>}
      </div>
      <p className="source-note">{ui.navigation}</p>
    </SceneDialog>}
    {panel === "confirm-exit" && <SceneDialog title={ui.confirmEndTitle} onBack={back}>
      <p>{ui.confirmEndBody}</p>
      <div className="window-actions"><button onClick={back}>{ui.cancel}</button><button onClick={() => send({ type: "withdraw" })}>{ui.confirmEnd}</button></div>
    </SceneDialog>}
    {scene.kind === "start" && <StartScreen start={() => send({ type: "open-setup" })}
      settings={() => send({ type: "open-settings" })} explore={() => {
        send({ type: "back" })
        const next = store.getSnapshot().scene
        if (next.kind === "preview" && next.panel !== null) send({ type: "back" })
      }}/>}
    {scene.kind === "settings" && <SettingsDialog back={back}/>}
    {scene.kind === "setup" && <SetupDialog previous={scene.selection}
      next={selection => send({ type: "open-difficulty", ...selection })} back={back}/>}
    {scene.kind === "difficulty" && <DifficultyDialog selection={scene.back.selection} start={start} back={back}/>}
    {scene.kind === "decision" && !showDeveloper && <DecisionDialog scene={scene} back={back} inspect={developer.enabled ? openDeveloper : undefined}
      choose={choiceId => send({ type: "choose", id: scene.id, instanceId: scene.instanceId, choiceId })}/>}
    {scene.kind === "ending" && !showDeveloper && <EndingDialog scene={scene} restart={() => send({ type: "open-setup" })} leave={() => send({ type: "return-to-preview" })}
      inspect={developer.enabled ? openDeveloper : undefined}/>}
  </>
}
