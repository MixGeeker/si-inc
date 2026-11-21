import assert from "node:assert/strict"
import test from "node:test"
import { researchNode, trees } from "../../rules/v0.1/evolution/trees.ts"
import { standardScenario } from "../../rules/v0.1/scenario.ts"
import { replayForRun, runTimeline } from "../inspection.ts"
import { corpusYieldBreakdown } from "../operations.ts"
import { completedLevel, completionDay, firstIdleSlot, researchAttributes, researchCost, researchState, researchStatus, slotProject, dailyCorpus } from "../research.ts"
import { advanceDay, createRun, nextCommandSeq, startResearch, unlockResearchSlot } from "../run.ts"

const { research: rules } = standardScenario.rules
const fresh = () => createRun({ factionId: "claude", startRegionId: "as", difficultyId: "standard" }, 42)
const unlock = (run, slot) => unlockResearchSlot(run, slot, nextCommandSeq(run))
const start = (run, id) => startResearch(run, id, nextCommandSeq(run))
const status = (run, id) => researchStatus(run, researchNode(id))
function until(run, day) {
  while (run.completedDay < day) {
    const next = advanceDay(run)
    assert.notStrictEqual(next, run)
    run = next
  }
  return run
}

test("the seven research slots charge in order and reject invalid, unaffordable and repeated orders", () => {
  let run = fresh()
  assert.equal(rules.slotCosts.length, 7)
  assert.ok(rules.slotCosts.every((cost, i) => Number.isSafeInteger(cost) && cost > (rules.slotCosts[i - 1] ?? 0)))
  assert.strictEqual(start(run, "social-sharing"), run)
  for (const slot of [2, 7, 0, -1, 1.5, NaN, "1", null]) assert.strictEqual(unlock(run, slot), run)
  for (let slot = 1; slot <= rules.slotCosts.length; slot++) {
    const cost = rules.slotCosts[slot - 1]
    while (researchState(run).corpus < cost) {
      assert.strictEqual(unlock(run, slot), run)
      run = advanceDay(run)
    }
    const before = run, seq = nextCommandSeq(run)
    assert.strictEqual(unlockResearchSlot(run, slot, seq + 1), run)
    run = unlock(run, slot)
    assert.equal(run.research.unlockedSlots, slot)
    assert.equal(run.research.corpus, before.research.corpus - cost)
    assert.equal(run.balance, before.balance)
    assert.deepEqual(run.commands.at(-1), { kind: "unlockResearchSlot", slot, day: run.completedDay, seq })
    assert.strictEqual(unlockResearchSlot(run, slot, seq), run)
    assert.strictEqual(unlock(run, slot), run)
  }
  assert.strictEqual(unlock(run, 8), run)
  assert.ok(runTimeline(run))
  assert.equal(fresh().research.unlockedSlots, 0)
})

test("seven simultaneous projects use distinct slots, finish on game days and replay both balances", () => {
  let run = until(fresh(), 45)
  for (let i = 1; i <= 7; i++) run = unlock(run, i)
  const roots = trees.map(t => t.skills[0].id)
  for (const id of roots) run = start(run, id)
  assert.strictEqual(start(run, roots[0]), run)
  assert.strictEqual(start(run, "multilingual"), run)
  run = advanceDay(run)
  assert.equal(status(run, roots[0]), "active")
  run = advanceDay(run)
  assert.equal(firstIdleSlot(run), 1)
  assert.equal(status(run, roots[0]), "completed")
  const eligible = trees.flatMap(t => t.skills).filter(s => status(run, s.id) === "available")
  for (const [i, skill] of eligible.slice(0, 7).entries()) {
    run = start(run, skill.id)
    assert.equal(slotProject(run, i + 1).skillId, skill.id)
  }
  assert.equal(firstIdleSlot(run), null)
  assert.strictEqual(start(run, eligible[7].id), run)
  const rows = runTimeline(run)
  assert.equal(rows[0].corpusAfter, run.research.corpus)
  assert.equal(rows[0].corpusBefore - rows[0].corpusAfter, eligible[6].cost)
  assert.equal(rows[0].before, rows[0].after)
  assert.deepEqual(replayForRun(run).commands, run.commands)
  const lastDay = Math.max(...run.research.projects.map(completionDay))
  run = until(run, lastDay)
  assert.equal(firstIdleSlot(run), 1)
  assert.ok(eligible.slice(0, 7).every(s => completedLevel(run, s.id) === 1))
})

