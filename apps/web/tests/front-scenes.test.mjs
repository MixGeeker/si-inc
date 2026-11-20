import assert from "node:assert/strict"
import test from "node:test"
import { initialScene, playbackSpeed, sceneReducer, visibleRun, visibleRunState } from "../src/scenes/machine.ts"
import { createGameStore, gamePlaybackSpeed, pauseReasons } from "../src/scenes/store.ts"

const selection = { factionId: "claude", startRegionId: "as" }
const start = { type: "start", ...selection, difficultyId: "standard", seed: 42, runId: "front-scenes-run" }
const back = { type: "back" }
const openMenu = { type: "open-panel", panel: "menu" }
const openStart = { type: "open-start" }
const openSettings = { type: "open-settings" }
const openSetup = { type: "open-setup" }
const openDifficulty = { type: "open-difficulty", ...selection }
const front = sceneReducer(initialScene, openStart)
const setup = sceneReducer(front, openSetup)
const difficulty = sceneReducer(setup, openDifficulty)
const campaign = sceneReducer(difficulty, start)

test("the start screen pauses its exact preview and settings return to their exact caller", () => {
  assert.equal(initialScene.kind, "preview")
  for (const preview of [
    initialScene,
    sceneReducer(sceneReducer(initialScene, { type: "set-speed", speed: 5 }), openMenu),
  ]) {
    const scene = sceneReducer(preview, openStart)
    assert.equal(scene.kind, "start")
    assert.strictEqual(scene.back, preview)
    assert.equal(playbackSpeed(scene), 0)
    assert.equal(visibleRunState(scene), null)
    const settings = sceneReducer(scene, openSettings)
    assert.equal(settings.kind, "settings")
    assert.equal(playbackSpeed(settings), 0)
    assert.strictEqual(sceneReducer(settings, back), scene)
    assert.strictEqual(sceneReducer(scene, back), preview)
  }
  for (const menu of [sceneReducer(initialScene, openMenu), sceneReducer(campaign, openMenu)]) {
    const settings = sceneReducer(menu, openSettings)
    assert.equal(settings.kind, "settings")
    assert.strictEqual(sceneReducer(settings, back), menu)
    assert.strictEqual(visibleRunState(settings), visibleRunState(menu))
  }
})

test("front navigation rejects entry from unrelated panels and already-open front screens", () => {
  const ending = sceneReducer(campaign, { type: "finish", outcome: "human-victory" })
  const settings = sceneReducer(front, openSettings)
  const news = sceneReducer(campaign, { type: "open-panel", panel: "news" })
  const decision = sceneReducer(news, { type: "open-decision", id: "unexpected-coding" })
  const previewWorld = sceneReducer(initialScene, { type: "open-panel", panel: "world" })
  const cases = [
    [openStart, [front, setup, difficulty, settings, campaign, ending, decision, previewWorld]],
    [openSettings, [initialScene, setup, difficulty, settings, campaign, ending, decision, previewWorld]],
    [openSetup, [initialScene, setup, difficulty, settings, campaign, decision, previewWorld]],
    [openDifficulty, [initialScene, front, difficulty, settings, campaign, ending, decision]],
  ]
  for (const [event, scenes] of cases) {
    for (const scene of scenes) assert.strictEqual(sceneReducer(scene, event), scene, `${event.type} in ${scene.kind}`)
  }
})

test("difficulty confirms valid faction and continent in setup and Back preserves the confirmation", () => {
  assert.equal(setup.kind, "setup")
  assert.equal(setup.selection, undefined)
  for (const override of [
    { factionId: "missing" }, { factionId: "__proto__" }, { factionId: ["claude"] },
    { startRegionId: "UKR" }, { startRegionId: "ee" }, { startRegionId: "__proto__" }, { startRegionId: ["as"] },
  ]) assert.strictEqual(sceneReducer(setup, { ...openDifficulty, ...override }), setup)
  assert.equal(difficulty.kind, "difficulty")
  assert.equal("selection" in difficulty, false)
  assert.deepEqual(difficulty.back.selection, selection)
  assert.strictEqual(difficulty.back.back, front)
  assert.equal(setup.selection, undefined, "confirmation leaves the earlier snapshot untouched")
  const confirmedSetup = sceneReducer(difficulty, back)
  assert.strictEqual(confirmedSetup, difficulty.back)
  const changed = sceneReducer(confirmedSetup, { ...openDifficulty, factionId: "gpt", startRegionId: "eu" })
  assert.deepEqual(changed.back.selection, { factionId: "gpt", startRegionId: "eu" })
  assert.deepEqual(confirmedSetup.selection, selection)
  assert.strictEqual(sceneReducer(sceneReducer(changed, back), back), front)
})

