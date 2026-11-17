import assert from "node:assert/strict"
import test from "node:test"
import { decisions } from "../../rules/v0.1/events/decisions.ts"
import { standardScenario } from "../../rules/v0.1/scenario.ts"
import { completionWeek, researchState } from "../research.ts"
import { replayForRun, runTimeline } from "../inspection.ts"
import { advanceWeek, createRun, decisionChoiceStatus, decisionEffectForRun, nextCommandSeq, resolveDecision, startResearch, unlockResearchSlot, weeklyOutcome } from "../run.ts"

const setup = { factionId: "claude", startRegionId: "as", difficultyId: "standard" }
const limit = standardScenario.rules.maxWeeks
const codingId = "unexpected-coding"
const ordinaryIds = ["community-router", "inference-dividend", "audit-request", "research-exchange"]
const fresh = (seed = 42, version = 1) => createRun(setup, seed, version)
const codingEntry = run => run.events.find(entry => entry.content.id === codingId)
function until(run, target) {
  while (run.completedWeek < target) {
    const next = advanceWeek(run)
    assert.notStrictEqual(next, run, `stopped before week ${target}`)
    run = next
  }
  return run
}
function agentResearch(seed = 42) {
  let run = fresh(seed)
  run = unlockResearchSlot(run, 1, nextCommandSeq(run))
  run = startResearch(run, "daily-chat", nextCommandSeq(run))
  run = until(run, completionWeek(run.research.projects.at(-1)))
  run = startResearch(run, "agent-tasks", nextCommandSeq(run))
  assert.equal(run.research.projects.at(-1).skillId, "agent-tasks")
  return run
}
function withCoding(seed = 42) {
  let run = agentResearch(seed)
  const completion = completionWeek(run.research.projects.at(-1))
  run = until(run, completion + 2)
  assert.ok(codingEntry(run))
  return run
}
function select(run, entry, choiceId) {
  return resolveDecision(run, entry.instanceId, entry.content.id, choiceId)
}
function ordinaryExample(id, humanBps = 2000) {
  for (let seed = 1; seed <= 24; seed++) {
    const run = until({ ...fresh(seed), researchBps: humanBps }, 110)
    const entry = run.events.find(event => event.content.id === id)
    if (entry) return { run, entry }
  }
  assert.fail(`no eligible example for ${id}`)
}

test("autonomous coding follows completed agent research after a seeded delay, once per run", () => {
  const empty = until(fresh(), limit)
  assert.equal(codingEntry(empty), undefined)
  const timings = new Set()
  for (const seed of [1, 2, 8, 42, 0x80000000, 0xffffffff]) {
    let run = agentResearch(seed)
    const completion = completionWeek(run.research.projects.at(-1))
    run = until(run, completion)
    assert.equal(codingEntry(run), undefined)
    run = until(run, completion + 2)
    const entry = codingEntry(run)
    assert.ok([1, 2].includes(entry.week - completion))
    timings.add(entry.week - completion)
    assert.equal(entry.sourceSkillId, "agent-tasks")
    assert.deepEqual(run, withCoding(seed))
    const end = until(run, limit)
    assert.equal(end.events.filter(event => event.content.id === codingId).length, 1)
  }
  assert.equal(timings.size, 2)
  assert.equal(fresh().events.length, 0)
})

test("ordinary events obey time and risk qualifications and cannot recur when their bag refills", () => {
  const peace = until(fresh(), limit)
  assert.equal(peace.events.some(entry => entry.content.id === "audit-request"), false)
  function play(seed) {
    return until({ ...fresh(seed), researchBps: 1200 }, limit)
  }
  const run = play(42)
  assert.deepEqual(run, play(42))
  assert.notDeepEqual(run.events.map(entry => entry.content.id), play(8).events.map(entry => entry.content.id))
  const encountered = new Set()
  for (let seed = 1; seed <= 24; seed++) {
    const sample = play(seed)
    for (const id of ordinaryIds) {
      const entries = sample.events.filter(entry => entry.content.id === id)
      assert.ok(entries.length <= 1, id)
      if (entries[0]) {
        encountered.add(id)
        assert.ok(entries[0].week >= decisions[id].minWeek, id)
      }
    }
  }
  assert.deepEqual([...encountered].sort(), [...ordinaryIds].sort())
  assert.equal(new Set(run.events.map(entry => entry.instanceId)).size, run.events.length)
  assert.ok(run.events.every(entry => !["coding-integrated", "coding-isolated"].includes(entry.content.id)))
})

