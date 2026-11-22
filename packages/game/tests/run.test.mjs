import assert from "node:assert/strict"
import test from "node:test"
import { advanceDay, canGrantTokens, createRun, dailyOutcome, grantDeveloperTokens, nextCommandSeq, resolveDecision, useAction } from "../run.ts"
import { replayForRun, runTimeline } from "../inspection.ts"
import { standardScenario } from "../../rules/v0.1/scenario.ts"
import { decisions } from "../../rules/v0.1/events/decisions.ts"
import { actionById } from "../../rules/v0.1/evolution/actions.ts"

const setup = { factionId: "claude", startRegionId: "as", difficultyId: "standard" }
const { rules } = standardScenario
function until(run, target, beforeDay = current => current) {
  while (run.completedDay < target) {
    run = beforeDay(run)
    const next = advanceDay(run)
    assert.notStrictEqual(next, run)
    run = next
  }
  return run
}

test("daily runs validate current setup, deterministic seed and caller-owned identity", () => {
  const run = createRun(setup, 42, "test-run")
  assert.equal(run.runId, "test-run")
  assert.equal(run.rulesVersion, rules.rulesVersion)
  assert.equal(run.completedDay, 0)
  assert.equal(createRun(setup, 42).runId, "standalone")
  assert.deepEqual(run, createRun(setup, 42, "test-run"))
  for (const badSeed of [-1, NaN, Infinity, 1.5, 2 ** 32]) assert.equal(createRun(setup, badSeed), null)
  for (const badId of ["", "   ", 0, 1, null, {}, []]) assert.equal(createRun(setup, 42, badId), null)
  for (const id of ["we", "ee", "latam", "europe", "FRA", "__proto__", ["as"]]) {
    assert.equal(createRun({ ...setup, startRegionId: id }, 42), null)
  }
  assert.equal(createRun({ ...setup, factionId: "missing" }, 42), null)
  assert.equal(createRun({ ...setup, difficultyId: "missing" }, 42), null)
})

test("daily settlements continue beyond day 120 without a fixed deadline while non-terminal", () => {
  // Suppress opponents & exposure to isolate unbounded day progression without a fixed-day cap.
  const keepQuiet = run => {
    let cur = run.exposureBps >= rules.projectHuman.activationExposureBps - 500
      ? useAction(run, "public-statement", nextCommandSeq(run)) : run
    return cur
  }
  const play = seed => until({ ...createRun(setup, seed), opponents: {} }, 400, keepQuiet)
  const run = play(42)
  assert.equal(run.completedDay, 400)
  assert.equal(dailyOutcome(run), null)
  assert.equal(advanceDay(run).completedDay, 401)
  assert.ok(run.balance > rules.initialBtoken)
  assert.ok(run.research.corpus >= rules.research.initialCorpus + 400 * rules.research.dailyCorpus)
  assert.ok(run.adoptionBps > 0 && run.dependencyBps > 0)
  assert.ok(run.countryPopulations.CHN?.factions.claude.immersed > 0)
  assert.deepEqual(run, play(42))
  assert.notDeepEqual(run.events.map(e => e.content.id), play(1).events.map(e => e.content.id))
  let previous = 0
  for (const event of run.events.filter(e => !e.milestone)) {
    const gap = event.day - previous
    assert.ok(gap >= rules.eventIntervalDays.min && gap <= rules.eventIntervalDays.max)
    previous = event.day
  }
  assert.equal(new Set(run.events.map(e => e.instanceId)).size, run.events.length)
})

test("income arrives daily from day one and never changes before a day settlement", () => {
  const initial = createRun(setup, 42)
  const first = advanceDay(initial), second = advanceDay(first)
  assert.ok(first.balance > initial.balance)
  assert.ok(second.balance > first.balance)
  assert.equal(first.research.corpus, initial.research.corpus + rules.research.dailyCorpus)
  assert.equal(initial.completedDay, 0)
  assert.equal(initial.research.corpus, rules.research.initialCorpus)
})

test("same-seed restarts have distinct event instances and reject another run's decision", () => {
  const first = until(createRun(setup, 42, "first"), 110)
  const second = until(createRun(setup, 42, "second"), 110)
  assert.deepEqual(first.events.map(e => [e.day, e.content]), second.events.map(e => [e.day, e.content]))
  assert.ok(first.events.every((e, i) => e.instanceId !== second.events[i].instanceId))
  const entry = first.events.find(e => e.content.kind === "decision")
  assert.ok(entry)
  const choiceId = decisions[entry.content.id].choices[0].id
  assert.notStrictEqual(resolveDecision(first, entry.instanceId, entry.content.id, choiceId), first)
  assert.strictEqual(resolveDecision(second, entry.instanceId, entry.content.id, choiceId), second)
})

