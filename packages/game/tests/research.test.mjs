import assert from "node:assert/strict"
import test from "node:test"
import { researchNode, trees } from "../../rules/v0.1/evolution/trees.ts"
import { standardScenario } from "../../rules/v0.1/scenario.ts"
import { replayForRun, runTimeline } from "../inspection.ts"
import { computePressure, corpusYieldBreakdown } from "../operations.ts"
import {
  activeResearchComputeLoad,
  canMoveResearch,
  cancelCascadeSlots,
  completedLevel,
  dailyCorpus,
  firstIdleSlot,
  isProjectCompleted,
  isProjectRunning,
  isProjectWaitingCorpus,
  nextQueuedResearchCost,
  projectQueueEstimatedDays,
  projectWorkDone,
  queuedResearchProjects,
  researchAttributes,
  researchCost,
  researchStatus,
  slotProject,
} from "../research.ts"
import {
  advanceDay,
  buildDataCenter,
  buyBuildCard,
  cancelResearch,
  createRun,
  grantDeveloperTokens,
  moveResearch,
  nextCommandSeq,
  startResearch,
  unlockResearchSlot,
} from "../run.ts"

const { research: rules } = standardScenario.rules
const fresh = () => createRun({ factionId: "claude", startRegionId: "as", difficultyId: "standard" }, 42)
const start = (run, id) => startResearch(run, id, nextCommandSeq(run))
const cancel = (run, slot) => cancelResearch(run, slot, nextCommandSeq(run))
const move = (run, fromSlot, toSlot) => moveResearch(run, fromSlot, toSlot, nextCommandSeq(run))
const status = (run, id) => researchStatus(run, researchNode(id))

function until(run, day) {
  while (run.completedDay < day) {
    const next = advanceDay(run)
    assert.notStrictEqual(next, run)
    run = next
  }
  return run
}

function untilDone(run, ...ids) {
  let guard = 0
  while (ids.some(id => run.research.projects.some(p => p.skillId === id && !isProjectCompleted(run, p)))) {
    const next = advanceDay(run)
    assert.notStrictEqual(next, run)
    run = next
    guard++
    assert.ok(guard < 300, `research ${ids.join(",")} did not finish within 300 days`)
  }
  return run
}

function withComputeHeadroom(run, centers = 4) {
  let next = grantDeveloperTokens(run, 10_000, nextCommandSeq(run))
  for (let i = 0; i < centers; i++) {
    next = buyBuildCard(next, nextCommandSeq(next))
    next = buildDataCenter(next, "as", nextCommandSeq(next))
  }
  return next
}

