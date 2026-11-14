import assert from "node:assert/strict"
import test from "node:test"
import { standardScenario } from "../../../packages/rules/v0.1/scenario.ts"
import { attachWeekClock } from "../src/scenes/clock.ts"
import { createGameStore } from "../src/scenes/store.ts"

const start = { type: "start", factionId: "claude", startRegionId: "sea", difficultyId: "standard", seed: 42 }
const panel = name => ({ type: "open-panel", panel: name })
function startGame(store) {
  store.dispatch(panel("menu"))
  store.dispatch({ type: "open-setup" })
  store.dispatch(start)
}

test("shared snapshots are immutable and isolated; queued events survive a failing observer", () => {
  const store = createGameStore()
  const other = createGameStore()
  const order = []
  const stop = store.on("open-panel", (event, snapshot) => {
    order.push(event.type, snapshot.scene.panel)
    store.dispatch({ type: "back" })
    throw Error("observer failed")
  })
  store.on("open-panel", () => order.push(store.getSnapshot().scene.panel))
  store.on("back", () => order.push(store.getSnapshot().scene.panel))
  let commits = 0
  const unsubscribe = store.subscribe(() => commits++)
  const initial = store.getSnapshot()
  store.dispatch(start)
  store.dispatch(panel("invalid"))
  assert.strictEqual(store.getSnapshot(), initial)
  assert.throws(() => store.dispatch(panel("world")), AggregateError)
  assert.deepEqual(order, ["open-panel", "world", "world", null])
  assert.equal(commits, 2)
  stop()
  unsubscribe()
  const selection = { lon: 10, lat: 5, countryId: null }
  store.dispatch({ type: "pick-location", selection })
  const picked = store.getSnapshot()
  store.dispatch({ type: "pick-location", selection: { ...selection } })
  store.dispatch({ type: "pick-location", selection: null })
  assert.strictEqual(store.getSnapshot(), picked)
  selection.lat = 30
  assert.equal(store.getSnapshot().selection.lat, 5)
  assert.throws(() => { store.getSnapshot().selection.lat = 10 }, TypeError)
  store.dispatch({ type: "set-layer", layer: "night", enabled: false })
  assert.equal(commits, 2)
  assert.equal(other.getSnapshot().layers.night, true)
  assert.equal(initial.layers.night, true)
})

test("preview, postponement and retries preserve one settlement and one terminal notification", () => {
  const store = createGameStore()
  const notices = []
  for (const name of ["run-started", "event-occurred", "decision-resolved", "run-ended"]) {
    store.on(name, event => notices.push(event))
  }
  startGame(store)
  const scene = () => store.getSnapshot().scene
  const tick = () => ({ type: "advance-week", seed: start.seed, completedWeek: scene().run.completedWeek })
  const id = "unexpected-coding"
  store.dispatch(panel("news"))
  store.dispatch({ type: "open-decision", id })
  store.dispatch({ type: "choose", id, choiceId: "rollback" })
  assert.equal(scene().run.balance, standardScenario.rules.initialBtoken)
  assert.deepEqual(scene().run.commands, [])
  store.dispatch({ type: "back" })
  const first = tick()
  store.dispatch(first)
  store.dispatch(first)
  assert.equal(scene().run.completedWeek, 1)
  while (scene().kind === "campaign") store.dispatch(tick())
  assert.equal(scene().kind, "decision")
  const { instanceId } = scene()
  const before = scene().back.run
  store.dispatch({ type: "back" })
  store.dispatch(panel("news"))
  store.dispatch({ type: "open-decision", id, instanceId })
  store.dispatch({ type: "choose", id, instanceId: "stale", choiceId: "rollback" })
  assert.strictEqual(scene().back.run, before)
  const choice = { type: "choose", id, instanceId, choiceId: "rollback" }
  store.dispatch(choice)
  store.dispatch(choice)
  store.dispatch({ type: "open-decision", id, instanceId })
  assert.equal(scene().kind, "campaign")
  assert.equal(scene().run.balance, before.balance - 4)
  assert.equal(scene().run.commands.length, 1)
  assert.deepEqual(notices.filter(n => n.type === "decision-resolved").map(n => n.command), scene().run.commands)
  assert.deepEqual(notices.filter(n => n.type === "event-occurred").map(n => n.entry.instanceId), before.events.map(e => e.instanceId))
  while (scene().kind !== "ending") {
    if (scene().kind === "decision") store.dispatch({ type: "back" })
    else store.dispatch(tick())
  }
  const ending = scene()
  assert.equal(ending.run.completedWeek, standardScenario.rules.maxWeeks)
  assert.equal(ending.outcome, "timeout")
  store.dispatch({ type: "finish", outcome: "timeout" })
  store.dispatch({ type: "open-setup" })
  store.dispatch({ type: "back" })
  assert.strictEqual(scene(), ending)
  assert.equal(notices.filter(n => n.type === "run-ended").length, 1)
  store.dispatch({ type: "open-setup" })
  store.dispatch(start)
  assert.equal(scene().run.completedWeek, 0)
  assert.equal(scene().run.balance, standardScenario.rules.initialBtoken)
  assert.deepEqual(scene().run.events, [])
  assert.equal(notices.filter(n => n.type === "run-started").length, 2)
})

test("the clock preserves fractional weeks across speed, menu and tab changes and detaches cleanly", () => {
  let now = 0, visible = true, timer, visibilityChanged
  const store = createGameStore()
  const stop = attachWeekClock(store, {
    now: () => now, visible: () => visible,
    after(ms, callback) {
      assert.equal(timer, undefined)
      timer = { due: now + ms, callback }
      return () => { timer = undefined }
    },
    onVisibilityChange(callback) {
      visibilityChanged = callback
      return () => { visibilityChanged = undefined }
    },
  })
  function elapse(ms) {
    const end = now + ms
    while (timer && timer.due <= end) {
      now = timer.due
      const { callback } = timer
      timer = undefined
      callback()
    }
    now = end
  }
  const week = () => store.getSnapshot().scene.run.completedWeek
  startGame(store)
  const staleTick = timer.callback
  elapse(1000)
  store.dispatch({ type: "set-speed", speed: 2 })
  staleTick()
  assert.equal(week(), 0)
  elapse(500)
  store.dispatch(panel("menu"))
  elapse(60000)
  assert.equal(week(), 0)
  store.dispatch({ type: "back" })
  elapse(500)
  visible = false
  visibilityChanged()
  elapse(60000)
  visible = true
  visibilityChanged()
  elapse(499)
  assert.equal(week(), 0)
  elapse(1)
  assert.equal(week(), 1)
  store.dispatch({ type: "set-speed", speed: 0 })
  elapse(8000)
  assert.equal(week(), 1)
  store.dispatch({ type: "set-speed", speed: 2 })
  elapse(2000)
  assert.equal(week(), 2)
  assert.equal(store.getSnapshot().scene.run.balance, standardScenario.rules.initialBtoken + 1)
  stop()
  assert.equal(visibilityChanged, undefined)
  elapse(60000)
  assert.equal(week(), 2)
})