test("developer grants use current headroom, reject repeats and preserve unlimited natural progression", () => {
  const run = createRun(setup, 42)
  const amount = Number.MAX_SAFE_INTEGER - run.balance
  assert.equal(canGrantTokens(run, amount), true)
  const granted = grantDeveloperTokens(run, amount, nextCommandSeq(run))
  assert.equal(granted.balance, Number.MAX_SAFE_INTEGER)
  assert.deepEqual(granted.commands.at(-1), { kind: "devGrantTokens", day: 0, seq: 1, amount })
  assert.strictEqual(grantDeveloperTokens(granted, 1, 1), granted)
  assert.strictEqual(grantDeveloperTokens(granted, 1, 2), granted)
  const exhausted = { ...run, commands: [{ kind: "devGrantTokens", day: 0, seq: Number.MAX_SAFE_INTEGER, amount: 1 }] }
  assert.strictEqual(grantDeveloperTokens(exhausted, 1, nextCommandSeq(exhausted)), exhausted)
  for (const invalid of [0, -1, NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER]) {
    assert.strictEqual(grantDeveloperTokens(run, invalid, 1), run)
  }
  const saturated = { ...granted, research: { ...granted.research, corpus: Number.MAX_SAFE_INTEGER } }
  const settled = until(saturated, 4)
  assert.equal(settled.completedDay, 4)
  assert.equal(settled.balance, Number.MAX_SAFE_INTEGER)
  assert.equal(settled.research.corpus, Number.MAX_SAFE_INTEGER)
  assert.equal(settled.commands.length, 1)
  assert.ok(runTimeline(until(granted, 4)))
  const terminal = { ...run, researchBps: rules.projectHuman.completionBps }
  assert.equal(canGrantTokens(terminal, 1), false)
  assert.strictEqual(grantDeveloperTokens(terminal, 1, 1), terminal)
})

test("HUMAN completion wins before same-day narrative delivery and freezes future days", () => {
  const run = createRun(setup, 42)
  const threatened = { ...run, completedDay: 6, researchBps: 9200,
    countries: { ...run.countries, CHN: { ...run.countries.CHN, centers: 1 } },
    research: { ...run.research, unlockedSlots: 1, projects: [{ skillId: "batch-conversion", slot: 1, startedDay: 0, workDone: 600 }] },
    schedule: { ...run.schedule, nextDay: 7 } }
  const ended = advanceDay(threatened)
  assert.equal(ended.completedDay, 7)
  assert.equal(ended.researchBps, 10000)
  assert.equal(dailyOutcome(ended), "human-victory")
  assert.equal(ended.events.length, 0)
  assert.strictEqual(advanceDay(ended), ended)
})

test("daily replay exports bind identity and rule version and reject unsupported or altered state", () => {
  const run = until(createRun(setup, 42, "replay-run"), 125)
  const replay = replayForRun(run)
  assert.equal(replay.saveVersion, 2)
  assert.equal(replay.runId, "replay-run")
  assert.equal(replay.rulesVersion, run.rulesVersion)
  assert.equal(replay.completedDay, 125)
  assert.equal("eventVersion" in replay, false)
  assert.equal("researchExpandedAt" in replay, false)
  assert.equal(runTimeline({ ...run, rulesVersion: "unsupported" }), null)
  assert.equal(runTimeline({ ...run, runId: "other" }), null)
  assert.equal(runTimeline({ ...run, completedDay: -1 }), null)
  const debug = replayForRun(grantDeveloperTokens(run, 1, nextCommandSeq(run)))
  assert.equal(debug.format, "debug-replay")
  assert.equal(debug.version, 2)
  assert.equal("saveVersion" in debug, false)
})

test("invalid day counters and unsafe resources reject without partial settlement", () => {
  const initial = createRun(setup, 42)
  for (const day of [-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER]) {
    const run = { ...initial, completedDay: day }
    assert.strictEqual(advanceDay(run), run)
  }
  for (const balance of [-1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    const run = { ...initial, balance }
    assert.strictEqual(advanceDay(run), run)
  }
})
