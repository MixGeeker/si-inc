import { useEffect, useState } from "react"
import { loadAtlas, type Atlas } from "./cartography/atlas"
import { WorldScene } from "./scenes/world/WorldScene"

type MapLoad = { kind: "loading" } | { kind: "failed" } | { kind: "ready"; atlas: Atlas }

export default function App() {
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
  return <main className="game" aria-label="世界地图">
    {load.kind === "ready" ? <WorldScene atlas={load.atlas}/> : <div className="map-loading" role="status">
      {load.kind === "loading" ? "正在读取地形与海气数据…" : <>地图读取失败 <button onClick={() => {
        setLoad({ kind: "loading" }); setAttempt(n => n + 1)
      }}>重试</button></>}
    </div>}
  </main>
}
