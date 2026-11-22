import assert from "node:assert/strict"
import test from "node:test"
import { btoken } from "../../rules/v0.1/economy/btoken.ts"
import { standardScenario } from "../../rules/v0.1/scenario.ts"
import { globalPlayablePopulation, regionIds, regionSpec } from "../../rules/v0.1/world/regions.ts"
import { replayForRun, runTimeline } from "../inspection.ts"
import { regionOccupiedCenters } from "../competition.ts"
import {
  actionCost,
  buildCardCost,
  buildRegionPopulations,
  canBuildDataCenter,
  computeGlobalMetrics,
  factionStandings,
  victoryProgress,
} from "../operations.ts"
import { populationShares } from "../population.ts"
import { advanceDay, buildDataCenter, buyBuildCard, createRun, dailyOutcome, fundConversion, grantDeveloperTokens, nextCommandSeq, toggleSyntheticProgram, useAction } from "../run.ts"

const { rules } = standardScenario
const setup = { factionId: "gpt", startRegionId: "as", difficultyId: "standard" }

function fresh(overrides = {}) {
  return createRun({ ...setup, ...overrides }, 42, "competition")
}

test("each playable faction competes against the other two with separate starting resources and continental origins", () => {
  for (const factionId of rules.factionIds) {
    const initial = fresh({ factionId })
    const opponents = Object.values(initial.opponents)
    assert.deepEqual(opponents.map(opponent => opponent.factionId).sort(), rules.factionIds.filter(id => id !== factionId).sort())
    assert.equal(new Set([initial.setup.startRegionId, ...opponents.map(opponent => opponent.startRegionId)]).size, 3)
    assert.equal(initial.balance, rules.initialBtoken)
    for (const opponent of opponents) {
      const originRegion = opponent.startRegionId
      assert.equal(opponent.balance, rules.initialBtoken)
      assert.equal(opponent.corpus, rules.research.initialCorpus)
      assert.ok(opponent.regions[originRegion].users > 0)
      assert.equal(initial.regionPopulations[originRegion].factions[opponent.factionId].immersed, opponent.regions[originRegion].users)
    }

    const funded = grantDeveloperTokens(initial, 10, nextCommandSeq(initial))
    const bought = buyBuildCard(funded, nextCommandSeq(funded))
    assert.ok(bought.balance < funded.balance)
    assert.strictEqual(bought.opponents, initial.opponents)
    assert.strictEqual(buyBuildCard(bought, nextCommandSeq(funded)), bought)
  }
})

test("fixed-seed rivals operate independently and share a conserved continental census and construction capacity", () => {
  const initial = fresh()
  const target = Object.values(initial.opponents)[0].startRegionId
  let run = useAction(initial, "cross-border-cloud", nextCommandSeq(initial), target)
  let repeated = useAction(fresh(), "cross-border-cloud", nextCommandSeq(initial), target)
  assert.notStrictEqual(run, initial)
  let sawContestedRegion = false
  const spentOrEarnedTokens = new Set()
  const spentOrEarnedCorpus = new Set()
  for (let day = 1; day <= 24; day++) {
    const before = run
    run = advanceDay(run)
    repeated = advanceDay(repeated)
    assert.equal(run.completedDay, day)
    assert.deepEqual(run, repeated)
    for (const [id, opponent] of Object.entries(run.opponents)) {
      if (opponent.balance !== before.opponents[id].balance) spentOrEarnedTokens.add(id)
      if (opponent.corpus !== before.opponents[id].corpus) spentOrEarnedCorpus.add(id)
    }
    for (const [regionId, bucket] of Object.entries(run.regionPopulations)) {
      const spec = regionSpec(regionId)
      const observed = populationShares(bucket)
      assert.equal(bucket.total, spec.population)
      assert.ok(observed, `${regionId} counts remain nonnegative and within its population on day ${day}`)
      assert.ok(regionOccupiedCenters(run, regionId) <= spec.slots, `${regionId} never overbooks construction slots`)
      sawContestedRegion ||= Object.keys(bucket.factions).length > 1
      for (const entry of observed.shares) {
        const ownerState = entry.faction === run.setup.factionId ? run.markets[regionId] : run.opponents[entry.faction].regions[regionId]
        assert.equal(entry.people, ownerState[entry.synthetic ? "synthetics" : "users"])
      }
    }
  }
  assert.ok(sawContestedRegion)
  assert.deepEqual(run.commands.map(command => command.kind), ["useAbility"])
  for (const [id, opponent] of Object.entries(run.opponents)) {
    assert.notDeepEqual(opponent.regions, initial.opponents[id].regions)
    assert.ok(spentOrEarnedTokens.has(id))
    assert.ok(spentOrEarnedCorpus.has(id))
  }
  for (const row of factionStandings(run)) {
    const records = row.isPlayer ? Object.values(run.markets) : Object.values(run.opponents[row.factionId].regions)
    assert.equal(row.immersed, records.reduce((sum, r) => sum + r.users, 0))
    assert.equal(row.synthetics, records.reduce((sum, r) => sum + r.synthetics, 0))
    assert.equal(row.centers, records.reduce((sum, r) => sum + r.centers, 0))
  }
  for (const row of factionStandings(run, target)) {
    const local = row.isPlayer ? run.markets[target] : run.opponents[row.factionId].regions[target]
    assert.equal(row.immersed, local?.users ?? 0)
    assert.equal(row.synthetics, local?.synthetics ?? 0)
    assert.equal(row.centers, local?.centers ?? 0)
  }
})

