import { standardScenario } from "../../../../packages/rules/v0.1/scenario.ts"
import { visibleRunState } from "./machine.ts"
import { gamePlaybackSpeed, type GameStore } from "./store.ts"

export interface ClockHost {
  now(): number
  visible(): boolean
  after(ms: number, callback: () => void): () => void
  onVisibilityChange(callback: () => void): () => void
  onSuspensionChange?(callback: (suspended: boolean) => void): () => void
}

export interface DayClockCheckpoint {
  readonly version: 1
  readonly runId: string
  readonly rulesVersion: string
  readonly completedDay: number
  readonly elapsedAt1xMs: number
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
  onSuspensionChange(callback) {
    const suspend = () => callback(true)
    const resume = () => callback(false)
    window.addEventListener("pagehide", suspend)
    window.addEventListener("pageshow", resume)
    document.addEventListener("freeze", suspend)
    document.addEventListener("resume", resume)
    return () => {
      window.removeEventListener("pagehide", suspend)
      window.removeEventListener("pageshow", resume)
      document.removeEventListener("freeze", suspend)
      document.removeEventListener("resume", resume)
    }
  },
}

/** One owner per application root. Detaching freezes progress until this owner attaches again. */
export function createDayClock(store: GameStore, host: ClockHost = browserClock, saved?: DayClockCheckpoint) {
  const dayMs = standardScenario.rules.daySecondsAt1x * 1000
  const initialRun = visibleRunState(store.getSnapshot().scene)
  const validSaved = !!saved && !!initialRun && saved.version === 1 && initialRun.runId === saved.runId
    && initialRun.rulesVersion === saved.rulesVersion && initialRun.completedDay === saved.completedDay
    && Number.isFinite(saved.elapsedAt1xMs) && saved.elapsedAt1xMs >= 0 && saved.elapsedAt1xMs <= dayMs
  let runId: string | null = initialRun?.runId ?? null
  let completedDay = initialRun?.completedDay ?? 0
  let elapsed = validSaved ? saved.elapsedAt1xMs : 0
  let since = host.now()
  let speed = 0
  let attached = false
  let advancing = false
  let cancel: (() => void) | undefined
  let timerVersion = 0
  let attachmentVersion = 0

  function sample() {
    const now = host.now()
    elapsed += Math.max(0, now - since) * speed
    since = now
  }

  function clearTimer() {
    timerVersion++
    cancel?.()
    cancel = undefined
  }

  function schedule() {
    clearTimer()
    if (!attached || !speed) return
    const version = timerVersion
    cancel = host.after(Math.max(0, dayMs - elapsed) / speed, () => {
      if (!attached || version !== timerVersion) return
      cancel = undefined
      if (!host.visible()) {
        // Visibility events may be delayed while the browser is frozen. None of
        // the unobserved interval is charged when hidden is first detected here.
        since = host.now()
        store.dispatch({ type: "set-page-visible", visible: false })
        return
      }
      sample()
      // Bound foreground catch-up. Long freezes never leave an unbounded time debt.
      elapsed = Math.min(elapsed, 3 * dayMs)
      try {
        for (let steps = 0; elapsed >= dayMs && steps < 3; steps++) {
          const before = store.getSnapshot()
          if (before.scene.kind !== "campaign" || !gamePlaybackSpeed(before)) break
          const run = before.scene.run
          advancing = true
          try {
            store.dispatch({ type: "advance-day", runId: run.runId, completedDay: run.completedDay })
          } finally {
            advancing = false
          }
          const after = store.getSnapshot()
          const next = visibleRunState(after.scene)
          if (!next || next.runId !== run.runId || next.completedDay !== run.completedDay + 1) {
            elapsed = 0
            break
          }
          runId = next.runId
          completedDay = next.completedDay
          elapsed -= dayMs
          // A decision or any new pause is a hard boundary, including queued notice handlers.
          if (after.scene.kind !== "campaign" || !gamePlaybackSpeed(after)) {
            elapsed = 0
            break
          }
        }
      } finally {
        const state = store.getSnapshot()
        const run = visibleRunState(state.scene)
        if (run?.runId !== runId || (run?.completedDay ?? 0) !== completedDay) elapsed = 0
        runId = run?.runId ?? null
        completedDay = run?.completedDay ?? 0
        speed = state.scene.kind === "campaign" ? gamePlaybackSpeed(state) : 0
        since = host.now()
        schedule()
      }
    })
  }

  function sync() {
    if (!attached || advancing) return
    const state = store.getSnapshot()
    const run = visibleRunState(state.scene)
    const nextSpeed = state.scene.kind === "campaign" ? gamePlaybackSpeed(state) : 0
    const changedDay = (run?.runId ?? null) !== runId || (run?.completedDay ?? 0) !== completedDay
    if (!changedDay && nextSpeed === speed) return
    sample()
    if (changedDay) elapsed = 0
    runId = run?.runId ?? null
    completedDay = run?.completedDay ?? 0
    speed = nextSpeed
    schedule()
  }

  return {
    attach() {
      if (attached) throw new Error("The day clock is already attached")
      attached = true
      const version = ++attachmentVersion
      since = host.now()
      const offStore = store.subscribe(sync)
      const offVisibility = host.onVisibilityChange(() => {
        store.dispatch({ type: "set-page-visible", visible: host.visible() })
      })
      const offSuspension = host.onSuspensionChange?.(suspended => {
        store.dispatch({ type: "set-page-suspended", suspended })
        if (!suspended) store.dispatch({ type: "set-page-visible", visible: host.visible() })
      })
      store.dispatch({ type: "set-page-visible", visible: host.visible() })
      store.dispatch({ type: "set-page-suspended", suspended: false })
      sync()
      return () => {
        if (!attached || version !== attachmentVersion) return
        sample()
        attached = false
        speed = 0
        offStore()
        offVisibility()
        offSuspension?.()
        clearTimer()
      }
    },
    checkpoint(): DayClockCheckpoint | null {
      const run = visibleRunState(store.getSnapshot().scene)
      if (!run) return null
      if (attached) sample()
      return { version: 1, runId: run.runId, rulesVersion: run.rulesVersion, completedDay: run.completedDay,
        elapsedAt1xMs: run.runId === runId && run.completedDay === completedDay ? Math.min(elapsed, dayMs) : 0 }
    },
  }
}