test("all 7 serial queue slots start unlocked and support free blueprint chaining with auto-pay at slot 1", () => {
  let run = fresh()
  assert.equal(run.research.unlockedSlots, 7)
  assert.equal(firstIdleSlot(run), 1)
  // All 7 slots are already open, so unlockResearchSlot is rejected for every slot.
  for (const slot of [0, 1, 2, 7, 8, -1, 1.5, NaN]) {
    assert.strictEqual(unlockResearchSlot(run, slot, nextCommandSeq(run)), run)
  }

  // Enqueue a 4-step dependency chain right on Day 0 even with only initial corpus:
  // Slot 1 (social-sharing) pays immediately and runs; Slots 2-4 plan free without consuming corpus or compute!
  const beforeCorpus = run.research.corpus
  run = start(run, "social-sharing")
  const p1 = slotProject(run, 1)
  assert.equal(p1.skillId, "social-sharing")
  assert.equal(isProjectRunning(run, p1), true)
  assert.equal(p1.paidCost, researchNode("social-sharing").skill.cost)
  assert.equal(run.research.corpus, beforeCorpus - p1.paidCost)
  assert.equal(activeResearchComputeLoad(run), researchNode("social-sharing").skill.computeLoad)

  // Prerequisite is satisfied because social-sharing is already ahead in the queue!
  assert.equal(status(run, "multilingual"), "available")
  const corpusAfterFirst = run.research.corpus
  run = start(run, "multilingual")
  run = start(run, "api-ecosystem")
  run = start(run, "open-source")
  assert.equal(run.research.corpus, corpusAfterFirst, "queued blueprints do not prepay corpus")
  assert.equal(activeResearchComputeLoad(run), researchNode("social-sharing").skill.computeLoad, "only slot 1 uses training compute")
  assert.equal(status(run, "social-sharing"), "active")
  assert.equal(status(run, "api-ecosystem"), "queued")
  assert.equal(status(run, "open-source"), "queued")
  assert.equal(status(run, "closed-subscription"), "excluded", "queued exclusive tech reserves its branch immediately")
  assert.equal(firstIdleSlot(run), 5)

  // Fill remaining 3 slots to reach 7/7 and verify slot 8 is rejected.
  run = start(run, "daily-chat")
  run = start(run, "inference-efficiency")
  run = start(run, "quantization")
  assert.equal(firstIdleSlot(run), null)
  assert.strictEqual(start(run, "weekly-reports"), run)
  assert.equal(queuedResearchProjects(run).length, 7)

  // When slot 1 finishes, slot 2 automatically promotes to slot 1. If corpus is insufficient, it waits and auto-starts once corpus arrives.
  const waiting = { ...run, research: { ...run.research, corpus: 0 } }
  const afterDay2 = until(waiting, 2)
  assert.equal(completedLevel(afterDay2, "social-sharing"), 1)
  const head = slotProject(afterDay2, 1)
  assert.equal(head.skillId, "multilingual")
  if (isProjectWaitingCorpus(afterDay2, head)) {
    assert.equal(activeResearchComputeLoad(afterDay2), 0, "waiting head consumes 0 compute")
  }
  const doneChain = untilDone(run, "social-sharing", "multilingual")
  assert.equal(completedLevel(doneChain, "social-sharing"), 1)
  assert.equal(completedLevel(doneChain, "multilingual"), 1)
  assert.ok(runTimeline(doneChain))
  assert.deepEqual(replayForRun(doneChain).commands, doneChain.commands)
})

test("repeatable technologies can be stacked across all 7 slots with escalating projected costs", () => {
  const node = researchNode("multilingual")
  let run = withComputeHeadroom(until(fresh(), 40), 3)
  run = start(run, "social-sharing")
  run = untilDone(run, "social-sharing")

  // Queue 7 consecutive levels of multilingual to fill the entire serial queue.
  for (let i = 0; i < 7; i++) {
    const expectedNext = node.skill.cost + i * node.skill.repeatCostStep
    assert.equal(nextQueuedResearchCost(run, node), expectedNext)
    run = start(run, "multilingual")
  }
  assert.equal(firstIdleSlot(run), null)
  assert.equal(queuedResearchProjects(run).length, 7)
  assert.strictEqual(start(run, "multilingual"), run, "cannot exceed 7 slots")
  assert.equal(slotProject(run, 1).paidCost, node.skill.cost)
  assert.equal(slotProject(run, 2).paidCost, undefined)

  // Complete first two levels in sequence and verify corpus income & level scaling.
  const startCorpusIncome = dailyCorpus(run)
  run = until(run, run.completedDay + node.skill.days)
  assert.equal(completedLevel(run, "multilingual"), 1)
  assert.equal(dailyCorpus(run), startCorpusIncome + node.skill.dailyCorpusBonus)
  assert.equal(slotProject(run, 1).paidCost, node.skill.cost + node.skill.repeatCostStep)
  assert.equal(queuedResearchProjects(run).length, 6)
  assert.ok(runTimeline(run))
})