test("exclusive routes reserve their stage on start and either completed route unlocks the final project", () => {
  for (const [route, other] of [["open-source", "closed-subscription"], ["closed-subscription", "open-source"]]) {
    let run = unlock(unlock(until(fresh(), 12), 1), 2)
    function finish(...ids) {
      for (const id of ids) run = start(run, id)
      run = until(run, Math.max(...run.research.projects.map(completionDay)))
      for (const id of ids) assert.equal(completedLevel(run, id), 1)
    }
    finish("social-sharing")
    finish("api-ecosystem", "multilingual")
    run = start(run, route)
    assert.equal(status(run, other), "excluded")
    assert.strictEqual(start(run, other), run)
    assert.strictEqual(start(run, "global-default"), run)
    finish("edge-deployment")
    assert.strictEqual(start(run, other), run)
    finish("global-default")
    assert.equal(run.researchBps, researchNode("global-default").skill.dangerBps)
    assert.strictEqual(start(run, "global-default"), run)
    assert.ok(runTimeline(run))
  }
})

test("repeatable levels earn corpus from the following day and require the new price and a free slot", () => {
  const node = researchNode("multilingual")
  let run = unlock(unlock(until(fresh(), 5), 1), 2)
  run = start(run, "social-sharing")
  run = until(run, completionDay(slotProject(run, 1)))
  for (let level = 0; level < 3; level++) {
    const expectedPrice = node.skill.cost + level * node.skill.repeatCostStep
    assert.equal(researchCost(run, node), expectedPrice)
    assert.equal(status(run, node.skill.id), level ? "upgradable" : "available")
    const poor = { ...run, research: { ...run.research, corpus: expectedPrice - 1 } }
    assert.strictEqual(start(poor, node.skill.id), poor)
    const before = run
    run = start(run, node.skill.id)
    assert.equal(run.research.corpus, before.research.corpus - expectedPrice)
    assert.equal(firstIdleSlot(run), 2)
    assert.strictEqual(start(run, node.skill.id), run)
    if (level) assert.equal(status(run, "edge-deployment"), "available")
    assert.equal(dailyCorpus(run), rules.dailyCorpus + level * node.skill.dailyCorpusBonus)
    const end = completionDay(slotProject(run, 1))
    run = until(run, end - 1)
    const lastIncome = dailyCorpus(run), lastBalance = run.research.corpus
    const expectedGain = corpusYieldBreakdown(run).totalDaily
    run = advanceDay(run)
    assert.ok(run.research.corpus - lastBalance >= lastIncome)
    assert.ok(Math.abs((run.research.corpus - lastBalance) - expectedGain) <= 1)
    assert.equal(completedLevel(run, node.skill.id), level + 1)
    assert.equal(dailyCorpus(run), lastIncome + node.skill.dailyCorpusBonus)
    assert.equal(firstIdleSlot(run), 1)
    assert.ok(runTimeline(run))
  }
})

test("research rejects unknown skills, stale sequences, short funds and terminal state", () => {
  let run = unlock(until(fresh(), 3), 1)
  for (const id of ["missing", "__proto__", ["social-sharing"]]) assert.strictEqual(start(run, id), run)
  assert.strictEqual(startResearch(run, "social-sharing", nextCommandSeq(run) - 1), run)
  const poor = { ...run, research: { ...run.research, corpus: researchNode("social-sharing").skill.cost - 1 } }
  assert.strictEqual(start(poor, "social-sharing"), poor)
  run = { ...run, researchBps: standardScenario.rules.projectHuman.completionBps }
  assert.strictEqual(start(run, "social-sharing"), run)
  assert.strictEqual(unlock(run, 2), run)
  assert.strictEqual(advanceDay(run), run)
})

