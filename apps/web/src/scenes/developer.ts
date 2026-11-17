import { nextEventDay } from "../../../../packages/game/run.ts"
import type { GameStore } from "./store.ts"

const preferenceKey = "singularity-inc.developer.v1"

export function readDeveloperEnabled() {
  try { return window.localStorage.getItem(preferenceKey) === "true" }
  catch { return false }
}

export function attachDeveloperPreference(store: GameStore) {
  return store.on("set-developer-enabled", (_, { developer }) => {
    try { window.localStorage.setItem(preferenceKey, String(developer.enabled)) }
    catch { /* The preference still applies to this session. */ }
  })
}

export function stepDeveloperRun(store: GameStore, untilEvent = false) {
  const { scene, developer } = store.getSnapshot()
  if (!developer.open || scene.kind !== "campaign" || scene.panel !== null) return
  const { run } = scene
  const stop = untilEvent ? nextEventDay(run) : run.completedDay + 1
  if (stop === null) return
  for (let day = run.completedDay; day < stop; day++) {
    const current = store.getSnapshot().scene
    if (current.kind !== "campaign" || current.run.setup !== run.setup || current.run.completedDay !== day) break
    store.dispatch({ type: "dev-step-day", runId: run.runId, completedDay: day })
    const next = store.getSnapshot().scene
    if (untilEvent && (next.kind !== "campaign" || next.run.events.length !== run.events.length)) break
  }
}