test("cancelling slot 1 refunds paid corpus and cascades dependent blueprints; reordering preserves partial progress", () => {
  let run = withComputeHeadroom(until(fresh(), 18), 2)
  const corpusStart = run.research.corpus

  // Build queue: #1 social-sharing (paid, 2d), #2 multilingual (depends on #1), #3 daily-chat (independent).
  run = start(run, "social-sharing")
  run = start(run, "multilingual")
  run = start(run, "daily-chat")
  assert.equal(slotProject(run, 1).paidCost, researchNode("social-sharing").skill.cost)

  // Advance 1 day so social-sharing has 100/200 progress done.
  run = advanceDay(run)
  assert.equal(projectWorkDone(run, slotProject(run, 1)), 100)

  // Illegal move: cannot move multilingual (#2) before its prerequisite social-sharing (#1).
  assert.equal(canMoveResearch(run, 2, 1), false)
  assert.strictEqual(move(run, 2, 1), run)

  // Legal urgent jump: move independent daily-chat (#3) to slot 1!
  // social-sharing shifts to #2 while keeping its paidCost and 100 workDone intact!
  assert.equal(canMoveResearch(run, 3, 1), true)
  const corpusBeforeJump = run.research.corpus
  run = move(run, 3, 1)
  assert.equal(slotProject(run, 1).skillId, "daily-chat")
  assert.equal(slotProject(run, 1).paidCost, researchNode("daily-chat").skill.cost)
  assert.equal(run.research.corpus, corpusBeforeJump - researchNode("daily-chat").skill.cost)
  assert.equal(slotProject(run, 2).skillId, "social-sharing")
  assert.equal(slotProject(run, 2).paidCost, researchNode("social-sharing").skill.cost)
  assert.equal(projectWorkDone(run, slotProject(run, 2)), 100, "displaced slot 1 preserves its progress")
  assert.equal(slotProject(run, 3).skillId, "multilingual")

  // Finish daily-chat (2 days). social-sharing returns to slot 1 with 0 extra cost and finishes in just 1 remaining day!
  run = untilDone(run, "daily-chat")
  const resumed = slotProject(run, 1)
  assert.equal(resumed.skillId, "social-sharing")
  assert.equal(projectWorkDone(run, resumed), 100)
  const beforeResumeDay = run.completedDay
  run = advanceDay(run)
  assert.equal(completedLevel(run, "social-sharing"), 1)
  assert.equal(run.completedDay, beforeResumeDay + 1, "resumed project only needed its remaining 1 day")
  assert.ok(runTimeline(run))

  // Now test cancelling paid slot 1 with a dependent blueprint behind it: refunds paidCost and cascades dependent removal.
  let run2 = withComputeHeadroom(until(fresh(), 18), 2)
  run2 = start(run2, "social-sharing")
  run2 = start(run2, "multilingual")
  run2 = start(run2, "edge-deployment")
  run2 = start(run2, "daily-chat")
  assert.deepEqual(cancelCascadeSlots(run2, 1), [1, 2, 3])
  const corpusBeforeCancel = run2.research.corpus
  const refund = slotProject(run2, 1).paidCost
  run2 = cancel(run2, 1)
  // daily-chat promotes to slot 1 and auto-pays its own cost, net corpus change = +refund - dailyChatCost.
  assert.equal(slotProject(run2, 1).skillId, "daily-chat")
  assert.equal(queuedResearchProjects(run2).length, 1)
  assert.equal(run2.research.corpus, corpusBeforeCancel + refund - researchNode("daily-chat").skill.cost)
  assert.equal(status(run2, "social-sharing"), "available")
  assert.equal(status(run2, "multilingual"), "locked")
  assert.ok(runTimeline(run2))
  assert.ok(corpusStart > 0)
})

test("exclusive routes reserve on enqueue, unlock if cancelled, and either route unlocks global-default", () => {
  for (const [route, other] of [["open-source", "closed-subscription"], ["closed-subscription", "open-source"]]) {
    let run = withComputeHeadroom(until(fresh(), 25), 3)
    run = start(run, "social-sharing")
    run = start(run, "api-ecosystem")
    run = start(run, "multilingual")
    run = start(run, route)
    assert.equal(status(run, other), "excluded")
    assert.strictEqual(start(run, other), run)

    // Cancelling the queued exclusive tech restores the alternate branch!
    const cancelled = cancel(run, 4)
    assert.equal(status(cancelled, other), "available")

    run = start(run, "edge-deployment")
    run = start(run, "global-default")
    assert.ok(projectQueueEstimatedDays(run, 6, 100) >= 10)
    const bpsBeforeGlobal = run.researchBps
    run = untilDone(run, "global-default")
    assert.ok(run.researchBps >= bpsBeforeGlobal + researchNode("global-default").skill.dangerBps)
    assert.strictEqual(start(run, other), run)
    assert.strictEqual(start(run, "global-default"), run)
    assert.ok(runTimeline(run))
  }
})