test("only the confirmed difficulty selection starts a run while direct setup remains a programming entry", () => {
  for (const override of [
    { factionId: "gpt" }, { startRegionId: "eu" }, { difficultyId: "sandbox" },
    { seed: -1 }, { runId: "" },
  ]) assert.strictEqual(sceneReducer(difficulty, { ...start, ...override }), difficulty)
  for (const scene of [front, sceneReducer(front, openSettings)]) assert.strictEqual(sceneReducer(scene, start), scene)
  assert.equal(campaign.kind, "campaign")
  assert.deepEqual(campaign.run.setup, { ...selection, difficultyId: "standard" })
  assert.equal(campaign.run.runId, start.runId)
  assert.equal(campaign.run.completedDay, 0)
  assert.strictEqual(sceneReducer(campaign, start), campaign)
  assert.equal(sceneReducer(setup, start).kind, "campaign")
  const fromMenu = sceneReducer(sceneReducer(initialScene, openMenu), openSetup)
  assert.equal(sceneReducer(fromMenu, start).kind, "campaign")
})

test("restart prefills the previous choice and nested scenes retain the ending snapshot until a new start", () => {
  const ending = sceneReducer(campaign, { type: "finish", outcome: "human-victory" })
  const restart = sceneReducer(ending, openSetup)
  assert.deepEqual(restart.selection, selection)
  assert.strictEqual(visibleRunState(restart), ending.run)
  const ready = sceneReducer(restart, openDifficulty)
  assert.strictEqual(visibleRunState(ready), ending.run)
  assert.deepEqual(visibleRun(ready), ending.run.setup)
  assert.strictEqual(sceneReducer(sceneReducer(ready, back), back), ending)
  const next = sceneReducer(ready, { ...start, runId: "front-scenes-restart" })
  assert.equal(next.kind, "campaign")
  assert.notStrictEqual(next.run, ending.run)
  assert.equal(next.run.runId, "front-scenes-restart")
  assert.equal(ending.run.runId, start.runId)
})

test("global settings commit independently and preserve campaign controls and the visible run", () => {
  const store = createGameStore(undefined, "en", true)
  store.dispatch(openStart)
  store.dispatch(openSetup)
  store.dispatch(openDifficulty)
  store.dispatch(start)
  store.dispatch({ type: "set-speed", speed: 5 })
  store.dispatch({ type: "set-paused", paused: true })
  store.dispatch(openMenu)
  const menu = store.getSnapshot().scene
  store.dispatch(openSettings)
  assert.equal(store.getSnapshot().scene.kind, "settings")
  assert.equal(gamePlaybackSpeed(store.getSnapshot()), 0)
  assert.ok(pauseReasons(store.getSnapshot()).includes("settings"))
  assert.strictEqual(visibleRunState(store.getSnapshot().scene), menu.run)
  store.dispatch({ type: "set-locale", locale: "zh-CN" })
  store.dispatch({ type: "set-sound-volume", volume: 24 })
  store.dispatch({ type: "set-sound-muted", muted: true })
  store.dispatch({ type: "set-layer", layer: "cloud", enabled: false })
  const settings = store.getSnapshot()
  for (const event of [
    { type: "advance-day", runId: menu.run.runId, completedDay: 0 },
    { type: "dev-step-day", runId: menu.run.runId, completedDay: 0 },
    { type: "set-developer-open", open: true },
  ]) {
    store.dispatch(event)
    assert.strictEqual(store.getSnapshot(), settings)
  }
  store.dispatch(back)
  assert.strictEqual(store.getSnapshot().scene, menu)
  store.dispatch(back)
  assert.equal(store.getSnapshot().scene.speed, 5)
  assert.equal(store.getSnapshot().scene.manualPaused, true)
  assert.equal(gamePlaybackSpeed(store.getSnapshot()), 0)
  assert.equal(store.getSnapshot().locale, "zh-CN")
  assert.deepEqual(store.getSnapshot().sound, { muted: true, volume: 24 })
  assert.equal(store.getSnapshot().layers.cloud, false)
})

test("front scenes close developer tools, reject reopening them and emit one start notice", () => {
  const store = createGameStore(undefined, "en", true)
  const started = []
  const off = store.on("run-started", notice => started.push(notice))
  store.dispatch({ type: "set-developer-open", open: true })
  assert.equal(store.getSnapshot().developer.open, true)
  for (const event of [openStart, openSettings, back, openSetup, openDifficulty]) {
    store.dispatch(event)
    const snapshot = store.getSnapshot()
    assert.equal(snapshot.developer.open, false)
    assert.equal(gamePlaybackSpeed(snapshot), 0)
    assert.ok(pauseReasons(snapshot).includes(snapshot.scene.kind))
    store.dispatch({ type: "set-developer-open", open: true })
    assert.strictEqual(store.getSnapshot(), snapshot)
    assert.equal(started.length, 0)
  }
  const ready = store.getSnapshot()
  store.dispatch({ ...start, startRegionId: "eu" })
  assert.strictEqual(store.getSnapshot(), ready)
  store.dispatch(start)
  assert.equal(started.length, 1)
  assert.equal(started[0].runId, start.runId)
  store.dispatch(start)
  assert.equal(started.length, 1)
  off()
})