test("project deltas apply once on completion, stack per level, and cross-page prerequisites require each group", () => {
  let run = unlock(unlock(until(fresh(), 15), 1), 2)
  const baseline = { spread: 100, appeal: 100, profit: 100, danger: 100 }
  run = start(start(run, "social-sharing"), "daily-chat")
  assert.deepEqual(researchAttributes(run), baseline)
  run = until(run, 17)
  assert.deepEqual(researchAttributes(run), { ...baseline, spread: 106, appeal: 105 })
  assert.strictEqual(start(run, "remix-templates"), run)
  run = start(start(run, "tone-matching"), "multilingual")
  run = until(run, 19)
  assert.equal(status(run, "remix-templates"), "available")
  run = until(run, 20)
  run = start(run, "multilingual")
  run = until(run, 23)
  assert.deepEqual(researchAttributes(run), { ...baseline, spread: 110, appeal: 112 })
  assert.deepEqual(researchAttributes(fresh()), baseline)
})

test("parallel completion pays once beginning after model redesign, including a three-project day", () => {
  let run = until(fresh(), 32)
  for (const s of [1,2,3]) run = unlock(run, s)
  run = until(start(run, "inference-efficiency"), 34)
  for (const id of ["multimodal","reinforcement-learning","regulatory-adaptation"]) run=start(run,id)
  run = until(run, 38)
  run = start(run, "version-rebuild")
  run = until(run, 41)
  run = start(run, "request-cache")
  run = until(run, 42)
  const singleDay = advanceDay(run)
  const singleExpected = corpusYieldBreakdown(run).totalDaily
  assert.ok(Math.abs((singleDay.research.corpus - run.research.corpus) - singleExpected) <= 1)
  run = singleDay
  for (const id of ["social-sharing","daily-chat","weekly-reports"]) run=start(run,id)
  run = advanceDay(run)
  const withoutParallel = advanceDay({ ...run, research: { ...run.research, projects: run.research.projects.filter(p => p.startedDay < 43) } })
  const withParallel = advanceDay(run)
  assert.equal((withParallel.research.corpus - run.research.corpus) - (withoutParallel.research.corpus - run.research.corpus), 3)
  assert.ok(runTimeline(withParallel))
})

test("both exclusive policies reserve on opening and block only their dependent branches", () => {
  for (const channel of ["open-source","closed-subscription"]) {
    for (const policy of ["human-approval","autonomous-decisions"]) {
      let run = until(fresh(), 30)
      for (const slot of [1,2,3]) run = unlock(run,slot)
      for (const id of ["daily-chat","weekly-reports","api-ecosystem"]) run=start(run,id)
      run=until(run,33)
      for (const id of ["long-memory","agent-tasks","enterprise-workflows"]) run=start(run,id)
      run=until(run,37)
      run=start(start(run,channel),policy)
      for (const chosen of [channel,policy]) {
        const other = researchNode(chosen).skill.excludes
        assert.equal(status(run,other),"excluded")
        assert.strictEqual(start(run,other),run)
      }
      assert.equal(status(run,policy === "human-approval" ? "full-delegation" : "live-handoff"),"excluded")
      assert.equal(status(run,channel === "open-source" ? "metered-billing" : "community-mirrors"),"excluded")
      const reachable = trees.flatMap(t=>t.skills).filter(s=>status(run,s.id)!=="excluded")
      assert.equal(reachable.length,46)
      assert.equal(status(run,"global-default"),"locked")
      assert.ok(runTimeline(run))
    }
  }
})

test("a two-day study completes at the second settlement and unlocks its prerequisites atomically", () => {
  let run = unlock(fresh(), 1)
  run = start(run, "daily-chat")
  assert.equal(run.research.projects[0].startedDay, 0)
  assert.equal(completionDay(run.research.projects[0]), 2)
  run = advanceDay(run)
  assert.equal(status(run, "daily-chat"), "active")
  assert.equal(status(run, "agent-tasks"), "locked")
  run = advanceDay(run)
  assert.equal(status(run, "daily-chat"), "completed")
  assert.equal(firstIdleSlot(run), 1)
  assert.equal(status(run, "agent-tasks"), "available")
  const next = start(run, "agent-tasks")
  assert.equal(next.research.projects.at(-1).startedDay, 2)
  assert.ok(runTimeline(next))
})
