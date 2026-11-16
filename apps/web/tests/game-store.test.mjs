import assert from "node:assert/strict"
import test from "node:test"
import { standardScenario } from "../../../packages/rules/v0.1/scenario.ts"
import { attachWeekClock } from "../src/scenes/clock.ts"
import { createGameStore, selectedPlace } from "../src/scenes/store.ts"

const start = { type: "start", factionId: "claude", startRegionId: "as", difficultyId: "standard", seed: 42 }
const panel = name => ({ type: "open-panel", panel: name })
function startGame(store, startRegionId = start.startRegionId) {
  store.dispatch(panel("menu"))
  store.dispatch({ type: "open-setup" })
  store.dispatch({ ...start, startRegionId })
}

const market = id => ({ kind: "market", id })
const focus = id => ({ type: "focus-place", place: id === null ? null : market(id) })
const pick = (countryId, lon, lat) => ({ type: "pick-location", selection: { countryId, lon, lat } })

test("setup, global cards and the directory each open one continent with no second selection", () => {
  for (const id of ["na", "sam", "eu", "as", "af", "oc"]) {
    const store = createGameStore()
    const snapshot = store.getSnapshot
    startGame(store, id)
    const opened = snapshot()
    assert.equal(opened.scene.run.setup.startRegionId, id)
    assert.deepEqual(opened.selection, market(id))
    store.dispatch(focus(id))
    assert.strictEqual(snapshot(), opened)
    store.dispatch(focus(null))
    assert.equal(snapshot().selection, null)
    store.dispatch(focus(id))
    assert.deepEqual(snapshot().selection, market(id))
    store.dispatch(focus(null))
    store.dispatch(panel("region"))
    store.dispatch(focus(id))
    assert.equal(snapshot().scene.panel, null)
    assert.deepEqual(snapshot().selection, market(id))
    assert.strictEqual(snapshot().scene.run, opened.scene.run)
  }
})

test("map picks select continents in preview and campaign, including all of Russia in Asia", () => {
  for (const started of [false, true]) {
    const store = createGameStore()
    if (started) startGame(store, "eu")
    for (const [countryId, lon, lat, id] of [
      ["FRA", 2, 47, "eu"], ["RUS", 37.6, 55.75, "as"], ["EGY", 31, 27, "af"],
      ["RUS", 132, 44, "as"], ["PAN", -81, 8, "na"], ["COL", -73, 4, "sam"], ["PNG", 145, -7, "oc"],
    ]) {
      store.dispatch(pick(countryId, lon, lat))
      assert.deepEqual(store.getSnapshot().selection, market(id))
    }
    store.dispatch(pick("RUS", 20.5, 54.7))
    const asia = store.getSnapshot()
    store.dispatch(pick("JPN", 137, 36))
    store.dispatch(pick("RUS", 100, 60))
    assert.strictEqual(store.getSnapshot(), asia)
    for (const marker of [{ countryId: "FRA", lon: 2, lat: 47, site: "法国算力站" },
      { countryId: "CHN", lon: 114.4, lat: 10.3, islandName: "南沙群岛" }]) {
      store.dispatch({ type: "pick-location", selection: marker })
      assert.deepEqual(store.getSnapshot().selection, marker)
      assert.deepEqual(selectedPlace(marker), market(marker.site ? "eu" : "as"))
    }
    for (const countryId of ["ATA", null]) {
      const point = { countryId, lon: 0, lat: -80 }
      store.dispatch({ type: "pick-location", selection: point })
      assert.deepEqual(store.getSnapshot().selection, point)
      assert.equal(selectedPlace(point), null)
    }
    assert.deepEqual(selectedPlace({ lon: 37.6, lat: 55.75 }, "RUS"), market("as"))
  }
})

test("stale subregions, countries and invalid navigation events leave the current snapshot intact", () => {
  const store = createGameStore()
  const snapshot = store.getSnapshot
  const preview = snapshot()
  store.dispatch(focus("af"))
  assert.strictEqual(snapshot(), preview)
  store.dispatch(panel("region"))
  const directory = snapshot()
  for (const place of [market("ee"), market("ea"), market("sa"), market("RUS"), market("__proto__"),
    market(["eu"]), { kind: "area", id: "europe" }, { kind: "country", id: "RUS" }, null, undefined]) {
    store.dispatch({ type: "focus-place", place })
  }
  store.dispatch({ type: "focus-country", selection: { countryId: "RUS", lon: 37.6, lat: 55.75 } })
  store.dispatch(pick("RUS", 37.6, 55.75))
  assert.strictEqual(snapshot(), directory)
  store.dispatch(focus("as"))
  assert.equal(snapshot().scene.panel, null)
  assert.deepEqual(snapshot().selection, market("as"))
  startGame(store, "latam")
  const run = snapshot().scene.run
  assert.deepEqual(snapshot().selection, market("sam"))
  store.dispatch(panel("news"))
  const news = snapshot()
  store.dispatch(focus("af"))
  assert.strictEqual(snapshot(), news)
  store.dispatch({ type: "back" })
  store.dispatch(panel("world"))
  store.dispatch({ type: "map-preset", view: "europe" })
  assert.deepEqual(snapshot().selection, market("eu"))
  store.dispatch({ type: "map-preset", view: "global" })
  const global = snapshot()
  assert.equal(global.selection, null)
  store.dispatch({ type: "map-preset", view: "global" })
  store.dispatch({ type: "map-preset", view: "europe" })
  assert.strictEqual(snapshot(), global)
  assert.strictEqual(snapshot().scene.run, run)
})

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