test("version-rebuild pays a +3 corpus serial relay bonus when a project finishes with another queued behind it", () => {
  let run = withComputeHeadroom(until(fresh(), 45), 4)
  for (const id of ["inference-efficiency", "multimodal", "reinforcement-learning", "regulatory-adaptation", "version-rebuild"]) {
    run = start(run, id)
  }
  run = untilDone(run, "version-rebuild")

  // Finishing a lone study with nothing queued behind it yields standard corpus (no relay bonus).
  let solo = start(run, "social-sharing")
  solo = advanceDay(solo)
  const soloBefore = solo
  const soloExpected = corpusYieldBreakdown(soloBefore).totalDaily
  const soloAfter = advanceDay(soloBefore)
  assert.ok(Math.abs((soloAfter.research.corpus - soloBefore.research.corpus) - soloExpected) <= 1)

  // Finishing a study with another queued behind it pays +3 relay bonus (before slot 2 auto-pays if affordable).
  let relay = start(start(run, "social-sharing"), "daily-chat")
  relay = advanceDay(relay)
  const relayBefore = relay
  const dailyCost = researchNode("daily-chat").skill.cost
  const relayExpected = corpusYieldBreakdown(relayBefore).totalDaily
  const relayAfter = advanceDay(relayBefore)
  assert.equal(completedLevel(relayAfter, "social-sharing"), 1)
  assert.equal(slotProject(relayAfter, 1).skillId, "daily-chat")
  const netGain = relayAfter.research.corpus - relayBefore.research.corpus + dailyCost
  assert.equal(netGain - relayExpected, 3)
  assert.ok(runTimeline(relayAfter))
})

test("compute overload slows active slot-1 research while idle or waiting slots reject invalid inputs", () => {
  let run = until(fresh(), 35)
  // Without data centers, high-CU research triggers compute overload and slows progress below 100 work/day.
  run = start(run, "inference-efficiency")
  run = start(run, "multimodal")
  run = untilDone(run, "inference-efficiency")
  // Without data centers, high user + synthetic inference load plus multimodal CU overloads a 0-center run.
  let heavy = { ...run, markets: { ...run.markets, as: { ...run.markets.as, users: 1_500_000_000, synthetics: 300_000_000 } } }
  const cp = computePressure(heavy)
  assert.ok(cp.status === "overloaded" || cp.status === "critical")
  assert.ok(cp.researchWorkPerDay < 100)
  const startedDay = heavy.completedDay
  heavy = untilDone(heavy, "multimodal")
  assert.ok(heavy.completedDay - startedDay > researchNode("multimodal").skill.days)

  // Validation checks: unknown skill, stale seq, invalid cancel/move slots, terminal run.
  const base = fresh()
  for (const id of ["missing", "__proto__", ["social-sharing"]]) assert.strictEqual(start(base, id), base)
  assert.strictEqual(startResearch(base, "social-sharing", nextCommandSeq(base) - 1), base)
  assert.strictEqual(cancel(base, 1), base)
  assert.strictEqual(move(base, 1, 2), base)
  const terminal = { ...base, researchBps: standardScenario.rules.projectHuman.completionBps }
  assert.strictEqual(start(terminal, "social-sharing"), terminal)
  assert.strictEqual(advanceDay(terminal), terminal)

  // Verify attributes apply strictly on completion, never while merely queued.
  let attrRun = withComputeHeadroom(until(fresh(), 12), 2)
  const baseline = { spread: 100, appeal: 100, profit: 100, danger: 100 }
  attrRun = start(start(attrRun, "social-sharing"), "daily-chat")
  assert.deepEqual(researchAttributes(attrRun), baseline)
  attrRun = untilDone(attrRun, "social-sharing", "daily-chat")
  assert.deepEqual(researchAttributes(attrRun), { ...baseline, spread: 106, appeal: 105 })
  assert.ok(trees.length === 3)
  assert.equal(researchCost(fresh(), researchNode("social-sharing")), researchNode("social-sharing").skill.cost)
})
