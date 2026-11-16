import { standardScenario } from "../../../../packages/rules/v0.1/scenario.ts"
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
  const stop = untilEvent ? Math.min(run.schedule.nextWeek, standardScenario.rules.maxWeeks) : run.completedWeek + 1
  for (let week = run.completedWeek; week < stop; week++) {
    const current = store.getSnapshot().scene
    if (current.kind !== "campaign" || current.run.setup !== run.setup || current.run.completedWeek !== week) break
    store.dispatch({ type: "dev-step-week", seed: run.seed, completedWeek: week })
  }
}