test("every ordinary branch settles the advertised resources together and records actual results", () => {
  for (const id of ordinaryIds) {
    const { run: timeline, entry } = ordinaryExample(id)
    for (const choice of decisions[id].choices) {
      const run = { ...timeline, balance: 100, researchBps: 2000,
        research: { ...researchState(timeline), corpus: 100 } }
      assert.equal(decisionChoiceStatus(run, id, choice.id), "available")
      const after = select(run, entry, choice.id)
      assert.notStrictEqual(after, run, `${id}/${choice.id}`)
      assert.equal(after.balance, run.balance - choice.cost + choice.effect.tokens)
      assert.equal(after.research.corpus, run.research.corpus - choice.corpusCost + choice.effect.corpus)
      assert.equal(after.researchBps, Math.max(0, Math.min(10000, run.researchBps + choice.effect.humanBps)))
      const settled = after.events.find(event => event.instanceId === entry.instanceId)
      assert.equal(settled.choiceId, choice.id)
      assert.equal(settled.resolvedWeek, run.completedWeek)
      assert.deepEqual(settled.effect, { tokens: after.balance - run.balance,
        corpus: after.research.corpus - run.research.corpus, humanBps: after.researchBps - run.researchBps })
      assert.equal(entry.choiceId, undefined)
      assert.strictEqual(select(after, entry, choice.id), after)
      assert.deepEqual(after.commands.at(-1), { kind: "chooseEvent", week: run.completedWeek,
        seq: nextCommandSeq(run), eventInstanceId: entry.instanceId, choiceId: choice.id })
    }
  }
})

test("resources are checked before grants and invalid or duplicate choices preserve the snapshot", () => {
  const run = withCoding(), entry = codingEntry(run)
  const paid = decisions[codingId].choices.find(choice => choice.cost > 0)
  const poor = { ...run, balance: paid.cost - 1 }
  assert.deepEqual(decisionEffectForRun(poor, codingId, paid.id), { tokens: -2, corpus: 16, humanBps: 400 })
  assert.equal(decisionChoiceStatus(poor, codingId, paid.id), "tokens")
  assert.strictEqual(select(poor, entry, paid.id), poor)
  assert.strictEqual(select(run, entry, "missing-choice"), run)
  assert.strictEqual(resolveDecision(run, "stale-instance", codingId, paid.id), run)
  assert.strictEqual(resolveDecision(run, entry.instanceId, "community-router", paid.id), run)

  const normal = until(fresh(), 110)
  const corpusEntry = normal.events.find(event => event.content.kind === "decision"
    && decisions[event.content.id].choices.some(choice => choice.corpusCost > 0))
  assert.ok(corpusEntry)
  const corpusChoice = decisions[corpusEntry.content.id].choices.find(choice => choice.corpusCost > 0)
  const noCorpus = { ...normal, research: { ...researchState(normal), corpus: corpusChoice.corpusCost - 1 } }
  assert.equal(decisionChoiceStatus(noCorpus, corpusEntry.content.id, corpusChoice.id), "corpus")
  assert.strictEqual(select(noCorpus, corpusEntry, corpusChoice.id), noCorpus)

  const cashEntry = normal.events.find(event => event.content.kind === "decision"
    && decisions[event.content.id].choices.some(choice => choice.effect.tokens > 0))
  const cash = decisions[cashEntry.content.id].choices.find(choice => choice.effect.tokens > 0)
  const overflow = { ...normal, balance: Number.MAX_SAFE_INTEGER }
  assert.strictEqual(select(overflow, cashEntry, cash.id), overflow)
})

