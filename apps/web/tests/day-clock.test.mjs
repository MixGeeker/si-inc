import assert from "node:assert/strict"
import test from "node:test"
import { advanceDay, createRun } from "../../../packages/game/run.ts"
import { createDayClock } from "../src/scenes/clock.ts"
import { visibleRunState } from "../src/scenes/machine.ts"
import { createGameStore } from "../src/scenes/store.ts"

const dayMs = 4000
const setup = { factionId: "claude", startRegionId: "as", difficultyId: "standard" }
const runOf = store => visibleRunState(store.getSnapshot().scene)

function begin(store, runId = "clock-run") {
  if (store.getSnapshot().scene.kind !== "ending") store.dispatch({ type: "open-panel", panel: "menu" })
  store.dispatch({ type: "open-setup" })
  store.dispatch({ type: "start", ...setup, seed: 42, runId })
  assert.equal(runOf(store).runId, runId)
}

function clockHost() {
  let now = 0, visible = true, timer, visibilityChanged, suspensionChanged
  const host = {
    now: () => now,
    visible: () => visible,
    after(ms, callback) {
      assert.ok(Number.isFinite(ms) && ms >= 0)
      assert.equal(timer, undefined, "one scheduled wake-up per clock")
      const scheduled = { due: now + ms, callback }
      timer = scheduled
      return () => { if (timer === scheduled) timer = undefined }
    },
    onVisibilityChange(callback) {
      assert.equal(visibilityChanged, undefined)
      visibilityChanged = callback
      return () => { if (visibilityChanged === callback) visibilityChanged = undefined }
    },
    onSuspensionChange(callback) {
      assert.equal(suspensionChanged, undefined)
      suspensionChanged = callback
      return () => { if (suspensionChanged === callback) suspensionChanged = undefined }
    },
  }
  return {
    host,
    get timer() { return timer },
    get listeners() { return Number(!!visibilityChanged) + Number(!!suspensionChanged) },
    jump(ms) { now += ms },
    fire() {
      assert.ok(timer, "a wake-up is scheduled")
      const scheduled = timer
      timer = undefined
      scheduled.callback()
    },
    elapse(ms) {
      const end = now + ms
      let wakes = 0
      while (timer && timer.due <= end) {
        assert.ok(++wakes < 1000, "clock schedules a future wake-up")
        now = Math.max(now, timer.due)
        this.fire()
      }
      now = end
    },
    setVisible(value) { visible = value; visibilityChanged?.() },
    setVisibleSilently(value) { visible = value },
    setSuspended(value) { suspensionChanged?.(value) },
  }
}

test("each selectable speed completes a day exactly at its real-time boundary", () => {
  for (const speed of [1, 2, 5]) {
    const store = createGameStore(), host = clockHost()
    begin(store)
    store.dispatch({ type: "set-speed", speed })
    const stop = createDayClock(store, host.host).attach()
    host.elapse(dayMs / speed - 1)
    assert.equal(runOf(store).completedDay, 0, `${speed}x: before the boundary`)
    host.elapse(1)
    assert.equal(runOf(store).completedDay, 1, `${speed}x: at the boundary`)
    stop()
  }
})

test("a rejected 10x speed request leaves the active 5x clock interval unchanged", () => {
  const store = createGameStore(), host = clockHost()
  begin(store)
  store.dispatch({ type: "set-speed", speed: 5 })
  const stop = createDayClock(store, host.host).attach()
  host.elapse(200)
  const before = store.getSnapshot(), timer = host.timer
  store.dispatch({ type: "set-speed", speed: 10 })
  assert.strictEqual(store.getSnapshot(), before)
  assert.strictEqual(host.timer, timer)
  host.elapse(599)
  assert.equal(runOf(store).completedDay, 0)
  host.elapse(1)
  assert.equal(runOf(store).completedDay, 1)
  stop()
})

