import assert from "node:assert/strict"
import test from "node:test"
import { replayForRun, runTimeline } from "../../../packages/game/inspection.ts"
import { decisions } from "../../../packages/rules/v0.1/events/decisions.ts"
import { standardScenario } from "../../../packages/rules/v0.1/scenario.ts"
import { createDayClock } from "../src/scenes/clock.ts"
import { stepDeveloperRun } from "../src/scenes/developer.ts"
import { visibleRunState } from "../src/scenes/machine.ts"
import { nextEventDay, nextCommandSeq } from "../../../packages/game/run.ts"
import { createGameStore, forkDeveloperStore, gamePlaybackSpeed } from "../src/scenes/store.ts"

const start = { type: "start", seed: 8, factionId: "claude", startRegionId: "eu", difficultyId: "standard" }
const menu = { type: "open-panel", panel: "menu" }
const enable = { type: "set-developer-enabled", enabled: true }
const open = { type: "set-developer-open", open: true }
const close = { ...open, open: false }
const runOf = store => visibleRunState(store.getSnapshot().scene)

function begin(store) {
  store.dispatch(menu)
  store.dispatch({ type: "open-setup" })
  store.dispatch(start)
}
function developerGame() {
  const store = createGameStore()
  begin(store)
  const snapshot = store.getSnapshot()
  return forkDeveloperStore(snapshot)
}
function credit(store, amount) {
  const { runId, completedDay, commands } = runOf(store)
  return { type: "dev-grant-token", runId, completedDay, seq: (commands.at(-1)?.seq ?? 0) + 1, amount }
}
function stepToDecision(store) {
  for (let count = 0; count < 20 && store.getSnapshot().scene.kind === "campaign"; count++) {
    const day = runOf(store).completedDay
    stepDeveloperRun(store, true)
    assert.ok(runOf(store).completedDay > day)
  }
  assert.equal(store.getSnapshot().scene.kind, "decision")
  return store.getSnapshot().scene
}

test("the next-event readout and manual stepping include earlier research milestones and follow-ups", () => {
  const store = createGameStore()
  store.dispatch(menu)
  store.dispatch({ type: "open-setup" })
  store.dispatch({ ...start, seed: 42, runId: "developer-next-event" })
  const order = event => {
    const run = runOf(store)
    store.dispatch({ ...event, runId: run.runId, completedDay: run.completedDay, seq: nextCommandSeq(run) })
  }
  store.dispatch({ type: "open-panel", panel: "overview" })
  order({ type: "unlock-research-slot", slot: 1 })
  order({ type: "start-research", skillId: "daily-chat" })
  store.dispatch({ type: "back" })
  for (let day = 0; day < 2; day++) {
    store.dispatch({ type: "advance-day", runId: runOf(store).runId, completedDay: day })
  }
  store.dispatch({ type: "open-panel", panel: "overview" })
  order({ type: "start-research", skillId: "agent-tasks" })
  store.dispatch({ type: "back" })
  store.dispatch(enable)
  store.dispatch(open)
  assert.equal(runOf(store).schedule.nextDay, 9)
  assert.equal(nextEventDay(runOf(store)), 6)
  stepDeveloperRun(store, true)
  const decision = store.getSnapshot().scene
  assert.equal(runOf(store).completedDay, 6)
  assert.equal(decision.kind, "decision")
  assert.equal(decision.id, "unexpected-coding")
  store.dispatch({ type: "choose", id: decision.id, instanceId: decision.instanceId, choiceId: "keep" })
  assert.equal(nextEventDay(runOf(store)), 8)
  stepDeveloperRun(store, true)
  assert.equal(runOf(store).completedDay, 8)
  assert.equal(store.getSnapshot().scene.kind, "campaign")
  assert.equal(runOf(store).events.at(-1).sourceInstanceId, decision.instanceId)
  assert.equal(nextEventDay(runOf(store)), 9)
})

test("settings gate the drawer and all manual settlements, including expired and duplicate inputs", () => {
  const store = createGameStore()
  begin(store)
  const snapshot = store.getSnapshot
  const blocked = event => {
    const before = snapshot()
    store.dispatch(event)
    assert.strictEqual(snapshot(), before)
  }
  const first = credit(store, 10)
  const step = { type: "dev-step-day", runId: runOf(store).runId, completedDay: 0 }
  blocked(open)
  blocked(step)
  blocked(first)
  blocked({ ...enable, enabled: "true" })
  store.dispatch(menu)
  store.dispatch(enable)
  blocked(enable)
  blocked(first)
  store.dispatch(open)
  assert.equal(snapshot().scene.panel, null)
  assert.equal(gamePlaybackSpeed(snapshot()), 0)
  blocked(open)
  for (const amount of [0, -1, 1.3, NaN, Infinity, "1", Number.MAX_SAFE_INTEGER]) blocked({ ...first, amount })
  blocked({ ...first, seq: 2 })
  blocked({ ...first, runId: "expired-run" })
  blocked({ ...first, completedDay: 1 })
  const notices = []
  const off = store.on("dev-token-granted", (notice, state) => {
    assert.strictEqual(notice.command, state.scene.run.commands.at(-1))
    notices.push(state.scene.run.balance)
  })
  store.dispatch(first)
  blocked(first)
  store.dispatch(credit(store, 10))
  assert.deepEqual(notices, [28, 38])
  off()
  store.dispatch(step)
  blocked(step)
  blocked({ ...first, seq: 3 })
  store.dispatch({ ...enable, enabled: false })
  assert.deepEqual(snapshot().developer, { enabled: false, open: false })
  assert.equal(gamePlaybackSpeed(snapshot()), 1)
  blocked(credit(store, 10))
  blocked({ ...step, completedDay: 1 })
})

