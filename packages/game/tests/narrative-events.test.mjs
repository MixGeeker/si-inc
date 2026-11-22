import assert from "node:assert/strict"
import test from "node:test"
import { decisions } from "../../rules/v0.1/events/decisions.ts"
import { standardScenario } from "../../rules/v0.1/scenario.ts"
import { completionDay, researchState } from "../research.ts"
import { replayForRun, runTimeline } from "../inspection.ts"
import { advanceDay, createRun, decisionChoiceForRun, decisionChoiceStatus, decisionEffectForRun, nextCommandSeq, nextEventDay, resolveDecision, startResearch, unlockResearchSlot, useAction, dailyOutcome } from "../run.ts"

const setup = { factionId: "claude", startRegionId: "as", difficultyId: "standard" }
const observationDay = 130
const codingId = "unexpected-coding"
const ordinaryIds = ["community-router", "inference-dividend", "audit-request", "research-exchange"]
const fresh = (seed = 42) => createRun(setup, seed)
const soloFresh = (seed = 42) => ({ ...createRun(setup, seed), opponents: {} })
const codingEntry = run => run.events.find(entry => entry.content.id === codingId)
function until(run, target) {
  while (run.completedDay < target) {
    if (run.exposureBps >= 2200) {
      run = useAction(run, "public-statement", nextCommandSeq(run))
    }
    const next = advanceDay(run)
    assert.notStrictEqual(next, run, `stopped before day ${target}`)
    run = next
  }
  return run
}
function agentResearch(seed = 42) {
  let run = fresh(seed)
  run = unlockResearchSlot(run, 1, nextCommandSeq(run))
  run = startResearch(run, "daily-chat", nextCommandSeq(run))
  run = until(run, completionDay(run.research.projects.at(-1)))
  run = startResearch(run, "agent-tasks", nextCommandSeq(run))
  assert.equal(run.research.projects.at(-1).skillId, "agent-tasks")
  return run
}
function withCoding(seed = 42) {
  let run = agentResearch(seed)
  const completion = completionDay(run.research.projects.at(-1))
  run = until(run, completion + 2)
  assert.ok(codingEntry(run))
  return run
}
function select(run, entry, choiceId) {
  return resolveDecision(run, entry.instanceId, entry.content.id, choiceId)
}
function ordinaryExample(id, humanBps = 2000) {
  for (let seed = 1; seed <= 36; seed++) {
    const run = until({ ...soloFresh(seed), researchBps: humanBps }, 140)
    const entry = run.events.find(event => event.content.id === id)
    if (entry) return { run, entry }
  }
  assert.fail(`no eligible example for ${id}`)
}

test("autonomous coding follows completed agent research after a seeded delay, once per run", () => {
  const empty = until(fresh(), observationDay)
  assert.equal(codingEntry(empty), undefined)
  const timings = new Set()
  for (const seed of [1, 2, 8, 42, 0x80000000, 0xffffffff]) {
    let run = agentResearch(seed)
    const completion = completionDay(run.research.projects.at(-1))
    run = until(run, completion)
    assert.equal(codingEntry(run), undefined)
    run = until(run, completion + 2)
    const entry = codingEntry(run)
    assert.ok([1, 2].includes(entry.day - completion))
    timings.add(entry.day - completion)
    assert.equal(entry.sourceSkillId, "agent-tasks")
    assert.deepEqual(run, withCoding(seed))
    const end = until(run, observationDay)
    assert.equal(end.events.filter(event => event.content.id === codingId).length, 1)
  }
  assert.equal(timings.size, 2)
  assert.equal(fresh().events.length, 0)
})

test("the next event date includes a seeded milestone before its triggering research completes", () => {
  for (const seed of [1, 2, 8, 42]) {
    const run = agentResearch(seed)
    const completion = completionDay(run.research.projects.at(-1))
    assert.ok(run.completedDay < completion)
    const before = JSON.stringify(run)
    const day = nextEventDay(run)
    assert.ok([completion + 1, completion + 2].includes(day))
    assert.ok(day < run.schedule.nextDay)
    assert.equal(nextEventDay(run), day)
    assert.equal(JSON.stringify(run), before, "reading the date consumes no random state")
    const previous = until(run, day - 1)
    assert.equal(codingEntry(previous), undefined)
    const arrived = advanceDay(previous)
    assert.equal(codingEntry(arrived).day, day)
    assert.equal(nextEventDay(arrived), arrived.schedule.nextDay)
  }
})

