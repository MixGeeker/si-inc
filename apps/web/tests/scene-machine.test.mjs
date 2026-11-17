import assert from "node:assert/strict"
import test from "node:test"
import { initialScene, playbackSpeed, sceneReducer, visibleRun } from "../src/scenes/machine.ts"

const setup = { factionId: "claude", startRegionId: "as", difficultyId: "standard" }
const open = panel => ({ type: "open-panel", panel })
const start = { type: "start", ...setup }
const back = { type: "back" }
const menu = sceneReducer(initialScene, open("menu"))
const configure = sceneReducer(menu, { type: "open-setup" })
const campaign = sceneReducer(configure, start)
const decisionId = "unexpected-coding"

test("preview panels and cancelled setup restore the original map and animation speed", () => {
  const fast = sceneReducer(initialScene, { type: "set-speed", speed: 5 })
  const pausedMenu = sceneReducer(fast, open("menu"))
  const draft = sceneReducer(pausedMenu, { type: "open-setup" })
  assert.equal(playbackSpeed(pausedMenu), 0)
  assert.equal(playbackSpeed(draft), 0)
  assert.equal(visibleRun(draft), null)
  assert.strictEqual(sceneReducer(draft, back), pausedMenu)
  assert.deepEqual(sceneReducer(pausedMenu, back), fast)
})

test("only a configured standard run can start, and a duplicate start has no effect", () => {
  for (const state of [initialScene, menu, campaign]) assert.strictEqual(sceneReducer(state, start), state)
  for (const override of [
    { factionId: "deepseek" }, { factionId: "constructor" }, { startRegionId: "UKR" },
    { startRegionId: "__proto__" }, { startRegionId: "latam" }, { difficultyId: "sandbox" },
  ]) assert.strictEqual(sceneReducer(configure, { ...start, ...override }), configure)
  assert.equal(campaign.kind, "campaign")
  assert.deepEqual(visibleRun(campaign), setup)
  assert.equal(playbackSpeed(campaign), 1)
})

test("critical panels pause independently of manual pause and retain speed changes made while open", () => {
  for (const speed of [1, 2, 5]) {
    const map = sceneReducer(campaign, { type: "set-speed", speed })
    assert.equal(playbackSpeed(map), speed)
    for (const panel of ["menu", "overview", "region", "news", "world"]) {
      const modal = sceneReducer(map, open(panel))
      assert.equal(playbackSpeed(modal), panel === "menu" || panel === "overview" ? 0 : speed)
      assert.strictEqual(sceneReducer(modal, open("news")), modal)
      assert.deepEqual(sceneReducer(modal, back), map)
      const nextSpeed = speed === 5 ? 2 : 5
      const changed = sceneReducer(modal, { type: "set-speed", speed: nextSpeed })
      assert.equal(playbackSpeed(changed), panel === "menu" || panel === "overview" ? 0 : nextSpeed)
      assert.equal(sceneReducer(changed, back).speed, nextSpeed)
      const paused = sceneReducer(changed, { type: "set-paused", paused: true })
      assert.equal(playbackSpeed(paused), 0)
      assert.equal(playbackSpeed(sceneReducer(paused, back)), 0)
      const resumed = sceneReducer(paused, { type: "set-paused", paused: false })
      assert.equal(playbackSpeed(resumed), panel === "menu" || panel === "overview" ? 0 : nextSpeed)
    }
  }
  for (const speed of [0, 3, 10, -1, NaN, Infinity, "2"]) assert.strictEqual(sceneReducer(campaign, { type: "set-speed", speed }), campaign)
  assert.strictEqual(sceneReducer(campaign, { type: "set-paused", paused: false }), campaign)
  assert.strictEqual(sceneReducer(campaign, { type: "set-paused", paused: "true" }), campaign)
  const manual = sceneReducer(campaign, { type: "set-paused", paused: true })
  assert.equal(playbackSpeed(sceneReducer(manual, { type: "set-speed", speed: 5 })), 0)
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
  assert.strictEqual(sceneReducer(decision, { type: "set-speed", speed: 10 }), decision)
  const changed = sceneReducer(decision, { type: "set-speed", speed: 5 })
  assert.equal(changed.back.speed, 5)
  assert.equal(playbackSpeed(changed), 0)
  const manual = sceneReducer(changed, { type: "set-paused", paused: true })
  assert.equal(playbackSpeed(sceneReducer(manual, back)), 0)
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
  for (const outcome of ["ai-victory", "human-victory"]) {
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
  assert.strictEqual(sceneReducer(campaign, { type: "finish", outcome: "timeout" }), campaign)
})

test("news remembers whether it shows the archive, the current item, or this day", () => {
  const archive = sceneReducer(campaign, { type: "open-panel", panel: "news", newsView: "archive" })
  assert.equal(archive.panel, "news")
  assert.equal(archive.newsView, "archive")
  assert.equal(archive.newsItemId, undefined)
  assert.equal(playbackSpeed(archive), 1)
  const story = sceneReducer(archive, { type: "open-panel", panel: "news", newsView: "current", newsItemId: "opening" })
  assert.equal(story.newsView, "current")
  assert.equal(story.newsItemId, "opening")
  const day = sceneReducer(story, { type: "open-panel", panel: "news", newsView: "day" })
  assert.equal(day.newsView, "day")
  assert.equal(day.newsItemId, undefined)
  assert.strictEqual(sceneReducer(day, { type: "open-panel", panel: "news", newsView: "day" }), day)
  assert.deepEqual(sceneReducer(day, back), campaign)
  assert.strictEqual(sceneReducer(campaign, { type: "open-panel", panel: "news", newsView: "later" }), campaign)
  assert.strictEqual(sceneReducer(campaign, { type: "open-panel", panel: "news", newsItemId: "" }), campaign)
  assert.strictEqual(sceneReducer(menu, { type: "open-panel", panel: "news", newsView: "current", newsItemId: "x" }), menu)
})
