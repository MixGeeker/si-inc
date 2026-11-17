import assert from "node:assert/strict"
import test from "node:test"
import { advanceDay, createRun, nextCommandSeq, resolveDecision, startResearch, unlockResearchSlot } from "../../../packages/game/run.ts"
import { decisions } from "../../../packages/rules/v0.1/events/decisions.ts"
import { sceneReducer, visibleRunState } from "../src/scenes/machine.ts"
import { createGameStore, forkDeveloperStore } from "../src/scenes/store.ts"
import { languages } from "../src/i18n/languages.ts"
import { campaignNews } from "../src/scenes/world/newsFeed.ts"

const setup = { factionId: "gpt", startRegionId: "eu", difficultyId: "standard" }
const campaign = run => ({ kind: "campaign", panel: null, speed: 2, manualPaused: false, run })
const tick = run => ({ type: "dev-step-day", runId: run.runId, completedDay: run.completedDay })

function until(run, target) {
  while (run.completedDay < target) run = advanceDay(run)
  return run
}

function codingRun() {
  let run = createRun(setup, 42)
  run = unlockResearchSlot(run, 1, nextCommandSeq(run))
  run = startResearch(run, "daily-chat", nextCommandSeq(run))
  run = until(run, 2)
  run = startResearch(run, "agent-tasks", nextCommandSeq(run))
  while (!run.events.some(e => e.content.id === "unexpected-coding") && run.completedDay < 20) run = advanceDay(run)
  const entry = run.events.find(e => e.content.id === "unexpected-coding")
  assert.ok(entry, "a completed agent study must lead to its narrative event")
  return { run, entry }
}

function storeWith(scene) {
  return forkDeveloperStore({ ...createGameStore().getSnapshot(), scene })
}

test("a risky narrative choice immediately ends the run and publishes the settled result before the ending", () => {
  const { run, entry } = codingRun()
  const before = { ...run, researchBps: 9600 }
  const store = storeWith({ kind: "decision", id: "unexpected-coding", instanceId: entry.instanceId, back: campaign(before) })
  const notices = []
  for (const type of ["decision-resolved", "run-ended"]) {
    store.on(type, (notice, snapshot) => {
      assert.strictEqual(snapshot, store.getSnapshot())
      assert.equal(snapshot.scene.kind, "ending")
      assert.equal(snapshot.scene.run.researchBps, 10000)
      notices.push(notice.type)
    })
  }
  const choice = { type: "choose", id: "unexpected-coding", instanceId: entry.instanceId, choiceId: "keep" }
  const initial = store.getSnapshot()
  store.dispatch({ ...choice, instanceId: "stale" })
  assert.strictEqual(store.getSnapshot(), initial)
  store.dispatch(choice)
  const ending = store.getSnapshot()
  assert.equal(ending.scene.kind, "ending")
  assert.equal(ending.scene.outcome, "human-victory")
  assert.equal(ending.scene.run.completedDay, before.completedDay)
  assert.equal(ending.scene.run.balance, before.balance - 2)
  assert.equal(ending.scene.run.research.corpus, before.research.corpus + 16)
  assert.equal(ending.scene.run.commands.at(-1).eventInstanceId, entry.instanceId)
  assert.equal(ending.scene.run.events.find(e => e.instanceId === entry.instanceId).choiceId, "keep")
  assert.deepEqual(notices, ["decision-resolved", "run-ended"])
  store.dispatch(choice)
  store.dispatch(tick(ending.scene.run))
  store.dispatch({ type: "finish", outcome: "human-victory" })
  assert.strictEqual(store.getSnapshot(), ending)
  assert.equal(notices.length, 2)
})

test("follow-up news and a regular decision on the same day both notify after the same commit", () => {
  const { run, entry } = codingRun()
  const resolved = resolveDecision(run, entry.instanceId, "unexpected-coding", "rollback")
  const due = resolved.completedDay + 2
  assert.ok(due >= 8)
  const scheduled = { ...resolved, schedule: { ...resolved.schedule, nextDay: due,
    randomState: 1600, remaining: [] } }
  const before = until(scheduled, due - 1)
  const store = storeWith(campaign(before))
  const notices = []
  store.on("event-occurred", ({ entry: occurred }, snapshot) => {
    assert.strictEqual(snapshot, store.getSnapshot())
    notices.push(occurred)
  })
  const advance = tick(before)
  store.dispatch(advance)
  const committed = store.getSnapshot()
  const after = visibleRunState(committed.scene)
  const added = after.events.slice(before.events.length)
  assert.equal(added.length, 2)
  assert.deepEqual(added.map(e => e.content.id), ["coding-isolated", "community-router"])
  assert.equal(added[0].sourceInstanceId, entry.instanceId)
  assert.ok(added.every(e => e.day === due))
  assert.deepEqual(notices, added)
  assert.equal(committed.scene.kind, "decision")
  assert.equal(committed.scene.id, "community-router")
  store.dispatch(advance)
  assert.strictEqual(store.getSnapshot(), committed)
  assert.equal(notices.length, 2)
})

