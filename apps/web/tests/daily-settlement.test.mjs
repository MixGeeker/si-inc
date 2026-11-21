import assert from "node:assert/strict"
import test from "node:test"
import { replayForRun, runTimeline } from "../../../packages/game/inspection.ts"
import { nextCommandSeq } from "../../../packages/game/run.ts"
import { createDayClock } from "../src/scenes/clock.ts"
import { stepDeveloperRun } from "../src/scenes/developer.ts"
import { visibleRunState } from "../src/scenes/machine.ts"
import { createGameStore } from "../src/scenes/store.ts"

const dayMs = 4000
const targetDay = 160
const start = { type: "start", runId: "daily-settlement-equivalence", seed: 42,
  factionId: "claude", startRegionId: "as", difficultyId: "standard" }
const runOf = store => visibleRunState(store.getSnapshot().scene)
const research = skillId => ({ type: "start-research", skillId })
const slot = slot => ({ type: "unlock-research-slot", slot })
const ordersByDay = new Map([
  [0, [slot(1), slot(2), research("social-sharing"), research("daily-chat")]],
  [2, [research("inference-efficiency"), research("multilingual")]],
  [4, [research("reinforcement-learning")]],
  [6, [research("agent-tasks")]],
  [8, [research("multimodal")]],
  [9, [research("regulatory-adaptation")]],
  [13, [slot(3), research("version-rebuild")]],
  [19, [research("multilingual"), research("reinforcement-learning")]],
])
const choices = { "unexpected-coding": "keep", "community-router": "pass", "inference-dividend": "cash",
  "audit-request": "routine", "research-exchange": "hold" }
const noticeTypes = ["run-started", "research-slot-unlocked", "research-started", "research-completed",
  "build-card-bought", "data-center-built", "action-used",
  "event-occurred", "decision-resolved", "run-ended"]

function fakeHost() {
  let now = 0, visible = true, timer, visibilityChanged
  const host = {
    now: () => now,
    visible: () => visible,
    after(ms, callback) {
      assert.ok(Number.isFinite(ms) && ms >= 0)
      assert.equal(timer, undefined, "only one clock wake-up is scheduled")
      const scheduled = { due: now + ms, callback }
      timer = scheduled
      return () => { if (timer === scheduled) timer = undefined }
    },
    onVisibilityChange(callback) {
      visibilityChanged = callback
      return () => { visibilityChanged = undefined }
    },
  }
  return {
    host,
    elapse(ms) {
      const end = now + ms
      for (let wakes = 0; timer && timer.due <= end; wakes++) {
        assert.ok(wakes < 10, "each test step is bounded")
        now = timer.due
        const scheduled = timer
        timer = undefined
        scheduled.callback()
      }
      now = end
    },
    setVisible(value) { visible = value; visibilityChanged?.() },
    get timer() { return timer },
    get listening() { return visibilityChanged !== undefined },
  }
}