test("the next event date includes deferred follow-ups beyond day 120 and excludes delivered or terminal work", () => {
  let run = until({ ...withCoding(), opponents: {} }, 220)
  // Choose just after a regular draw so the two-day follow-up precedes the next draw.
  run = until(run, run.schedule.nextDay)
  const parent = codingEntry(run)
  run = select(run, parent, "rollback")
  const due = run.completedDay + 2
  assert.equal(nextEventDay(run), due)
  run = advanceDay(run)
  assert.equal(nextEventDay(run), due)
  assert.equal(run.events.some(entry => entry.sourceInstanceId === parent.instanceId), false)
  run = advanceDay(run)
  assert.equal(run.events.find(entry => entry.sourceInstanceId === parent.instanceId).day, due)
  assert.equal(nextEventDay(run), run.schedule.nextDay)
  assert.equal(nextEventDay({ ...run, researchBps: 10000 }), null)
})

test("ordinary events obey time and risk qualifications and cannot recur when their bag refills", () => {
  const peace = until(soloFresh(), 300)
  assert.equal(peace.events.some(entry => entry.content.id === "audit-request"), false)
  function play(seed) {
    return until({ ...soloFresh(seed), researchBps: 1200 }, 300)
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
        assert.ok(entries[0].day >= decisions[id].minDay, id)
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
    for (const option of decisions[id].choices) {
      const run = { ...timeline, balance: 1_000_000_000, researchBps: 2000,
        research: { ...researchState(timeline), corpus: 100 } }
      const choice = decisionChoiceForRun(run, id, option.id)
      assert.equal(decisionChoiceStatus(run, id, choice.id), "available")
      const after = select(run, entry, choice.id)
      assert.notStrictEqual(after, run, `${id}/${choice.id}`)
      assert.equal(after.balance, run.balance - choice.cost + choice.effect.tokens)
      assert.equal(after.research.corpus, run.research.corpus - choice.corpusCost + choice.effect.corpus)
      assert.equal(after.researchBps, Math.max(0, Math.min(10000, run.researchBps + choice.effect.humanBps)))
      const settled = after.events.find(event => event.instanceId === entry.instanceId)
      assert.equal(settled.choiceId, choice.id)
      assert.equal(settled.resolvedDay, run.completedDay)
      assert.deepEqual(settled.effect, { tokens: after.balance - run.balance,
        corpus: after.research.corpus - run.research.corpus, humanBps: after.researchBps - run.researchBps })
      assert.equal(entry.choiceId, undefined)
      assert.strictEqual(select(after, entry, choice.id), after)
      assert.deepEqual(after.commands.at(-1), { kind: "chooseEvent", day: run.completedDay,
        seq: nextCommandSeq(run), eventInstanceId: entry.instanceId, choiceId: choice.id })
    }
  }
})