test("late foreground wake-ups settle at most three days and discard excess debt", () => {
  const store = createGameStore(), host = clockHost()
  begin(store)
  const clock = createDayClock(store, host.host)
  const stop = clock.attach()
  host.jump(dayMs * 10 + 500)
  host.fire()
  assert.equal(runOf(store).completedDay, 3)
  host.elapse(dayMs - 1)
  assert.equal(runOf(store).completedDay, 3)
  host.elapse(1)
  assert.equal(runOf(store).completedDay, 4)
  stop()
})

test("manual pause and a changed speed preserve the same fraction of a day", () => {
  const store = createGameStore(), host = clockHost()
  begin(store)
  const stop = createDayClock(store, host.host).attach()
  host.elapse(1000)
  store.dispatch({ type: "set-paused", paused: true })
  store.dispatch({ type: "set-speed", speed: 5 })
  assert.equal(host.timer, undefined)
  host.elapse(60_000)
  store.dispatch({ type: "set-paused", paused: false })
  host.elapse(599)
  assert.equal(runOf(store).completedDay, 0)
  host.elapse(1)
  assert.equal(runOf(store).completedDay, 1)
  stop()
})

test("detach and attach retain partial progress and release all external listeners", () => {
  const store = createGameStore(), host = clockHost()
  begin(store)
  const clock = createDayClock(store, host.host)
  let stop = clock.attach()
  host.elapse(800)
  const stale = host.timer.callback
  stop()
  assert.equal(host.timer, undefined)
  assert.equal(host.listeners, 0)
  host.jump(60_000)
  stale()
  assert.equal(runOf(store).completedDay, 0)
  stop = clock.attach()
  host.elapse(3199)
  assert.equal(runOf(store).completedDay, 0)
  host.elapse(1)
  assert.equal(runOf(store).completedDay, 1)
  stop()
})

test("a JSON checkpoint restores only the matching run and settled day", () => {
  const store = createGameStore(), host = clockHost()
  begin(store)
  const clock = createDayClock(store, host.host)
  const stop = clock.attach()
  host.elapse(1200)
  const checkpoint = JSON.parse(JSON.stringify(clock.checkpoint()))
  assert.ok(checkpoint && Object.getPrototypeOf(checkpoint) === Object.prototype)
  stop()
  host.jump(60_000)
  let stopRestored = createDayClock(store, host.host, checkpoint).attach()
  host.elapse(2799)
  assert.equal(runOf(store).completedDay, 0)
  host.elapse(1)
  assert.equal(runOf(store).completedDay, 1)
  stopRestored()

  // The same run has moved beyond this checkpoint's settled boundary.
  stopRestored = createDayClock(store, host.host, checkpoint).attach()
  host.elapse(dayMs - 1)
  assert.equal(runOf(store).completedDay, 1)
  host.elapse(1)
  assert.equal(runOf(store).completedDay, 2)
  stopRestored()

  store.dispatch({ type: "finish", outcome: "human-victory" })
  begin(store, "another-run-with-the-same-seed")
  stopRestored = createDayClock(store, host.host, checkpoint).attach()
  host.elapse(dayMs - 1)
  assert.equal(runOf(store).completedDay, 0)
  host.elapse(1)
  assert.equal(runOf(store).completedDay, 1)
  stopRestored()
})

test("unsupported and malformed checkpoints cannot inject partial-day progress", () => {
  const source = createGameStore(), sourceHost = clockHost()
  begin(source)
  const clock = createDayClock(source, sourceHost.host)
  const stop = clock.attach()
  sourceHost.elapse(1200)
  const checkpoint = clock.checkpoint()
  stop()
  for (const change of [
    { version: 2 }, { rulesVersion: "unknown-rules" },
    { elapsedAt1xMs: -1 }, { elapsedAt1xMs: dayMs + 1 },
    { elapsedAt1xMs: NaN }, { elapsedAt1xMs: Infinity }, { elapsedAt1xMs: "1200" },
  ]) {
    const store = createGameStore(), host = clockHost()
    begin(store)
    const stopRestored = createDayClock(store, host.host, { ...checkpoint, ...change }).attach()
    host.elapse(dayMs - 1)
    assert.equal(runOf(store).completedDay, 0)
    host.elapse(1)
    assert.equal(runOf(store).completedDay, 1)
    stopRestored()
  }
})