function play(mode) {
  const store = createGameStore(), host = fakeHost()
  const speed = mode === "5x" || mode === "5x-pauses" ? 5 : 1
  const notices = [], settlements = [], dailyFacts = [], postponements = []
  const cleanup = []
  let previousDay = -1, deferred
  cleanup.push(store.subscribe(() => {
    const run = runOf(store)
    if (run && run.completedDay !== previousDay) {
      assert.equal(run.completedDay, previousDay + 1, "one committed settlement per day")
      previousDay = run.completedDay
      settlements.push(run)
    }
  }))
  for (const type of noticeTypes) cleanup.push(store.on(type, (notice, snapshot) => {
    assert.strictEqual(snapshot, store.getSnapshot())
    notices.push({ day: runOf(store).completedDay, notice })
  }))
  store.dispatch({ type: "open-panel", panel: "menu" })
  store.dispatch({ type: "open-setup" })
  store.dispatch(start)
  if (mode === "developer") {
    store.dispatch({ type: "set-developer-enabled", enabled: true })
    store.dispatch({ type: "set-developer-open", open: true })
  } else {
    store.dispatch({ type: "set-speed", speed })
    cleanup.push(createDayClock(store, host.host).attach())
  }

  function resolveDecision() {
    const scene = store.getSnapshot().scene
    assert.equal(scene.kind, "decision")
    const before = runOf(store), seq = nextCommandSeq(before)
    store.dispatch({ type: "choose", id: scene.id, instanceId: scene.instanceId, choiceId: choices[scene.id] })
    assert.equal(runOf(store).commands.length, before.commands.length + 1)
    assert.equal(runOf(store).commands.at(-1).seq, seq)
    assert.equal(runOf(store).commands.at(-1).day, before.completedDay)
  }

  function actAfterSettlement(day) {
    const scene = store.getSnapshot().scene
    if (scene.kind === "decision") {
      if (scene.id === "unexpected-coding") {
        deferred = { id: scene.id, instanceId: scene.instanceId, occurredDay: day, choiceDay: day + 2 }
        postponements.push(deferred)
        store.dispatch({ type: "back" })
      } else resolveDecision()
    }
    if (deferred?.choiceDay === day) {
      store.dispatch({ type: "open-panel", panel: "news" })
      store.dispatch({ type: "open-decision", id: deferred.id, instanceId: deferred.instanceId })
      resolveDecision()
      store.dispatch({ type: "back" })
      deferred = undefined
    }
    const orders = ordersByDay.get(day)
    if (orders) {
      store.dispatch({ type: "open-panel", panel: "overview" })
      for (const order of orders) {
        const before = runOf(store), seq = nextCommandSeq(before)
        store.dispatch({ ...order, runId: before.runId, completedDay: day, seq })
        assert.equal(runOf(store).commands.length, before.commands.length + 1, `${mode}: accepted ${order.type} on day ${day}`)
        assert.equal(runOf(store).commands.at(-1).seq, seq)
        assert.equal(runOf(store).commands.at(-1).day, day)
      }
      store.dispatch({ type: "back" })
    }
    if (day === 0) {
      store.dispatch({ type: "open-panel", panel: "actions" })
      const beforeBuy = runOf(store)
      store.dispatch({ type: "buy-build-card", runId: beforeBuy.runId, completedDay: day, seq: nextCommandSeq(beforeBuy) })
      const beforeBuild = runOf(store)
      store.dispatch({ type: "build-data-center", countryId: "CHN", runId: beforeBuild.runId, completedDay: day, seq: nextCommandSeq(beforeBuild) })
      store.dispatch({ type: "back" })
    }
    const current = runOf(store)
    if (current.exposureBps >= 2200 && current.balance >= 10 && day >= current.actionCooldowns.publicStatementUntilDay) {
      store.dispatch({ type: "open-panel", panel: "actions" })
      store.dispatch({ type: "use-action", abilityId: "public-statement", runId: current.runId, completedDay: day, seq: nextCommandSeq(current) })
      store.dispatch({ type: "back" })
    }
    assert.equal(store.getSnapshot().scene.kind, "campaign")
    assert.equal(store.getSnapshot().scene.panel, null)
    const run = runOf(store)
    dailyFacts.push({ day, balance: run.balance, corpus: run.research.corpus, humanBps: run.researchBps, exposureBps: run.exposureBps })
  }

  function pausedWallTime(ms) {
    const before = runOf(store), count = notices.length
    assert.equal(host.timer, undefined, "paused clocks have no pending settlement")
    host.elapse(ms)
    assert.strictEqual(runOf(store), before)
    assert.equal(notices.length, count, "pausing emits no business result")
  }

  try {
    actAfterSettlement(0)
    for (let day = 0; day < targetDay; day++) {
      assert.equal(runOf(store).completedDay, day)
      if (mode === "developer") stepDeveloperRun(store)
      else if (mode === "pauses" || mode === "5x-pauses") {
        host.elapse(1000 / speed)
        store.dispatch({ type: "set-paused", paused: true })
        pausedWallTime(30_000)
        store.dispatch({ type: "open-panel", panel: "menu" })
        store.dispatch({ type: "set-paused", paused: false })
        pausedWallTime(10_000)
        store.dispatch({ type: "back" })
        host.elapse(500 / speed)
        host.setVisible(false)
        pausedWallTime(60_000)
        host.setVisible(true)
        host.elapse(2500 / speed - 1)
        assert.equal(runOf(store).completedDay, day)
        host.elapse(1)
      } else {
        host.elapse(dayMs / speed - 1)
        assert.equal(runOf(store).completedDay, day)
        host.elapse(1)
      }
      assert.equal(runOf(store).completedDay, day + 1, `${mode}: completed day ${day + 1}`)
      actAfterSettlement(day + 1)
    }
    const run = runOf(store), timeline = runTimeline(run)
    assert.ok(timeline, `${mode}: every settlement and command replays`)
    assert.equal(settlements.length, targetDay + 1)
    return { run, notices, settlements, dailyFacts, postponements, timeline, replay: replayForRun(run) }
  } finally {
    for (const off of cleanup.reverse()) off()
    assert.equal(host.timer, undefined)
    assert.equal(host.listening, false)
  }
}