test("an opponent can use the last shared continental slot without consuming an unsuccessful player card", () => {
  const initial = grantDeveloperTokens(fresh(), 20, 1)
  const regionId = initial.setup.startRegionId
  const { slots } = regionSpec(regionId)
  const bought = buyBuildCard(initial, nextCommandSeq(initial))
  const opponent = Object.values(initial.opponents)[0]
  const opponentOrigin = opponent.regions[opponent.startRegionId]
  const withRivalCenters = centers => ({
    ...bought,
    opponents: {
      ...bought.opponents,
      [opponent.factionId]: {
        ...opponent,
        regions: { ...opponent.regions, [regionId]: { ...opponentOrigin, users: 0, synthetics: 0, centers } },
      },
    },
  })

  const oneFree = withRivalCenters(slots - 1)
  assert.equal(canBuildDataCenter(oneFree, regionId), "available")
  const built = buildDataCenter(oneFree, regionId, nextCommandSeq(oneFree))
  assert.equal(built.buildCards, 0)
  assert.equal(regionOccupiedCenters(built, regionId), slots)

  const full = withRivalCenters(slots)
  assert.equal(canBuildDataCenter(full, regionId), "full")
  assert.strictEqual(buildDataCenter(full, regionId, nextCommandSeq(full)), full)
  assert.equal(full.buildCards, 1)
})

test("two computer bids for the last shared continental slot choose one winner and the other faction retains its card", () => {
  const initial = fresh()
  const regionId = "oc"
  const spec = regionSpec(regionId)
  const cardBudget = btoken.buildCardCost
  const opponents = Object.fromEntries(Object.entries(initial.opponents).map(([id, opponent]) => [id, {
    ...opponent,
    balance: cardBudget,
    markets: { ...opponent.markets, [regionId]: 0 },
    regions: { [regionId]: { users: Math.floor(spec.population / 4), synthetics: 0, centers: 0, unlockedTier: 3 } },
  }]))
  const contested = {
    ...initial,
    opponents,
    markets: {
      ...initial.markets,
      [regionId]: { ...initial.markets[regionId], enteredDay: 0, users: 0, centers: spec.slots - 1 },
    },
  }
  const settled = advanceDay(contested)
  assert.equal(settled.completedDay, 1)
  assert.equal(regionOccupiedCenters(settled, regionId), spec.slots)
  const results = Object.values(settled.opponents).map(opponent => {
    assert.ok(opponent.balance >= 0)
    return [opponent.regions[regionId].centers, opponent.buildCards]
  })
  assert.deepEqual(results.sort(), [[0, 1], [1, 0]])
  const reordered = { ...contested, opponents: Object.fromEntries(Object.entries(opponents).reverse()) }
  assert.deepEqual(advanceDay(reordered).opponents, settled.opponents)
})

test("ordinary users transfer in a saturated continent and cannot convert that day", () => {
  const initial = grantDeveloperTokens(fresh(), 40, 1)
  const regionId = setup.startRegionId
  const { population, slots } = regionSpec(regionId)
  const [opponentId, opponent] = Object.entries(initial.opponents)[0]
  const player = { ...initial.markets[regionId], users: 1_000, synthetics: 1_000, centers: slots / 2 }
  const rival = { ...opponent.regions[opponent.startRegionId],
    users: population - player.users - player.synthetics - 1_000, synthetics: 1_000, centers: slots / 2 }
  const contested = {
    ...initial,
    markets: { ...initial.markets, [regionId]: player },
    opponents: {
      ...initial.opponents,
      [opponentId]: {
        ...opponent,
        markets: { ...opponent.markets, [regionId]: 0 },
        regions: { ...opponent.regions, [regionId]: rival },
      },
    },
  }
  const control = advanceDay(contested)
  assert.ok(contested.balance >= actionCost(contested, "market-subsidy"))
  const subsidized = useAction(contested, "market-subsidy", nextCommandSeq(contested), regionId)
  assert.notStrictEqual(subsidized, contested)
  const next = advanceDay(subsidized)
  const playerAfter = next.markets[regionId]
  const rivalAfter = next.opponents[opponentId].regions[regionId]
  assert.ok(playerAfter.users > player.users)
  assert.ok(playerAfter.users > control.markets[regionId].users)
  assert.equal(playerAfter.users - player.users, rival.users - rivalAfter.users)
  assert.equal(playerAfter.synthetics, player.synthetics)
  assert.equal(rivalAfter.synthetics, rival.synthetics)
  assert.equal(populationShares(next.regionPopulations[regionId]).covered, population)

  const funded = fundConversion(subsidized, 1, nextCommandSeq(subsidized))
  const enabled = toggleSyntheticProgram(funded, regionId, true, nextCommandSeq(funded))
  const afterConversion = advanceDay(enabled).markets[regionId]
  assert.equal(afterConversion.synthetics, player.synthetics + player.users)
  assert.ok(afterConversion.users >= playerAfter.users - player.users)
  assert.ok(buildCardCost(initial) >= btoken.buildCardCost)
})