test("visibility and suspension pause together without charging background time", () => {
  const store = createGameStore(), host = clockHost()
  begin(store)
  const stop = createDayClock(store, host.host).attach()
  host.elapse(500)
  host.setVisible(false)
  assert.equal(store.getSnapshot().environment.visible, false)
  host.elapse(5000)
  host.setSuspended(true)
  host.setVisible(true)
  assert.deepEqual(store.getSnapshot().environment, { visible: true, suspended: true })
  assert.equal(host.timer, undefined)
  host.elapse(60_000)
  assert.equal(runOf(store).completedDay, 0)
  host.setSuspended(false)
  host.elapse(3499)
  assert.equal(runOf(store).completedDay, 0)
  host.elapse(1)
  assert.equal(runOf(store).completedDay, 1)
  stop()
})

test("a timer that discovers a hidden page preserves only observed partial-day progress", () => {
  const store = createGameStore(), host = clockHost()
  begin(store)
  const clock = createDayClock(store, host.host)
  const stop = clock.attach()
  host.elapse(500)
  assert.equal(clock.checkpoint().elapsedAt1xMs, 500)
  host.setVisibleSilently(false)
  host.jump(dayMs * 10)
  host.fire()
  assert.equal(runOf(store).completedDay, 0)
  assert.equal(store.getSnapshot().environment.visible, false)
  assert.equal(host.timer, undefined)
  host.setVisible(true)
  host.elapse(3499)
  assert.equal(runOf(store).completedDay, 0)
  host.elapse(1)
  assert.equal(runOf(store).completedDay, 1)
  stop()
})

test("an automatic decision stops catch-up and resumes from a complete day", () => {
  let expected = createRun(setup, 42, "decision-clock")
  while (expected.completedDay < 200 && !expected.events.some(e => e.content.kind === "decision")) expected = advanceDay(expected)
  assert.ok(expected.events.some(e => e.content.kind === "decision"))
  const decisionDay = expected.completedDay
  const store = createGameStore(), host = clockHost()
  begin(store, "decision-clock")
  while (runOf(store).completedDay < decisionDay - 1) {
    store.dispatch({ type: "advance-day", runId: runOf(store).runId, completedDay: runOf(store).completedDay })
  }
  const stop = createDayClock(store, host.host).attach()
  host.jump(dayMs * 2 + 1000)
  host.fire()
  assert.equal(store.getSnapshot().scene.kind, "decision")
  assert.equal(runOf(store).completedDay, decisionDay)
  assert.equal(host.timer, undefined)
  store.dispatch({ type: "back" })
  host.elapse(dayMs - 1)
  assert.equal(runOf(store).completedDay, decisionDay)
  host.elapse(1)
  assert.equal(runOf(store).completedDay, decisionDay + 1)
  stop()
})

test("ending interrupts catch-up and a same-seed new run rejects the old timer", () => {
  const store = createGameStore(), host = clockHost()
  begin(store, "old-clock-run")
  const clock = createDayClock(store, host.host)
  const stop = clock.attach()
  const stale = host.timer.callback
  const stopEnding = store.on("advance-day", () => store.dispatch({ type: "finish", outcome: "human-victory" }))
  host.jump(dayMs * 3)
  host.fire()
  assert.equal(store.getSnapshot().scene.kind, "ending")
  assert.equal(runOf(store).completedDay, 1)
  assert.equal(host.timer, undefined)
  stopEnding()
  begin(store, "new-clock-run")
  stale()
  assert.equal(runOf(store).completedDay, 0)
  host.elapse(dayMs - 1)
  assert.equal(runOf(store).completedDay, 0)
  host.elapse(1)
  assert.equal(runOf(store).completedDay, 1)
  stop()
})
