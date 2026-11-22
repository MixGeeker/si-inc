import assert from "node:assert/strict"
import test from "node:test"
import { runTimeline } from "../../../packages/game/inspection.ts"
import { actionCost, buildCardCost, computePressure, conversionPackTokens, hallucinationWindfallTokens, newMarketReward } from "../../../packages/game/operations.ts"
import { nextCommandSeq } from "../../../packages/game/run.ts"
import { languages } from "../src/i18n/languages.ts"
import { visibleRunState } from "../src/scenes/machine.ts"
import { createGameStore, forkDeveloperStore, gamePlaybackSpeed, pauseReasons } from "../src/scenes/store.ts"
import { formatCompactTokens, hudContent } from "../src/scenes/world/hudContent.ts"

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

test("campaign HUD shows rival markets separately from player expansion", () => {
  const store = createGameStore()
  begin(store)
  const content = hudContent(runOf(store), true, languages.en)

  assert.deepEqual(content.rivalsByRegion.na, [])
  assert.deepEqual(content.rivalsByRegion.eu, ["Claude"])
  assert.deepEqual(content.rivalsByRegion.as, ["Grok"])
  assert.equal(content.regions.eu.entered, false)
  assert.equal(content.regions.as.entered, false)
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

  // Execute cross-border cloud from actions panel -> enters EU and refunds newMarketReward.
  store.dispatch({ type: "open-panel", panel: "actions" })
  const run0 = runOf(store)
  store.dispatch({ type: "use-action", abilityId: "cross-border-cloud", targetRegionId: "eu", runId: "wrong-id", completedDay: 0, seq: 1 })
  assert.strictEqual(runOf(store), run0)
  const cloudCost = actionCost(run0, "cross-border-cloud")
  const cloudReward = newMarketReward(run0)
  store.dispatch({ type: "use-action", abilityId: "cross-border-cloud", targetRegionId: "eu", runId: run0.runId, completedDay: 0, seq: nextCommandSeq(run0) })
  assert.equal(runOf(store).balance, run0.balance - cloudCost + cloudReward)
  assert.equal(runOf(store).markets.eu.enteredDay, 0)
  store.dispatch({ type: "back" })

  // Advance days until natural token income covers a build card + conversion pack.
  for (let step = 0; step < 30; step++) {
    if (store.getSnapshot().scene.kind === "decision") { store.dispatch({ type: "back" }); continue }
    const current = runOf(store)
    if (current.balance >= buildCardCost(current) + conversionPackTokens(current, 1)) break
    store.dispatch({ type: "advance-day", runId: current.runId, completedDay: current.completedDay })
  }
  if (store.getSnapshot().scene.kind === "decision") store.dispatch({ type: "back" })

  // Buy a build card from actions panel, then deploy directly in origin USA from the region panel.
  store.dispatch({ type: "open-panel", panel: "actions" })
  const run1 = runOf(store)
  const cardPrice = buildCardCost(run1)
  store.dispatch({ type: "buy-build-card", runId: run1.runId, completedDay: run1.completedDay, seq: nextCommandSeq(run1) })
  assert.equal(runOf(store).buildCards, 1)
  assert.equal(runOf(store).balance, run1.balance - cardPrice)
  store.dispatch({ type: "back" })

  store.dispatch({ type: "open-panel", panel: "region" })
  const run2 = runOf(store)
  store.dispatch({ type: "build-data-center", countryId: "USA", runId: run2.runId, completedDay: run2.completedDay, seq: nextCommandSeq(run2) })
  assert.equal(runOf(store).buildCards, 0)
  assert.equal(runOf(store).countries.USA.centers, 1)

  // Fund conversion & toggle synthetic program; only the very first activation sets firstActivation: true.
  const run3 = runOf(store)
  const packTokens = conversionPackTokens(run3, 1)
  store.dispatch({ type: "fund-conversion", tokens: packTokens, runId: run3.runId, completedDay: run3.completedDay, seq: nextCommandSeq(run3) })
  const run4 = runOf(store)
  store.dispatch({ type: "toggle-synthetic", regionId: "na", enabled: true, runId: run4.runId, completedDay: run4.completedDay, seq: nextCommandSeq(run4) })
  const run5 = runOf(store)
  store.dispatch({ type: "toggle-synthetic", regionId: "na", enabled: false, runId: run5.runId, completedDay: run5.completedDay, seq: nextCommandSeq(run5) })
  const run6 = runOf(store)
  store.dispatch({ type: "toggle-synthetic", regionId: "na", enabled: true, runId: run6.runId, completedDay: run6.completedDay, seq: nextCommandSeq(run6) })

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
    { type: "synthetic-funded", tokens: packTokens, budgetPeople: run4.conversionBudgetPeople },
    { type: "synthetic-toggled", regionId: "na", enabled: true, firstActivation: true },
    { type: "synthetic-toggled", regionId: "na", enabled: false, firstActivation: false },
    { type: "synthetic-toggled", regionId: "na", enabled: true, firstActivation: false },
  ])

  // Developer trial copy inherits and mutates operations independently without touching live store.
  store.dispatch({ type: "back" })
  const liveBefore = store.getSnapshot()
  const trial = forkDeveloperStore(liveBefore)
  const grantAmount = buildCardCost(runOf(trial)) + 20
  trial.dispatch({ type: "dev-grant-token", runId: runOf(trial).runId, completedDay: runOf(trial).completedDay, seq: nextCommandSeq(runOf(trial)), amount: grantAmount })
  trial.dispatch({ type: "buy-build-card", runId: runOf(trial).runId, completedDay: runOf(trial).completedDay, seq: nextCommandSeq(runOf(trial)) })
  assert.equal(runOf(trial).buildCards, 1)
  assert.strictEqual(store.getSnapshot(), liveBefore)
})