test("coding branches publish their own follow-up once, two weeks after the actual deferred choice", () => {
  for (const [choiceId, followUpId] of [["keep", "coding-integrated"], ["rollback", "coding-isolated"]]) {
    let run = withCoding(), entry = codingEntry(run)
    run = until(run, entry.week + 5)
    const chosenAt = run.completedWeek
    const before = run
    run = select(run, entry, choiceId)
    assert.notStrictEqual(run, before)
    const settled = codingEntry(run)
    assert.equal(settled.resolvedWeek, chosenAt)
    assert.equal(settled.followUpWeek, chosenAt + 2)
    assert.equal(run.events.some(event => event.sourceInstanceId === entry.instanceId), false)
    run = until(run, chosenAt + 1)
    assert.equal(run.events.some(event => event.sourceInstanceId === entry.instanceId), false)
    run = advanceWeek(run)
    const followUp = run.events.find(event => event.sourceInstanceId === entry.instanceId)
    assert.equal(followUp.content.id, followUpId)
    assert.equal(followUp.sourceChoiceId, choiceId)
    assert.equal(followUp.week, chosenAt + 2)
    assert.ok(runTimeline(run))
    assert.ok(runTimeline(run).some(row => row.event?.instanceId === followUp.instanceId))
    run = until(run, chosenAt + 10)
    assert.equal(run.events.filter(event => event.sourceInstanceId === entry.instanceId).length, 1)
    assert.equal(replayForRun(run).eventVersion, 1)
    assert.ok(runTimeline(run))
  }
})

test("HUMAN effects clamp to real progress and a terminal selection freezes all later inputs", () => {
  const base = withCoding(), entry = codingEntry(base)
  const threatened = { ...base, researchBps: 9900 }
  const result = select(threatened, entry, "keep")
  assert.equal(result.researchBps, 10000)
  assert.equal(codingEntry(result).effect.humanBps, 100)
  assert.equal(weeklyOutcome(result), "human-victory")
  assert.strictEqual(advanceWeek(result), result)
  assert.strictEqual(select(result, entry, "rollback"), result)

  const { run: qualified, entry: audit } = ordinaryExample("audit-request", 200)
  const review = decisions["audit-request"].choices.find(choice => choice.effect.humanBps < 0)
  const preview = decisionEffectForRun(qualified, "audit-request", review.id)
  assert.equal(preview.humanBps, -200)
  const audited = select(qualified, audit, review.id)
  assert.equal(audited.researchBps, 0)
  assert.deepEqual(audited.events.find(event => event.instanceId === audit.instanceId).effect, preview)
})

test("the week limit prevents late follow-ups while preserving the submitted choice", () => {
  let run = withCoding(), entry = codingEntry(run)
  run = until(run, limit - 1)
  run = select(run, entry, "rollback")
  assert.equal(codingEntry(run).resolvedWeek, limit - 1)
  run = advanceWeek(run)
  assert.equal(weeklyOutcome(run), "timeout")
  assert.equal(run.events.some(event => event.sourceInstanceId === entry.instanceId), false)
  assert.equal(codingEntry(run).choiceId, "rollback")
  assert.strictEqual(advanceWeek(run), run)
  assert.ok(runTimeline(run))
})

test("unversioned legacy replays retain old draws, prices and result semantics", () => {
  let run = fresh(42, 0)
  assert.equal(run.eventVersion, undefined)
  while (!codingEntry(run)) run = advanceWeek(run)
  const entry = codingEntry(run), before = run
  assert.deepEqual(decisionEffectForRun(run, codingId, "rollback"), { tokens: -4, corpus: 0, humanBps: 0 })
  assert.equal(decisionChoiceStatus(run, codingId, "rollback"), "available")
  run = select(run, entry, "rollback")
  assert.equal(run.balance, before.balance - 4)
  assert.equal(run.research.corpus, before.research.corpus)
  assert.equal(run.researchBps, before.researchBps)
  assert.equal(codingEntry(run).effect, undefined)
  run = until(run, Math.min(limit, run.completedWeek + 3))
  assert.equal(run.events.some(event => event.sourceInstanceId), false)
  assert.equal(replayForRun(run).eventVersion, undefined)
  assert.ok(runTimeline(run))
})

test("replay inspection rejects altered effects, follow-up schedules and random state", () => {
  let run = withCoding()
  run = select(run, codingEntry(run), "keep")
  run = until(run, run.completedWeek + 2)
  assert.ok(runTimeline(run))
  const changeCoding = change => ({ ...run, events: run.events.map(entry => entry.content.id === codingId ? change(entry) : entry) })
  assert.equal(runTimeline(changeCoding(entry => ({ ...entry, effect: { ...entry.effect, corpus: entry.effect.corpus + 1 } }))), null)
  assert.equal(runTimeline(changeCoding(entry => ({ ...entry, followUpWeek: entry.followUpWeek + 1 }))), null)
  assert.equal(runTimeline({ ...run, schedule: { ...run.schedule, randomState: run.schedule.randomState ^ 1 } }), null)
})