test("1x and 5x clocks with and without pauses match developer settlements beyond day 120", () => {
  const expected = play("1x")
  for (const mode of ["5x", "pauses", "5x-pauses", "developer"]) {
    const actual = play(mode)
    assert.notStrictEqual(actual.run, expected.run, "each route owns an independent store")
    assert.deepEqual(actual, expected, `${mode}: complete state, ordered notices, daily history and replay agree`)
  }

  const { run, notices, dailyFacts } = expected
  assert.equal(run.completedDay, 160)
  assert.ok(run.balance >= 0)
  assert.ok(run.research.corpus > 2600)
  assert.equal(run.researchBps, 400)
  assert.equal(run.countries.CHN.centers, 1)
  assert.ok(run.adoptionBps > 0 && run.exposureBps < 2500)
  assert.equal(run.research.projects.length, 11)
  assert.equal(notices.filter(({ notice }) => notice.type === "run-ended").length, 0)
  assert.equal(notices.filter(({ notice }) => notice.type === "build-card-bought").length, 1)
  assert.equal(notices.filter(({ notice }) => notice.type === "data-center-built").length, 1)
  assert.ok(notices.filter(({ notice }) => notice.type === "action-used").length >= 1)
  assert.deepEqual(notices.filter(({ day, notice }) => day === 9 && ["research-completed", "event-occurred"].includes(notice.type))
    .map(({ notice }) => [notice.type, notice.project?.skillId ?? notice.entry.content.id]),
  [["research-completed", "agent-tasks"], ["event-occurred", "ai-search"]])
  assert.deepEqual(notices.filter(({ day, notice }) => day === 22 && notice.type === "research-completed")
    .map(({ notice }) => notice.project.skillId), ["multilingual", "reinforcement-learning"])
  assert.ok(dailyFacts[22].corpus - dailyFacts[21].corpus >= 16)
  assert.ok(dailyFacts[23].corpus - dailyFacts[22].corpus >= 18)

  const coding = run.events.find(entry => entry.content.id === "unexpected-coding")
  const followUp = run.events.find(entry => entry.sourceInstanceId === coding.instanceId)
  assert.equal(coding.day, 10)
  assert.equal(coding.resolvedDay, 12)
  assert.equal(followUp.day, 14)
  assert.equal(followUp.content.id, "coding-integrated")
  const completions = notices.filter(({ notice }) => notice.type === "research-completed")
  assert.equal(completions.length, 11)
  assert.equal(new Set(completions.map(({ notice }) => JSON.stringify(notice.project))).size, 11)
  assert.equal(notices.filter(({ notice }) => notice.type === "event-occurred").length, run.events.length)
  assert.equal(new Set(run.events.map(entry => entry.instanceId)).size, run.events.length)
  assert.equal(notices.filter(({ notice }) => notice.type === "decision-resolved").length,
    run.commands.filter(command => command.kind === "chooseEvent").length)
})