test("resources are checked before grants and invalid or duplicate choices preserve the snapshot", () => {
  const run = withCoding(), entry = codingEntry(run)
  const rawPaid = decisions[codingId].choices.find(choice => choice.cost > 0)
  const paid = decisionChoiceForRun(run, codingId, rawPaid.id)
  const poor = { ...run, balance: paid.cost - 1 }
  assert.deepEqual(decisionEffectForRun(poor, codingId, paid.id), { tokens: -paid.cost, corpus: 16, humanBps: 400 })
  assert.equal(decisionChoiceStatus(poor, codingId, paid.id), "tokens")
  assert.strictEqual(select(poor, entry, paid.id), poor)
  assert.strictEqual(select(run, entry, "missing-choice"), run)
  assert.strictEqual(resolveDecision(run, "stale-instance", codingId, paid.id), run)
  assert.strictEqual(resolveDecision(run, entry.instanceId, "community-router", paid.id), run)

  const normal = until(soloFresh(), 160)
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

test("coding branches publish their own follow-up once, two days after the actual deferred choice", () => {
  for (const [choiceId, followUpId] of [["keep", "coding-integrated"], ["rollback", "coding-isolated"]]) {
    let run = withCoding(), entry = codingEntry(run)
    run = until(run, entry.day + 5)
    const chosenAt = run.completedDay
    const before = run
    run = select(run, entry, choiceId)
    assert.notStrictEqual(run, before)
    const settled = codingEntry(run)
    assert.equal(settled.resolvedDay, chosenAt)
    assert.equal(settled.followUpDay, chosenAt + 2)
    assert.equal(run.events.some(event => event.sourceInstanceId === entry.instanceId), false)
    run = until(run, chosenAt + 1)
    assert.equal(run.events.some(event => event.sourceInstanceId === entry.instanceId), false)
    run = advanceDay(run)
    const followUp = run.events.find(event => event.sourceInstanceId === entry.instanceId)
    assert.equal(followUp.content.id, followUpId)
    assert.equal(followUp.sourceChoiceId, choiceId)
    assert.equal(followUp.day, chosenAt + 2)
    assert.ok(runTimeline(run))
    assert.ok(runTimeline(run).some(row => row.event?.instanceId === followUp.instanceId))
    run = until(run, chosenAt + 10)
    assert.equal(run.events.filter(event => event.sourceInstanceId === entry.instanceId).length, 1)
    assert.equal(replayForRun(run).saveVersion, 2)
    assert.ok(runTimeline(run))
  }
})

test("HUMAN effects clamp to real progress and a terminal selection freezes all later inputs", () => {
  const base = withCoding(), entry = codingEntry(base)
  const threatened = { ...base, researchBps: 9900 }
  const result = select(threatened, entry, "keep")
  assert.equal(result.researchBps, 10000)
  assert.equal(codingEntry(result).effect.humanBps, 100)
  assert.equal(dailyOutcome(result), "human-victory")
  assert.strictEqual(advanceDay(result), result)
  assert.strictEqual(select(result, entry, "rollback"), result)

  const { run: rawQualified, entry: audit } = ordinaryExample("audit-request", 200)
  const qualified = { ...rawQualified, balance: 1_000_000_000, researchBps: 200 }
  const review = decisions["audit-request"].choices.find(choice => choice.effect.humanBps < 0)
  const preview = decisionEffectForRun(qualified, "audit-request", review.id)
  assert.equal(preview.humanBps, -200)
  const audited = select(qualified, audit, review.id)
  assert.equal(audited.researchBps, 0)
  assert.deepEqual(audited.events.find(event => event.instanceId === audit.instanceId).effect, preview)
})

test("deferred choices and follow-ups remain live beyond day 120", () => {
  let run = withCoding(), entry = codingEntry(run)
  run = until(run, 125)
  run = select(run, entry, "rollback")
  assert.equal(codingEntry(run).resolvedDay, 125)
  run = until(run, 127)
  assert.equal(dailyOutcome(run), null)
  assert.equal(run.events.find(event => event.sourceInstanceId === entry.instanceId).day, 127)
  assert.equal(codingEntry(run).choiceId, "rollback")
  assert.ok(runTimeline(run))
})

test("replay inspection rejects altered effects, follow-up schedules and random state", () => {
  let run = withCoding()
  run = select(run, codingEntry(run), "keep")
  run = until(run, run.completedDay + 2)
  assert.ok(runTimeline(run))
  const changeCoding = change => ({ ...run, events: run.events.map(entry => entry.content.id === codingId ? change(entry) : entry) })
  assert.equal(runTimeline(changeCoding(entry => ({ ...entry, effect: { ...entry.effect, corpus: entry.effect.corpus + 1 } }))), null)
  assert.equal(runTimeline(changeCoding(entry => ({ ...entry, followUpDay: entry.followUpDay + 1 }))), null)
  assert.equal(runTimeline({ ...run, schedule: { ...run.schedule, randomState: run.schedule.randomState ^ 1 } }), null)
})