test("all narrative previews leave resources, commands and formal notices untouched", () => {
  const initial = { ...createRun(setup, 1), balance: 0, researchBps: 9900 }
  for (const [id, decision] of Object.entries(decisions)) {
    const base = { ...campaign(initial), panel: "news" }
    const preview = sceneReducer(base, { type: "open-decision", id })
    assert.equal(preview.kind, "decision")
    assert.strictEqual(sceneReducer(preview, { type: "back" }), base)
    const store = storeWith(preview)
    const notices = []
    for (const type of ["event-occurred", "decision-resolved", "run-ended"]) store.on(type, notice => notices.push(notice))
    store.dispatch({ type: "choose", id, choiceId: decision.choices[0].id })
    const after = store.getSnapshot().scene
    assert.equal(after.kind, "campaign")
    assert.deepEqual(after.run, initial)
    assert.deepEqual(after.run.commands, [])
    assert.deepEqual(after.run.events, [])
    assert.deepEqual(notices, [])
  }
})

test("a postponed research decision records actual changes and links its localized follow-up to the original story", () => {
  const { run, entry } = codingRun()
  const later = until(run, run.completedDay + 3)
  const settled = resolveDecision(later, entry.instanceId, "unexpected-coding", "keep")
  const selected = settled.events.find(e => e.instanceId === entry.instanceId)
  assert.equal(selected.resolvedDay, later.completedDay)
  assert.equal(selected.followUpDay, later.completedDay + 2)
  assert.deepEqual(selected.effect, { tokens: -2, corpus: 16, humanBps: 400 })
  const followed = until(settled, selected.followUpDay)
  const history = followed.events.find(e => e.sourceInstanceId === entry.instanceId)
  assert.equal(history.content.id, "coding-integrated")
  assert.equal(history.sourceChoiceId, "keep")
  for (const language of Object.values(languages)) {
    const pending = campaignNews(later, language).find(item => item.id === entry.instanceId)
    assert.equal(pending.pending, true)
    assert.equal(pending.choiceLabel, undefined)
    const beforeNews = campaignNews(settled, language).find(item => item.id === entry.instanceId)
    assert.equal(beforeNews.followUpDay, selected.followUpDay)
    const items = campaignNews(followed, language)
    const original = items.find(item => item.id === entry.instanceId)
    const continuation = items.find(item => item.id === history.instanceId)
    assert.equal(original.pending, false)
    assert.equal(original.resolvedDay, later.completedDay)
    assert.equal(original.followUpDay, undefined)
    assert.deepEqual(original.effect, selected.effect)
    assert.equal(original.choiceLabel, language.scenario.choices["unexpected-coding"].keep.label)
    assert.equal(original.resultBody, language.scenario.choices["unexpected-coding"].keep.result)
    assert.equal(continuation.relatedId, original.id)
    assert.equal(continuation.relatedTitle, original.title)
    assert.equal(continuation.image, original.image)
    assert.equal(continuation.title, language.scenario.events["coding-integrated"].title)
    assert.equal(continuation.source, language.scenario.eventDetails["unexpected-coding"].source)
    assert.equal(continuation.scope, language.scenario.eventDetails["unexpected-coding"].scope)
  }
  assert.notEqual(campaignNews(followed, languages.en).at(-1).title,
    campaignNews(followed, languages["zh-CN"]).at(-1).title)
})

test("follow-up news stays available beyond the former deadline and stops only at a real ending", () => {
  const { run, entry } = codingRun()
  const story = state => campaignNews(state).find(item => item.id === entry.instanceId)
  const selectAt = day => {
    const before = until(run, day)
    return resolveDecision(before, entry.instanceId, "unexpected-coding", "rollback")
  }
  for (const day of [118, 119, 240]) {
    const late = selectAt(day)
    assert.equal(late.events.find(e => e.instanceId === entry.instanceId).followUpDay, day + 2)
    assert.equal(story(late).followUpDay, day + 2)
    const followed = until(late, day + 2)
    assert.equal(followed.completedDay, day + 2)
    assert.equal(followed.events.some(e => e.sourceInstanceId === entry.instanceId), true)
    assert.equal(story(followed).followUpDay, undefined)
  }
  const beforeRisk = { ...until(run, 117), researchBps: 9600 }
  const defeated = resolveDecision(beforeRisk, entry.instanceId, "unexpected-coding", "keep")
  assert.equal(defeated.researchBps, 10000)
  assert.equal(defeated.events.find(e => e.instanceId === entry.instanceId).followUpDay, 119)
  assert.equal(story(defeated).followUpDay, undefined)
})