test("trial copies settle income, draws, grants and choices independently and export them in commit order", () => {
  const live = developerGame()
  live.dispatch(enable)
  live.dispatch(open)
  const original = live.getSnapshot()
  const trial = forkDeveloperStore(original)
  const notices = []
  for (const type of ["event-occurred", "decision-resolved", "dev-token-granted", "run-ended"]) {
    trial.on(type, notice => notices.push(notice.type))
  }
  const decision = stepToDecision(trial)
  const before = decision.back.run
  assert.ok(before.completedDay > 0)
  assert.equal(before.balance, standardScenario.rules.initialBtoken + Math.floor(before.completedDay / 2))
  stepDeveloperRun(trial, true)
  assert.strictEqual(trial.getSnapshot().scene, decision)
  trial.dispatch(credit(trial, 10))
  const option = decisions[decision.id].choices.find(choice => choice.cost > 0 && choice.corpusCost === 0)
    ?? decisions[decision.id].choices.find(choice => choice.corpusCost === 0)
  const choose = { type: "choose", id: decision.id, instanceId: decision.instanceId, choiceId: option.id }
  trial.dispatch(choose)
  trial.dispatch(choose)
  trial.dispatch(credit(trial, 100))
  const run = runOf(trial)
  const settled = before.balance + 10 - option.cost + option.effect.tokens
  assert.equal(run.balance, settled + 100)
  assert.equal(notices.filter(type => type === "event-occurred").length, before.events.length)
  assert.deepEqual(notices.filter(type => type !== "event-occurred"), ["dev-token-granted", "decision-resolved", "dev-token-granted"])
  assert.deepEqual(run.commands.map(c => [c.seq, c.kind]), [[1,"devGrantTokens"], [2,"chooseEvent"], [3,"devGrantTokens"]])
  assert.deepEqual(runTimeline(run).slice(0, 3).map(row => [row.before, row.after]),
    [[settled, settled + 100], [before.balance + 10, settled], [before.balance, before.balance + 10]])
  const debug = replayForRun(run)
  assert.equal(debug.format, "debug-replay")
  assert.equal(debug.version, 2)
  assert.deepEqual(debug.commands, run.commands)
  assert.strictEqual(live.getSnapshot(), original)
  assert.equal(replayForRun(runOf(live)).saveVersion, 2)
  while (runOf(trial).completedDay < 130 || trial.getSnapshot().scene.kind === "decision") {
    if (trial.getSnapshot().scene.kind === "decision") trial.dispatch({ type: "back" })
    else stepDeveloperRun(trial)
  }
  assert.equal(trial.getSnapshot().scene.kind, "campaign")
  assert.equal(notices.filter(value => value === "run-ended").length, 0)
  trial.dispatch({ type: "finish", outcome: "human-victory" })
  const end = trial.getSnapshot()
  assert.equal(end.scene.run.completedDay, 130)
  assert.equal(notices.filter(value => value === "run-ended").length, 1)
  trial.dispatch(credit(trial, 10))
  stepDeveloperRun(trial, true)
  assert.strictEqual(trial.getSnapshot(), end)
})

test("the drawer preserves the remaining clock interval and manual steps start a fresh day", () => {
  const store = createGameStore()
  let now = 0, timer
  const clock = createDayClock(store, {
    now: () => now, visible: () => true, onVisibilityChange: () => () => {},
    after(ms, callback) { timer = { ms, callback }; return () => { timer = undefined } },
  })
  const stop = clock.attach()
  begin(store)
  store.dispatch(enable)
  const stale = timer.callback
  now = 1250
  store.dispatch(open)
  assert.equal(timer, undefined)
  now += 10000
  stale()
  store.dispatch({ type: "advance-day", runId: runOf(store).runId, completedDay: 0 })
  assert.equal(runOf(store).completedDay, 0)
  store.dispatch(close)
  assert.equal(timer.ms, 2750)
  store.dispatch(open)
  stepDeveloperRun(store)
  assert.equal(runOf(store).completedDay, 1)
  store.dispatch(close)
  assert.equal(timer.ms, 4000)
  store.dispatch({ type: "set-paused", paused: true })
  store.dispatch(open)
  stepDeveloperRun(store)
  store.dispatch(close)
  assert.equal(runOf(store).completedDay, 2)
  assert.equal(timer, undefined)
  stop()
})

test("a deferred archive decision can fork, settle in a later day and keep stepping without a news overlay", () => {
  const live = developerGame()
  live.dispatch(enable)
  live.dispatch(open)
  const decision = stepToDecision(live)
  live.dispatch({ type: "back" })
  stepDeveloperRun(live)
  live.dispatch({ type: "open-panel", panel: "news" })
  live.dispatch({ type: "open-decision", id: decision.id, instanceId: decision.instanceId })
  const original = live.getSnapshot()
  const trial = forkDeveloperStore(original)
  const option = decisions[decision.id].choices.find(choice => choice.cost === 0 && choice.corpusCost === 0)
  trial.dispatch({ type: "choose", id: decision.id, instanceId: decision.instanceId, choiceId: option.id })
  const run = runOf(trial)
  assert.equal(run.commands[0].day, decision.back.run.completedDay + 1)
  assert.equal(runTimeline(run)[0].event.day, decision.back.run.completedDay)
  assert.equal(replayForRun(run).saveVersion, 2)
  stepDeveloperRun(trial)
  assert.equal(runOf(trial).completedDay, decision.back.run.completedDay + 2)
  assert.strictEqual(live.getSnapshot(), original)
})
