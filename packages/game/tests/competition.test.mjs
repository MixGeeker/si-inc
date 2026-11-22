import assert from "node:assert/strict"
import test from "node:test"
import { btoken } from "../../rules/v0.1/economy/btoken.ts"
import { standardScenario } from "../../rules/v0.1/scenario.ts"
import { countries, countrySpec, globalPlayablePopulation, originCountries } from "../../rules/v0.1/world/countries.ts"
import { replayForRun, runTimeline } from "../inspection.ts"
import {
  actionCost,
  buildCardCost,
  buildCountryPopulations,
  canBuildDataCenter,
  computeGlobalMetrics,
  countryOccupiedCenters,
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

test("each playable faction competes against the other two with separate starting resources and origins", () => {
  for (const factionId of rules.factionIds) {
    const initial = fresh({ factionId })
    const opponents = Object.values(initial.opponents)
    assert.deepEqual(opponents.map(opponent => opponent.factionId).sort(), rules.factionIds.filter(id => id !== factionId).sort())
    assert.equal(new Set([initial.setup.startRegionId, ...opponents.map(opponent => opponent.startRegionId)]).size, 3)
    assert.equal(initial.balance, rules.initialBtoken)
    for (const opponent of opponents) {
      const originId = originCountries[opponent.startRegionId]
      assert.equal(opponent.balance, rules.initialBtoken)
      assert.equal(opponent.corpus, rules.research.initialCorpus)
      assert.ok(opponent.countries[originId].users > 0)
      assert.equal(initial.countryPopulations[originId].factions[opponent.factionId].immersed, opponent.countries[originId].users)
    }

    const funded = grantDeveloperTokens(initial, 10, nextCommandSeq(initial))
    const bought = buyBuildCard(funded, nextCommandSeq(funded))
    assert.ok(bought.balance < funded.balance)
    assert.strictEqual(bought.opponents, initial.opponents)
    assert.strictEqual(buyBuildCard(bought, nextCommandSeq(funded)), bought)
  }
})

test("fixed-seed rivals operate independently and share a conserved country census and construction capacity", () => {
  const initial = fresh()
  const target = Object.values(initial.opponents)[0].startRegionId
  let run = useAction(initial, "cross-border-cloud", nextCommandSeq(initial), target)
  let repeated = useAction(fresh(), "cross-border-cloud", nextCommandSeq(initial), target)
  assert.notStrictEqual(run, initial)
  let sawContestedCountry = false
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
    for (const [countryId, country] of Object.entries(run.countryPopulations)) {
      const spec = countrySpec(countryId)
      const observed = populationShares(country)
      assert.equal(country.total, spec.population)
      assert.ok(observed, `${countryId} counts remain nonnegative and within its population on day ${day}`)
      assert.ok(countryOccupiedCenters(run, countryId) <= spec.slots, `${countryId} never overbooks construction slots`)
      sawContestedCountry ||= Object.keys(country.factions).length > 1
      for (const entry of observed.shares) {
        const owner = entry.faction === run.setup.factionId ? run : run.opponents[entry.faction]
        assert.equal(entry.people, owner.countries[countryId][entry.synthetic ? "synthetics" : "users"])
      }
    }
  }
  assert.ok(sawContestedCountry)
  assert.deepEqual(run.commands.map(command => command.kind), ["useAbility"])
  for (const [id, opponent] of Object.entries(run.opponents)) {
    assert.notDeepEqual(opponent.countries, initial.opponents[id].countries)
    assert.ok(spentOrEarnedTokens.has(id))
    assert.ok(spentOrEarnedCorpus.has(id))
  }
  for (const row of factionStandings(run)) {
    const owner = row.isPlayer ? run : run.opponents[row.factionId]
    assert.equal(row.immersed, Object.values(owner.countries).reduce((sum, country) => sum + country.users, 0))
    assert.equal(row.synthetics, Object.values(owner.countries).reduce((sum, country) => sum + country.synthetics, 0))
    assert.equal(row.centers, Object.values(owner.countries).reduce((sum, country) => sum + country.centers, 0))
  }
  for (const row of factionStandings(run, target)) {
    const owner = row.isPlayer ? run : run.opponents[row.factionId]
    const local = Object.entries(owner.countries).filter(([id]) => countrySpec(id).regionId === target)
    assert.equal(row.immersed, local.reduce((sum, [, country]) => sum + country.users, 0))
    assert.equal(row.synthetics, local.reduce((sum, [, country]) => sum + country.synthetics, 0))
    assert.equal(row.centers, local.reduce((sum, [, country]) => sum + country.centers, 0))
  }
})

test("an opponent can use the last shared slot without consuming an unsuccessful player card", () => {
  const initial = grantDeveloperTokens(fresh(), 20, 1)
  const countryId = originCountries[initial.setup.startRegionId]
  const { slots } = countrySpec(countryId)
  const bought = buyBuildCard(initial, nextCommandSeq(initial))
  const opponent = Object.values(initial.opponents)[0]
  const opponentOrigin = opponent.countries[originCountries[opponent.startRegionId]]
  const withRivalCenters = centers => ({
    ...bought,
    opponents: {
      ...bought.opponents,
      [opponent.factionId]: {
        ...opponent,
        countries: { ...opponent.countries, [countryId]: { ...opponentOrigin, users: 0, synthetics: 0, centers } },
      },
    },
  })

  const oneFree = withRivalCenters(slots - 1)
  assert.equal(canBuildDataCenter(oneFree, countryId), "available")
  const built = buildDataCenter(oneFree, countryId, nextCommandSeq(oneFree))
  assert.equal(built.buildCards, 0)
  assert.equal(countryOccupiedCenters(built, countryId), slots)

  const full = withRivalCenters(slots)
  assert.equal(canBuildDataCenter(full, countryId), "full")
  assert.strictEqual(buildDataCenter(full, countryId, nextCommandSeq(full)), full)
  assert.equal(full.buildCards, 1)
})

