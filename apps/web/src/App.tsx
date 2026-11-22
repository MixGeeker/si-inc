import { useEffect, useState, type ComponentType } from "react"
import { loadAtlas, type Atlas } from "./cartography/atlas"
import { useLanguage } from "./i18n/useLanguage"
import { useGameSnapshot, useGameStore } from "./scenes/GameContext"
import type { RunSetup } from "./scenes/machine"
import { SettingsDialog } from "./scenes/settings/SettingsDialog"
import { DifficultyDialog } from "./scenes/setup/DifficultyDialog"
import { SetupDialog } from "./scenes/setup/SetupDialog"
import { StartScreen } from "./scenes/setup/StartScreen"

type MapLoad = { kind: "loading" } | { kind: "failed" }
  | { kind: "ready"; atlas: Atlas; WorldScene: ComponentType<{ atlas: Atlas }> }

function FrontScenes({ mapStatus, retryMap }: { mapStatus: MapLoad["kind"]; retryMap: () => void }) {
  const store = useGameStore()
  const send = store.dispatch
  const scene = useGameSnapshot(({ scene }) => {
    switch (scene.kind) {
      case "start": case "setup": case "difficulty": case "settings": return scene
      default: return null
    }
  })
  const back = () => send({ type: "back" })
  function start(setup: RunSetup) {
    send({ type: "start", ...setup, seed: crypto.getRandomValues(new Uint32Array(1))[0] })
  }
  switch (scene?.kind) {
    case "start": return <StartScreen start={() => send({ type: "open-setup" })}
      settings={() => send({ type: "open-settings" })} explore={() => {
        back()
        const next = store.getSnapshot().scene
        if (next.kind === "preview" && next.panel !== null) back()
      }}/>
    case "settings": return <SettingsDialog back={back}/>
    case "setup": return <SetupDialog previous={scene.selection}
      next={selection => send({ type: "open-difficulty", ...selection })} back={back}/>
    case "difficulty": return <DifficultyDialog selection={scene.back.selection} start={start} back={back}
      mapStatus={mapStatus} retryMap={retryMap}/>
    default: return null
  }
}

export default function App() {
  const { ui, locale } = useLanguage()
  const night = useGameSnapshot(state => state.layers.night)
  const [load, setLoad] = useState<MapLoad>({ kind: "loading" })
  const [attempt, setAttempt] = useState(0)
  function retryMap() {
    setLoad({ kind: "loading" })
    setAttempt(n => n + 1)
  }
  useEffect(() => {
    let active = true
    // Load the code and its textures while the atlas is being fetched and parsed.
    const world = import("./scenes/world/WorldScene").then(module => {
      module.preloadTerrainTextures()
      return module
    })
    Promise.all([loadAtlas(), world]).then(
      ([atlas, { WorldScene }]) => { if (active) setLoad({ kind: "ready", atlas, WorldScene }) },
      () => { if (active) setLoad({ kind: "failed" }) },
    )
    return () => { active = false }
  }, [attempt])
  return <main lang={locale} className={night ? "game" : "game day"} aria-label={ui.worldMap}>
    {load.kind === "ready" ? <load.WorldScene atlas={load.atlas}/> : <div className="map-loading" role="status">
      {load.kind === "loading" ? ui.dataLoading : <>{ui.mapFailed} <button onClick={retryMap}>{ui.retry}</button></>}
    </div>}
    <FrontScenes mapStatus={load.kind} retryMap={retryMap}/>
  </main>
}
