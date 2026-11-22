import assert from "node:assert/strict"
import test from "node:test"
import { marketResearchValue as value, researchExample } from "../market-research.ts"
import { advanceDay, createRun } from "../run.ts"

test("social reach respects market share and the two-day subsidy window, with no effect on other channels", () => {
  const levels = { "social-sharing": 1, "language-communities": 1, "trending-takeover": 1 }
  const at = (channel, factionCoverage, subsidyDay) => value(levels,"reach",100,{channel, metrics:{factionCoverage,subsidyDay}})
  assert.equal(at("social",19.99,2),201)
  assert.equal(at("social",20,2),168)
  assert.equal(at("social",20,3),112)
  assert.equal(at("api",1,1),112)
  assert.equal(value({"remix-templates":1},"remixContacts",14,{channel:"social"}),2)
  assert.equal(value({}, "remixContacts",14,{channel:"social"}),0)
})

test("cohort predicates stack once, distinguish natural transfers, and enforce local program conditions", () => {
  const seats = { "long-memory": 1, "live-handoff": 1, "memory-recap": 2 }
  assert.equal(value(seats,"subsidizedLoss",100,{facts:["organizationSeat"]}),37)
  assert.equal(value(seats,"subsidizedLoss",100),50)
  assert.equal(value(seats,"naturalChurn",100),86)
  const converted = { "identity-registry":1, "batch-conversion":1 }
  assert.equal(value(converted,"conversionCapacity",100,{metrics:{localCenters:1}}),0)
  assert.equal(value(converted,"conversionCapacity",100,{facts:["activePlan"],metrics:{localCenters:0}}),115)
  assert.equal(value(converted,"conversionCapacity",100,{facts:["activePlan"],metrics:{localCenters:1}}),172)
  assert.equal(value({"offline-bundles":1},"edgeCapacity",100),100)
  assert.equal(value({"offline-bundles":1},"edgeCapacity",100,{metrics:{localCenters:0}}),130)
  assert.equal(value({"audit-logs":1},"reviewFee",1),0)
  assert.equal(value({"distributed-review":1},"preserved",50),75)
})

test("model indices and contextual modifiers use the same arithmetic for research previews and settlements", () => {
  const purchased = { "reinforcement-learning":2 }
  assert.equal(value(purchased,"adoptionWeight",100),104)
  assert.ok(Math.abs(value(purchased,"adoptionWeight",100,{channel:"agent"}) - 110.24) < 1e-10)
  const sample = researchExample({"long-memory":1},"live-handoff")
  assert.deepEqual(sample,{measure:"subsidizedLoss",base:100,current:50,next:37})
  const finished = researchExample({"long-memory":1,"live-handoff":1},"live-handoff")
  assert.equal(finished.next,finished.current)
  assert.equal(researchExample({},"evaluation-suite"),null)
  assert.ok(Math.abs(value({"human-approval":1},"exposure",10)-9.4)<1e-10)
  assert.ok(Math.abs(value({"human-approval":1},"exposure",10,{facts:["agentAction"]})-7.52)<1e-10)
})

test("profit applies to adopted-user revenue, carries fractional tokens, and scales with the economy", () => {
  let run = createRun({ factionId: "claude", startRegionId: "as", difficultyId: "standard" }, 42)
  const quiet = advanceDay({ ...run, completedDay: 5, countries: {}, opponents: {}, adoptionBps: 0,
    research: { ...run.research, unlockedSlots: 1, projects: [{ skillId: "closed-subscription", slot: 1, startedDay: 0, completedDay: 5 }] } })
  assert.ok(quiet.balance > run.balance)
  const activeCountries = {
    CHN: { users: 1_300_000_000, synthetics: 0, newlyConverted: 0, prevUsers: 1_300_000_000, retainedDays: 1, centers: 2, unlockedTier: 3, carry: 0, dependencyBps: 1000 },
    IND: { users: 1_250_000_000, synthetics: 0, newlyConverted: 0, prevUsers: 1_250_000_000, retainedDays: 1, centers: 1, unlockedTier: 3, carry: 0, dependencyBps: 1000 },
  }
  const baseRun = {
    ...run,
    completedDay: 5,
    countries: activeCountries,
    opponents: {},
    markets: { ...run.markets, as: { ...run.markets.as, milestonesClaimed: [3000, 7000] } },
  }
  const withProfit = {
    ...baseRun,
    research: { ...run.research, unlockedSlots: 1, projects: [{ skillId: "closed-subscription", slot: 1, startedDay: 0, completedDay: 5 }] },
  }
  const plain = advanceDay(baseRun)
  const boosted = advanceDay(withProfit)
  assert.ok(boosted.balance - withProfit.balance >= plain.balance - baseRun.balance)
  assert.ok(boosted.tokenScale >= baseRun.tokenScale)
  assert.ok(Number.isInteger(boosted.operatingRemainder) && boosted.operatingRemainder >= 0 && boosted.operatingRemainder < 100)
})