test("two computer bids for the last shared slot choose one winner and the other faction retains its card", () => {
  const initial = fresh()
  const spec = countrySpec("JPN")
  const cardBudget = btoken.buildCardCost
  const opponents = Object.fromEntries(Object.entries(initial.opponents).map(([id, opponent]) => [id, {
    ...opponent,
    balance: cardBudget,
    markets: { ...opponent.markets, [spec.regionId]: 0 },
    countries: { [spec.id]: { users: Math.floor(spec.population / 4), synthetics: 0, centers: 0, unlockedTier: 3 } },
  }]))
  const contested = {
    ...initial,
    opponents,
    countries: { ...initial.countries, [spec.id]: { ...initial.countries.CHN, users: 0, centers: spec.slots - 1 } },
  }
  const settled = advanceDay(contested)
  assert.equal(settled.completedDay, 1)
  assert.equal(countryOccupiedCenters(settled, spec.id), spec.slots)
  const results = Object.values(settled.opponents).map(opponent => {
    assert.ok(opponent.balance >= 0)
    return [opponent.countries[spec.id].centers, opponent.buildCards]
  })
  assert.deepEqual(results.sort(), [[0, 1], [1, 0]])
  const reordered = { ...contested, opponents: Object.fromEntries(Object.entries(opponents).reverse()) }
  assert.deepEqual(advanceDay(reordered).opponents, settled.opponents)
})

test("ordinary users transfer in a saturated country and cannot convert that day", () => {
  const initial = grantDeveloperTokens(fresh(), 40, 1)
  const countryId = originCountries[setup.startRegionId]
  const { population, slots } = countrySpec(countryId)
  const [opponentId, opponent] = Object.entries(initial.opponents)[0]
  const player = { ...initial.countries[countryId], users: 1_000, synthetics: 1_000, centers: slots / 2 }
  const rival = { ...opponent.countries[originCountries[opponent.startRegionId]],
    users: population - player.users - player.synthetics - 1_000, synthetics: 1_000, centers: slots / 2 }
  const contested = {
    ...initial,
    countries: { ...initial.countries, [countryId]: player },
    opponents: {
      ...initial.opponents,
      [opponentId]: { ...opponent, markets: { ...opponent.markets, [setup.startRegionId]: 0 },
        countries: { ...opponent.countries, [countryId]: rival } },
    },
  }
  const control = advanceDay(contested)
  assert.ok(contested.balance >= actionCost(contested, "market-subsidy"))
  const subsidized = useAction(contested, "market-subsidy", nextCommandSeq(contested), setup.startRegionId)
  assert.notStrictEqual(subsidized, contested)
  const next = advanceDay(subsidized)
  const playerAfter = next.countries[countryId]
  const rivalAfter = next.opponents[opponentId].countries[countryId]
  assert.ok(playerAfter.users > player.users)
  assert.ok(playerAfter.users > control.countries[countryId].users)
  assert.equal(playerAfter.users - player.users, rival.users - rivalAfter.users)
  assert.equal(playerAfter.synthetics, player.synthetics)
  assert.equal(rivalAfter.synthetics, rival.synthetics)
  assert.equal(populationShares(next.countryPopulations[countryId]).covered, population)

  const funded = fundConversion(subsidized, 1, nextCommandSeq(subsidized))
  const enabled = toggleSyntheticProgram(funded, setup.startRegionId, true, nextCommandSeq(funded))
  const afterConversion = advanceDay(enabled).countries[countryId]
  // Only start-of-day ordinary users can convert today; newly transferred users wait until next day.
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
  const playerTemplate = initial.countries[originCountries[initial.setup.startRegionId]]
  const [rivalId, rival] = Object.entries(initial.opponents)[0]
  const rivalTemplate = rival.countries[originCountries[rival.startRegionId]]
  function terminal(playerPeople) {
    let remaining = playerPeople
    const playerCountries = {}
    const rivalCountries = {}
    for (const spec of Object.values(countries)) {
      const owned = Math.min(spec.population, remaining)
      if (owned > 0) playerCountries[spec.id] = { ...playerTemplate, users: 0, synthetics: owned }
      if (owned < spec.population) rivalCountries[spec.id] = { ...rivalTemplate, users: 0, synthetics: spec.population - owned }
      remaining -= owned
    }
    const opponents = Object.fromEntries(Object.entries(initial.opponents).map(([id, opponent]) =>
      [id, { ...opponent, countries: id === rivalId ? rivalCountries : {} }]))
    return { ...initial, ...computeGlobalMetrics(playerCountries, opponents), countries: playerCountries, opponents,
      countryPopulations: buildCountryPopulations(playerCountries, initial.setup.factionId, opponents) }
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
  const countryId = originCountries[opponent.startRegionId]
  const country = opponent.countries[countryId]
  assert.equal(runTimeline(withOpponent({
    ...opponent,
    countries: { ...opponent.countries, [countryId]: { ...country, users: country.users + 1 } },
  })), null)
  const census = run.countryPopulations[countryId]
  assert.equal(runTimeline({
    ...run,
    countryPopulations: { ...run.countryPopulations, [countryId]: { ...census, total: census.total + 1 } },
  }), null)
  assert.ok(runTimeline({ ...run, opponents: Object.fromEntries(Object.entries(run.opponents).reverse()) }))
})
