import assert from "node:assert/strict"
import test from "node:test"
import { nextCommandSeq } from "../../../packages/game/run.ts"
import { btoken } from "../../../packages/rules/v0.1/economy/btoken.ts"
import { languages } from "../src/i18n/languages.ts"
import { visibleRunState } from "../src/scenes/machine.ts"
import { createGameStore, forkDeveloperStore, gamePlaybackSpeed, pauseReasons } from "../src/scenes/store.ts"
import { hudContent } from "../src/scenes/world/hudContent.ts"

const start = { type: "start", runId: "ops-ui-flow", seed: 42, factionId: "gpt", startRegionId: "na", difficultyId: "standard" }
const runOf = store => visibleRunState(store.getSnapshot().scene)

function begin(store) {
  store.dispatch({ type: "open-panel", panel: "menu" })
  store.dispatch({ type: "open-setup" })
  store.dispatch(start)
}

test("actions panel is campaign-only, pauses playback independently, and preserves speed and manual pause", () => {
  const store = createGameStore()
  const preview = store.getSnapshot()
  store.dispatch({ type: "open-panel", panel: "actions" })
  assert.strictEqual(store.getSnapshot(), preview)

  begin(store)
  store.dispatch({ type: "set-speed", speed: 5 })
  assert.equal(gamePlaybackSpeed(store.getSnapshot()), 5)

  store.dispatch({ type: "open-panel", panel: "actions" })
  assert.equal(store.getSnapshot().scene.panel, "actions")
  assert.deepEqual(pauseReasons(store.getSnapshot()), ["actions"])
  assert.equal(gamePlaybackSpeed(store.getSnapshot()), 0)

  store.dispatch({ type: "set-speed", speed: 2 })
  store.dispatch({ type: "set-paused", paused: true })
  assert.deepEqual(pauseReasons(store.getSnapshot()), ["manual", "actions"])

  store.dispatch({ type: "back" })
  assert.equal(store.getSnapshot().scene.panel, null)
  assert.deepEqual(pauseReasons(store.getSnapshot()), ["manual"])
  assert.equal(gamePlaybackSpeed(store.getSnapshot()), 0)

  store.dispatch({ type: "set-paused", paused: false })
  assert.equal(gamePlaybackSpeed(store.getSnapshot()), 2)
})

test("buying build cards, building data centers, and using active actions update HUD and emit typed notices", () => {
  const store = createGameStore()
  const notices = []
  for (const type of ["build-card-bought", "data-center-built", "synthetic-funded", "synthetic-toggled", "action-used"]) {
    store.on(type, notice => notices.push(notice))
  }
  begin(store)
  const initialHud = hudContent(runOf(store), false, languages["zh-CN"])
  assert.equal(initialHud.cards, "0")
  assert.equal(initialHud.regions.na.entered, true)
  assert.equal(initialHud.regions.eu.entered, false)
  // Top status banner shows dynamic adoption/synthetic metrics without explicit Act I / Act II labels.
  assert.doesNotMatch(initialHud.worldStatus, /第一幕|第二幕|Act I|Act II/)
  assert.doesNotMatch(hudContent(runOf(store), false, languages.en).worldStatus, /第一幕|第二幕|Act I|Act II/)

  // Stale runId, wrong panel (overview), and bad seq are ignored.
  store.dispatch({ type: "open-panel", panel: "overview" })
  const inResearch = store.getSnapshot()
  store.dispatch({ type: "buy-build-card", runId: runOf(store).runId, completedDay: 0, seq: 1 })
  assert.strictEqual(store.getSnapshot(), inResearch)
  store.dispatch({ type: "back" })

  // Execute cross-border cloud from actions panel -> enters EU and refunds +4 tokens.
  store.dispatch({ type: "open-panel", panel: "actions" })
  const run0 = runOf(store)
  store.dispatch({ type: "use-action", abilityId: "cross-border-cloud", targetRegionId: "eu", runId: "wrong-id", completedDay: 0, seq: 1 })
  assert.strictEqual(runOf(store), run0)
  store.dispatch({ type: "use-action", abilityId: "cross-border-cloud", targetRegionId: "eu", runId: run0.runId, completedDay: 0, seq: nextCommandSeq(run0) })
  assert.equal(runOf(store).balance, 18 - 8 + btoken.newMarketReward)
  assert.equal(runOf(store).markets.eu.enteredDay, 0)

  // Buy a build card from actions panel, then deploy directly in origin USA from the region panel.
  const run1 = runOf(store)
  store.dispatch({ type: "buy-build-card", runId: run1.runId, completedDay: 0, seq: nextCommandSeq(run1) })
  assert.equal(runOf(store).buildCards, 1)
  assert.equal(runOf(store).balance, 2)
  store.dispatch({ type: "back" })

  store.dispatch({ type: "open-panel", panel: "region" })
  const run2 = runOf(store)
  store.dispatch({ type: "build-data-center", countryId: "USA", runId: run2.runId, completedDay: 0, seq: nextCommandSeq(run2) })
  assert.equal(runOf(store).buildCards, 0)
  assert.equal(runOf(store).countries.USA.centers, 1)

  // Fund conversion & toggle synthetic program on Day 0; only the very first activation sets firstActivation: true.
  const run3 = runOf(store)
  store.dispatch({ type: "fund-conversion", tokens: 1, runId: run3.runId, completedDay: 0, seq: nextCommandSeq(run3) })
  const run4 = runOf(store)
  store.dispatch({ type: "toggle-synthetic", regionId: "na", enabled: true, runId: run4.runId, completedDay: 0, seq: nextCommandSeq(run4) })
  const run5 = runOf(store)
  store.dispatch({ type: "toggle-synthetic", regionId: "na", enabled: false, runId: run5.runId, completedDay: 0, seq: nextCommandSeq(run5) })
  const run6 = runOf(store)
  store.dispatch({ type: "toggle-synthetic", regionId: "na", enabled: true, runId: run6.runId, completedDay: 0, seq: nextCommandSeq(run6) })

  const updatedHud = hudContent(runOf(store), false, languages.en)
  assert.equal(updatedHud.cards, "0")
  assert.equal(updatedHud.centers, 1)
  assert.equal(updatedHud.syntheticActive, true)
  assert.equal(updatedHud.regions.na.centers, 1)
  assert.equal(updatedHud.regions.eu.entered, true)

  assert.deepEqual(notices, [
    { type: "action-used", abilityId: "cross-border-cloud", targetRegionId: "eu" },
    { type: "build-card-bought", buildCards: 1 },
    { type: "data-center-built", countryId: "USA", centers: 1 },
    { type: "synthetic-funded", tokens: 1, budgetPeople: run4.conversionBudgetPeople },
    { type: "synthetic-toggled", regionId: "na", enabled: true, firstActivation: true },
    { type: "synthetic-toggled", regionId: "na", enabled: false, firstActivation: false },
    { type: "synthetic-toggled", regionId: "na", enabled: true, firstActivation: false },
  ])

  // Developer trial copy inherits and mutates operations independently without touching live store.
  store.dispatch({ type: "back" })
  const liveBefore = store.getSnapshot()
  const trial = forkDeveloperStore(liveBefore)
  trial.dispatch({ type: "dev-grant-token", runId: runOf(trial).runId, completedDay: 0, seq: nextCommandSeq(runOf(trial)), amount: 20 })
  trial.dispatch({ type: "buy-build-card", runId: runOf(trial).runId, completedDay: 0, seq: nextCommandSeq(runOf(trial)) })
  assert.equal(runOf(trial).buildCards, 1)
  assert.strictEqual(store.getSnapshot(), liveBefore)
})
