import { standardScenario } from "../../../../packages/rules/v0.1/scenario.ts"
import { playbackSpeed, visibleRunState, type RunSetup } from "./machine.ts"
import type { GameStore } from "./store.ts"

interface ClockHost {
  now(): number
  visible(): boolean
  after(ms: number, callback: () => void): () => void
  onVisibilityChange(callback: () => void): () => void
}

const browserClock: ClockHost = {
  now: () => performance.now(),
  visible: () => !document.hidden,
  after(ms, callback) {
    const timer = window.setTimeout(callback, ms)
    return () => window.clearTimeout(timer)
  },
  onVisibilityChange(callback) {
    document.addEventListener("visibilitychange", callback)
    return () => document.removeEventListener("visibilitychange", callback)
  },
}

/** Keep partial weeks across speed changes and pauses. A background tab never catches up. */
export function attachWeekClock(store: GameStore, host: ClockHost = browserClock) {
  const weekMs = standardScenario.rules.weekSecondsAt1x * 1000
  let setup: RunSetup | null = null
  let completedWeek = 0
  let speed = 0
  let remaining = weekMs
  let since = host.now()
  let cancel: (() => void) | undefined
  let timerVersion = 0

  function sync() {
    const { scene } = store.getSnapshot()
    const run = visibleRunState(scene)
    const nextSetup = run?.setup ?? null
    const nextWeek = run?.completedWeek ?? 0
    const nextSpeed = scene.kind === "campaign" && host.visible() ? playbackSpeed(scene) : 0
    const newWeek = nextSetup !== setup || nextWeek !== completedWeek
    if (!newWeek && nextSpeed === speed) return
    const now = host.now()
    remaining = newWeek ? weekMs : Math.max(0, remaining - (now - since) * speed)
    cancel?.()
    cancel = undefined
    const version = ++timerVersion
    since = now
    setup = nextSetup
    completedWeek = nextWeek
    speed = nextSpeed
    if (speed && run) {
      const tick = { type: "advance-week", seed: run.seed, completedWeek: nextWeek } as const
      cancel = host.after(remaining / speed, () => {
        if (version !== timerVersion) return
        if (host.visible()) store.dispatch(tick)
        else sync()
      })
    }
  }

  const stopStore = store.subscribe(sync)
  const stopVisibility = host.onVisibilityChange(sync)
  sync()
  return () => {
    timerVersion++
    stopStore()
    stopVisibility()
    cancel?.()
    cancel = undefined
  }
}