test("faction signature abilities, map bubbles, compute pressure HUD, and compact token formatting work end-to-end", () => {
  const store = createGameStore()
  const bubbleNotices = [], actionNotices = []
  store.on("bubble-collected", notice => bubbleNotices.push(notice))
  store.on("action-used", notice => actionNotices.push(notice))
  begin(store)

  // Compact token formatting covers single digits through trillions in both locales.
  assert.equal(formatCompactTokens(8, "zh-CN", languages["zh-CN"].number), "8")
  assert.equal(formatCompactTokens(15_400, "zh-CN", languages["zh-CN"].number), "1.5 万")
  assert.equal(formatCompactTokens(240_000_000, "zh-CN", languages["zh-CN"].number), "2.40 亿")
  assert.equal(formatCompactTokens(3_500_000_000_000, "zh-CN", languages["zh-CN"].number), "3.50 万亿")
  assert.equal(formatCompactTokens(8, "en", languages.en.number), "8")
  assert.equal(formatCompactTokens(15_400, "en", languages.en.number), "15.4K")
  assert.equal(formatCompactTokens(240_000_000, "en", languages.en.number), "240.0M")
  assert.equal(formatCompactTokens(3_500_000_000_000, "en", languages.en.number), "3.50T")

  // Initial HUD includes compute pressure and next-step advisor guidance.
  const day0Hud = hudContent(runOf(store), false, languages["zh-CN"])
  assert.equal(day0Hud.computeStatus, "optimal")
  assert.equal(day0Hud.computeAlert, false)
  assert.ok(day0Hud.advisor && day0Hud.advisor.panel === "overview")

  // Advance until a live bubble spawns and funds cover GPT's signature ability.
  for (let i = 0; i < 30; i++) {
    if (store.getSnapshot().scene.kind === "decision") { store.dispatch({ type: "back" }); continue }
    const current = runOf(store)
    if (current.bubbles.length > 0 && current.balance >= actionCost(current, "hallucination-smoke")) break
    store.dispatch({ type: "advance-day", runId: current.runId, completedDay: current.completedDay })
  }
  if (store.getSnapshot().scene.kind === "decision") store.dispatch({ type: "back" })

  const beforeBubble = runOf(store)
  const bubble = beforeBubble.bubbles[0]
  assert.ok(bubble, "expected a live map bubble to spawn")
  store.dispatch({ type: "collect-bubble", bubbleId: bubble.id, runId: beforeBubble.runId, completedDay: beforeBubble.completedDay, seq: nextCommandSeq(beforeBubble) })
  const afterBubble = runOf(store)
  assert.equal(afterBubble.bubbles.some(item => item.id === bubble.id), false)
  assert.equal(bubbleNotices.length, 1)
  assert.equal(bubbleNotices[0].bubble.id, bubble.id)
  // Duplicate click on the collected bubble is ignored.
  store.dispatch({ type: "collect-bubble", bubbleId: bubble.id, runId: afterBubble.runId, completedDay: afterBubble.completedDay, seq: nextCommandSeq(afterBubble) })
  assert.strictEqual(runOf(store), afterBubble)

  // Faction signature ability: GPT accepts hallucination-smoke and rejects Claude's anti-distill.
  store.dispatch({ type: "open-panel", panel: "actions" })
  const beforeAbility = runOf(store)
  store.dispatch({ type: "use-action", abilityId: "anti-distill", runId: beforeAbility.runId, completedDay: beforeAbility.completedDay, seq: nextCommandSeq(beforeAbility) })
  assert.strictEqual(runOf(store), beforeAbility)
  const abilityCost = actionCost(beforeAbility, "hallucination-smoke")
  const windfall = hallucinationWindfallTokens(beforeAbility)
  store.dispatch({ type: "use-action", abilityId: "hallucination-smoke", runId: beforeAbility.runId, completedDay: beforeAbility.completedDay, seq: nextCommandSeq(beforeAbility) })
  assert.equal(runOf(store).balance, beforeAbility.balance - abilityCost + windfall)
  assert.ok(runOf(store).actionCooldowns.factionAbilityUntilDay > beforeAbility.completedDay)
  assert.equal(actionNotices.at(-1).abilityId, "hallucination-smoke")
  store.dispatch({ type: "back" })

  // Compute pressure rises as simultaneous projects load CU and is reflected in HUD.
  const pressureBefore = computePressure(runOf(store))
  store.dispatch({ type: "open-panel", panel: "overview" })
  for (const slot of [1, 2]) {
    const r = runOf(store)
    store.dispatch({ type: "unlock-research-slot", slot, runId: r.runId, completedDay: r.completedDay, seq: nextCommandSeq(r) })
  }
  for (const skillId of ["daily-chat", "social-sharing"]) {
    const r = runOf(store)
    store.dispatch({ type: "start-research", skillId, runId: r.runId, completedDay: r.completedDay, seq: nextCommandSeq(r) })
  }
  store.dispatch({ type: "back" })
  const pressureAfter = computePressure(runOf(store))
  assert.ok(pressureAfter.researchDemand > pressureBefore.researchDemand)
  assert.ok(pressureAfter.totalDemand > pressureBefore.totalDemand)
  assert.ok(runTimeline(runOf(store)), "bubble collection, faction ability, and research replay cleanly")
})
