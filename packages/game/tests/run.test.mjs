import assert from "node:assert/strict"
import test from "node:test"
import { advanceWeek, createRun, resolveDecision } from "../run.ts"
import { decisions } from "../../rules/v0.1/events/decisions.ts"
import { eventPool } from "../../rules/v0.1/events/pool.ts"
import { standardScenario } from "../../rules/v0.1/scenario.ts"

const setup = { factionId: "claude", startRegionId: "as", difficultyId: "standard" }
const { rules } = standardScenario

test("legacy starting markets use the continent of their old starting point", () => {
  const startIn = id => createRun({ ...setup, startRegionId: id }, 42)
  const aliases = { eu: ["we", "nordic"], as: ["ee", "ea", "sa", "sea", "ca", "mena"], af: ["ssa"], sam: ["latam"] }
  for (const [id, older] of Object.entries(aliases)) {
    const expected = startIn(id)
    assert.equal(expected.setup.startRegionId, id)
    for (const name of older) assert.deepEqual(startIn(name), expected)
  }
  for (const id of ["europe", "FRA", "ATA", "__proto__", ["eu"], ["ee"]]) assert.equal(startIn(id), null)
})

test("seeded weekly draws cover the pool, use rule intervals and stop at the week limit", () => {
  function play(seed) {
    let run = createRun(setup, seed)
    for (let i = 0; i < rules.maxWeeks; i++) run = advanceWeek(run)
    return run
  }
  const run = play(42)
  assert.deepEqual(run, play(42))
  assert.notDeepEqual(run.events.map(e => e.content.id), play(1).events.map(e => e.content.id))
  assert.equal(run.completedWeek, rules.maxWeeks)
  assert.strictEqual(advanceWeek(run), run)
  assert.equal(new Set(run.events.map(e => e.instanceId)).size, run.events.length)
  assert.deepEqual(new Set(run.events.slice(0, eventPool.length).map(e => e.content.id)), new Set(eventPool.map(e => e.id)))
  let previous = 0
  for (const event of run.events) {
    const gap = event.week - previous
    assert.ok(gap >= rules.eventIntervalWeeks.min && gap <= rules.eventIntervalWeeks.max)
    previous = event.week
  }
  for (const badSeed of [-1, NaN, Infinity, 1.5, 2 ** 32]) assert.equal(createRun(setup, badSeed), null)
})

test("a decision charges once, binds the command to its instance and leaves a free choice when funds run out", () => {
  let run = createRun(setup, 42)
  while (!run.events.some(e => e.content.kind === "decision") && run.completedWeek < rules.maxWeeks) run = advanceWeek(run)
  const entry = run.events.find(e => e.content.kind === "decision")
  assert.ok(entry)
  const choose = (state, choice) => resolveDecision(state, entry.instanceId, entry.content.id, choice)
  const cost = decisions[entry.content.id].choices.find(c => c.id === "rollback").cost
  const poor = { ...run, balance: cost - 1 }
  assert.strictEqual(choose(poor, "rollback"), poor)
  assert.equal(choose(poor, "keep").balance, poor.balance)
  assert.strictEqual(choose(run, "unknown"), run)
  assert.strictEqual(resolveDecision(run, "missing", entry.content.id, "rollback"), run)
  const result = choose(run, "rollback")
  assert.equal(result.balance, run.balance - cost)
  assert.equal(entry.choiceId, undefined)
  assert.deepEqual(result.commands, [
    { kind: "chooseEvent", eventInstanceId: entry.instanceId, choiceId: "rollback", week: run.completedWeek, seq: 1 },
  ])
  assert.strictEqual(choose(result, "keep"), result)
})
