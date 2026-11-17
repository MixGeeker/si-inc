import assert from "node:assert/strict"
import test from "node:test"
import { replayForRun, runTimeline } from "../../../packages/game/inspection.ts"
import { createRun } from "../../../packages/game/run.ts"
import { standardScenario } from "../../../packages/rules/v0.1/scenario.ts"
import { attachWeekClock } from "../src/scenes/clock.ts"
import { stepDeveloperRun } from "../src/scenes/developer.ts"
import { visibleRunState } from "../src/scenes/machine.ts"
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
function legacyGame() {
  const store = createGameStore()
  begin(store)
  const snapshot = store.getSnapshot()
  return forkDeveloperStore({ ...snapshot, scene: { ...snapshot.scene, run: createRun(start, start.seed, 0) } })
}
function credit(store, amount) {
  const { seed, completedWeek, commands } = runOf(store)
  return { type: "dev-grant-token", seed, completedWeek, seq: (commands.at(-1)?.seq ?? 0) + 1, amount }
}

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
  const step = { type: "dev-step-week", seed: 8, completedWeek: 0 }
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
  blocked({ ...first, seed: 9 })
  blocked({ ...first, completedWeek: 1 })
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
  blocked({ ...step, completedWeek: 1 })
})

test("legacy trial copies settle income, draws, grants and choices independently and export them in commit order", () => {
  const live = legacyGame()
  live.dispatch(enable)
  live.dispatch(open)
  const original = live.getSnapshot()
  const trial = forkDeveloperStore(original)
  const notices = []
  for (const type of ["event-occurred", "decision-resolved", "dev-token-granted", "run-ended"]) {
    trial.on(type, notice => notices.push(notice.type))
  }
  stepDeveloperRun(trial, true)
  assert.equal(runOf(trial).completedWeek, 9)
  stepDeveloperRun(trial, true)
  const decision = trial.getSnapshot().scene
  assert.equal(decision.kind, "decision")
  assert.equal(decision.back.run.completedWeek, 18)
  assert.equal(decision.back.run.balance, 27)
  stepDeveloperRun(trial, true)
  assert.strictEqual(trial.getSnapshot().scene, decision)
  trial.dispatch(credit(trial, 10))
  const choose = { type: "choose", id: decision.id, instanceId: decision.instanceId, choiceId: "rollback" }
  trial.dispatch(choose)
  trial.dispatch(choose)
  trial.dispatch(credit(trial, 100))
  const run = runOf(trial)
  assert.equal(run.balance, 133)
  assert.deepEqual(notices, ["event-occurred", "event-occurred", "dev-token-granted", "decision-resolved", "dev-token-granted"])
  assert.deepEqual(run.commands.map(c => [c.seq, c.kind]), [[1,"devGrantTokens"], [2,"chooseEvent"], [3,"devGrantTokens"]])
  assert.deepEqual(runTimeline(run).slice(0, 4).map(row => [row.before, row.after]), [[33,133], [37,33], [27,37], [26,27]])
  const debug = replayForRun(run)
  assert.equal(debug.format, "debug-replay")
  assert.deepEqual(debug.commands, run.commands)
  assert.strictEqual(live.getSnapshot(), original)
  assert.equal(replayForRun(runOf(live)).saveVersion, 1)
  while (trial.getSnapshot().scene.kind !== "ending") {
    if (trial.getSnapshot().scene.kind === "decision") trial.dispatch({ type: "back" })
    else stepDeveloperRun(trial, true)
  }
  const end = trial.getSnapshot()
  assert.equal(end.scene.run.completedWeek, standardScenario.rules.maxWeeks)
  assert.equal(notices.filter(value => value === "run-ended").length, 1)
  trial.dispatch(credit(trial, 10))
  stepDeveloperRun(trial, true)
  assert.strictEqual(trial.getSnapshot(), end)
})

test("the drawer preserves the remaining clock interval and manual steps start a fresh week", () => {
  const store = createGameStore()
  let now = 0, timer
  const stop = attachWeekClock(store, {
    now: () => now, visible: () => true, onVisibilityChange: () => () => {},
    after(ms, callback) { timer = { ms, callback }; return () => { timer = undefined } },
  })
  begin(store)
  store.dispatch(enable)
  const stale = timer.callback
  now = 1250
  store.dispatch(open)
  assert.equal(timer, undefined)
  now += 10000
  stale()
  store.dispatch({ type: "advance-week", seed: 8, completedWeek: 0 })
  assert.equal(runOf(store).completedWeek, 0)
  store.dispatch(close)
  assert.equal(timer.ms, 2750)
  store.dispatch(open)
  stepDeveloperRun(store)
  assert.equal(runOf(store).completedWeek, 1)
  store.dispatch(close)
  assert.equal(timer.ms, 4000)
  store.dispatch({ type: "set-speed", speed: 0 })
  store.dispatch(open)
  stepDeveloperRun(store)
  store.dispatch(close)
  assert.equal(runOf(store).completedWeek, 2)
  assert.equal(timer, undefined)
  stop()
})

test("a deferred legacy archive decision can fork, settle in a later week and keep stepping without a news overlay", () => {
  const live = legacyGame()
  live.dispatch(enable)
  live.dispatch(open)
  stepDeveloperRun(live, true)
  stepDeveloperRun(live, true)
  const decision = live.getSnapshot().scene
  live.dispatch({ type: "back" })
  stepDeveloperRun(live)
  live.dispatch({ type: "open-panel", panel: "news" })
  live.dispatch({ type: "open-decision", id: decision.id, instanceId: decision.instanceId })
  const original = live.getSnapshot()
  const trial = forkDeveloperStore(original)
  trial.dispatch({ type: "choose", id: decision.id, instanceId: decision.instanceId, choiceId: "rollback" })
  const run = runOf(trial)
  assert.equal(run.commands[0].week, 19)
  assert.equal(runTimeline(run)[0].event.week, 18)
  assert.equal(replayForRun(run).saveVersion, 1)
  stepDeveloperRun(trial)
  assert.equal(runOf(trial).completedWeek, 20)
  assert.strictEqual(live.getSnapshot(), original)
})
