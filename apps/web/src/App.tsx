import { useEffect, useState } from "react"
import { loadAtlas, type Atlas } from "./cartography/atlas"
import { useGameSnapshot } from "./scenes/GameContext"
import { useLanguage } from "./i18n/useLanguage"
import { WorldScene } from "./scenes/world/WorldScene"

type MapLoad = { kind: "loading" } | { kind: "failed" } | { kind: "ready"; atlas: Atlas }

export default function App() {
  const { ui, locale } = useLanguage()
  const night = useGameSnapshot(state => state.layers.night)
  const [load, setLoad] = useState<MapLoad>({ kind: "loading" })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    loadAtlas().then(
      atlas => { if (active) setLoad({ kind: "ready", atlas }) },
      () => { if (active) setLoad({ kind: "failed" }) },
    )
    return () => { active = false }
  }, [attempt])
  return <main lang={locale} className={night ? "game" : "game day"} aria-label={ui.worldMap}>
    {load.kind === "ready" ? <WorldScene atlas={load.atlas}/> : <div className="map-loading" role="status">
      {load.kind === "loading" ? ui.dataLoading : <>{ui.mapFailed} <button onClick={() => {
        setLoad({ kind: "loading" }); setAttempt(n => n + 1)
      }}>{ui.retry}</button></>}
    </div>}
  </main>
}
