import assert from "node:assert/strict"
import test from "node:test"
import { initialScene, playbackSpeed, sceneReducer, visibleRun } from "../src/scenes/machine.ts"

const setup = { factionId: "claude", startRegionId: "sea", difficultyId: "standard" }
const open = panel => ({ type: "open-panel", panel })
const start = { type: "start", ...setup }
const back = { type: "back" }
const menu = sceneReducer(initialScene, open("menu"))
const configure = sceneReducer(menu, { type: "open-setup" })
const campaign = sceneReducer(configure, start)
const decisionId = "unexpected-coding"

test("preview panels and cancelled setup restore the original map and animation speed", () => {
  const fast = sceneReducer(initialScene, { type: "set-speed", speed: 3 })
  const pausedMenu = sceneReducer(fast, open("menu"))
  const draft = sceneReducer(pausedMenu, { type: "open-setup" })
  assert.equal(playbackSpeed(pausedMenu), 3)
  assert.equal(playbackSpeed(draft), 0)
  assert.equal(visibleRun(draft), null)
  assert.strictEqual(sceneReducer(draft, back), pausedMenu)
  assert.deepEqual(sceneReducer(pausedMenu, back), fast)
})

test("only a configured standard run can start, and a duplicate start has no effect", () => {
  for (const state of [initialScene, menu, campaign]) assert.strictEqual(sceneReducer(state, start), state)
  for (const override of [
    { factionId: "deepseek" }, { factionId: "constructor" }, { startRegionId: "UKR" },
    { startRegionId: "__proto__" }, { difficultyId: "sandbox" },
  ]) assert.strictEqual(sceneReducer(configure, { ...start, ...override }), configure)
  assert.equal(campaign.kind, "campaign")
  assert.deepEqual(visibleRun(campaign), setup)
  assert.equal(playbackSpeed(campaign), 1)
})

test("critical panels temporarily pause, and restore the player's previous speed including manual pause", () => {
  for (const speed of [0, 1, 2]) {
    const map = sceneReducer(campaign, { type: "set-speed", speed })
    assert.equal(playbackSpeed(map), speed)
    for (const panel of ["menu", "overview", "region", "news", "world"]) {
      const modal = sceneReducer(map, open(panel))
      assert.equal(playbackSpeed(modal), panel === "menu" || panel === "overview" ? 0 : speed)
      assert.strictEqual(sceneReducer(modal, open("news")), modal)
      assert.strictEqual(sceneReducer(modal, { type: "set-speed", speed: 1 }), modal)
      assert.deepEqual(sceneReducer(modal, back), map)
    }
  }
  for (const speed of [3, -1, NaN]) assert.strictEqual(sceneReducer(campaign, { type: "set-speed", speed }), campaign)
})

test("only a matching decision accepts a choice, and Escape leaves the preview log untouched", () => {
  const newspaper = sceneReducer(campaign, open("news"))
  const inspect = { type: "open-decision", id: decisionId }
  assert.strictEqual(sceneReducer(campaign, inspect), campaign)
  assert.strictEqual(sceneReducer(newspaper, { ...inspect, id: "missing" }), newspaper)
  const decision = sceneReducer(newspaper, inspect)
  assert.equal(playbackSpeed(decision), 0)
  assert.deepEqual(visibleRun(decision), setup)
  assert.strictEqual(sceneReducer(decision, back), newspaper)
  const choice = { type: "choose", id: decisionId, choiceId: "rollback" }
  assert.strictEqual(sceneReducer(decision, { ...choice, id: "another" }), decision)
  assert.strictEqual(sceneReducer(decision, { ...choice, choiceId: "typo" }), decision)
  const result = sceneReducer(decision, choice)
  assert.deepEqual(result.lastDecision, { id: decisionId, choiceId: "rollback" })
  assert.equal(result.panel, "news")
  assert.strictEqual(sceneReducer(result, choice), result)
})

test("withdrawal requires explicit confirmation and cannot become a standard victory", () => {
  const inMenu = sceneReducer(campaign, open("menu"))
  const confirm = sceneReducer(inMenu, { type: "request-exit" })
  for (const state of [initialScene, campaign, inMenu]) {
    assert.strictEqual(sceneReducer(state, { type: "withdraw" }), state)
  }
  assert.deepEqual(sceneReducer(confirm, back), inMenu)
  const ending = sceneReducer(confirm, { type: "withdraw" })
  assert.equal(ending.outcome, "withdrawn")
  assert.strictEqual(sceneReducer(ending, { type: "finish", outcome: "ai-victory" }), ending)
  const draft = sceneReducer(ending, { type: "open-setup" })
  assert.deepEqual(visibleRun(draft), setup)
  assert.strictEqual(sceneReducer(draft, back), ending)
  assert.deepEqual(sceneReducer(draft, start), campaign)
  assert.strictEqual(sceneReducer(ending, { type: "return-to-preview" }), initialScene)
})

test("an engine outcome can interrupt a campaign or decision, with a single terminal result", () => {
  const newspaper = sceneReducer(campaign, open("news"))
  const decision = sceneReducer(newspaper, { type: "open-decision", id: decisionId })
  for (const outcome of ["ai-victory", "human-victory", "timeout"]) {
    const finish = { type: "finish", outcome }
    assert.strictEqual(sceneReducer(initialScene, finish), initialScene)
    assert.strictEqual(sceneReducer(configure, finish), configure)
    for (const state of [campaign, sceneReducer(campaign, open("overview")), decision]) {
      const ending = sceneReducer(state, finish)
      assert.deepEqual(ending, { kind: "ending", outcome, run: campaign.run })
      assert.strictEqual(ending.run, campaign.run)
      assert.equal(playbackSpeed(ending), 0)
      assert.strictEqual(sceneReducer(ending, finish), ending)
    }
  }
})