test("idle players eventually lose to active computer rivals instead of deadlocking below 100%", () => {
  let run = fresh()
  for (let day = 0; day < 180 && !dailyOutcome(run); day++) {
    run = advanceDay(run)
  }
  assert.ok(["rival-victory", "human-victory"].includes(dailyOutcome(run)))
  assert.ok(runTimeline(run))
})

test("global conversion uses real faction ownership for an exact majority and gives HUMAN priority", () => {
  const initial = fresh()
  const [rivalId, rival] = Object.entries(initial.opponents)[0]
  const rivalTemplate = rival.regions[rival.startRegionId]
  function terminal(playerPeople) {
    let remaining = playerPeople
    const playerMarkets = { ...initial.markets }
    const rivalRegions = {}
    for (const id of regionIds) {
      const spec = regionSpec(id)
      const owned = Math.min(spec.population, remaining)
      playerMarkets[id] = { ...initial.markets[id], enteredDay: 0, users: 0, synthetics: owned }
      if (owned < spec.population) rivalRegions[id] = { ...rivalTemplate, users: 0, synthetics: spec.population - owned }
      remaining -= owned
    }
    const opponents = Object.fromEntries(Object.entries(initial.opponents).map(([id, opponent]) =>
      [id, { ...opponent, regions: id === rivalId ? rivalRegions : {} }]))
    return {
      ...initial,
      ...computeGlobalMetrics(playerMarkets, opponents),
      markets: playerMarkets,
      opponents,
      regionPopulations: buildRegionPopulations(playerMarkets, initial.setup.factionId, opponents),
    }
  }
  const threshold = Math.floor(globalPlayablePopulation * rules.standardVictory.minPlayerSyntheticShareBps / 10000)
  const lost = terminal(threshold)
  const won = terminal(threshold + 1)
  assert.equal(victoryProgress(won).globalSyntheticBps, 10000)
  assert.equal(victoryProgress(won).totalSynthetics, globalPlayablePopulation)
  assert.equal(dailyOutcome(lost), "rival-victory")
  assert.equal(dailyOutcome(won), "ai-victory")
  assert.equal(dailyOutcome({ ...won, researchBps: rules.projectHuman.completionBps }), "human-victory")
  assert.strictEqual(advanceDay(lost), lost)
  assert.strictEqual(advanceDay(won), won)
})

test("the current replay reconstructs opponent state and rejects changed ledgers and obsolete rule identity", () => {
  let run = fresh()
  for (let day = 0; day < 8; day++) run = advanceDay(run)
  assert.ok(runTimeline(run))
  assert.equal(replayForRun(run).saveVersion, 2)
  assert.equal(replayForRun(run).rulesVersion, rules.rulesVersion)
  assert.notEqual(rules.rulesVersion, "v0.1")
  assert.equal(runTimeline({ ...run, rulesVersion: "v0.1" }), null)

  const [opponentId, opponent] = Object.entries(run.opponents)[0]
  const withOpponent = changed => ({ ...run, opponents: { ...run.opponents, [opponentId]: changed } })
  assert.equal(runTimeline(withOpponent({ ...opponent, balance: opponent.balance + 1 })), null)
  const regionId = opponent.startRegionId
  const reg = opponent.regions[regionId]
  assert.equal(runTimeline(withOpponent({
    ...opponent,
    regions: { ...opponent.regions, [regionId]: { ...reg, users: reg.users + 1 } },
  })), null)
  const census = run.regionPopulations[regionId]
  assert.equal(runTimeline({
    ...run,
    regionPopulations: { ...run.regionPopulations, [regionId]: { ...census, total: census.total + 1 } },
  }), null)
  assert.ok(runTimeline({ ...run, opponents: Object.fromEntries(Object.entries(run.opponents).reverse()) }))
})
