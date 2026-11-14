import assert from "node:assert/strict"
import test from "node:test"
import { standardScenario } from "../v0.1/scenario.ts"
import { victoryEpilogues } from "../v0.1/endings/standard.ts"
import { trees } from "../v0.1/evolution/trees.ts"
import { actions } from "../v0.1/evolution/actions.ts"
import { channels } from "../v0.1/world/channels.ts"
import { computeSnapshot } from "../v0.1/world/compute.ts"
import { regionIds } from "../v0.1/world/regions.ts"
import placesFile from "../v0.1/world/compute-places.json" with { type: "json" }
import { decisions } from "../v0.1/events/decisions.ts"
import { news } from "../v0.1/events/news.ts"
import { competition } from "../v0.1/events/competition.ts"

test("every playable faction, start market and faction epilogue belongs to the standard scenario", () => {
  const { factions, regions, rules } = standardScenario
  assert.deepEqual(Object.keys(factions).sort(), [...rules.factionIds].sort())
  assert.deepEqual(Object.keys(victoryEpilogues).sort(), [...rules.factionIds].sort())
  assert.equal(new Set(Object.values(factions).map(f => f.ability.id)).size, rules.factionIds.length)
  assert.equal(Object.keys(regions).length, rules.regionCount)
  assert.equal(Object.keys(channels).length, 5)
})

test("18 evolution slots have unique IDs, including the mutually exclusive subscription alternative", () => {
  assert.deepEqual(trees.map(t => t.skills.length), [6, 6, 6])
  const slots = trees.flatMap(t => t.skills)
  assert.equal(slots.find(s => s.id === "open-source").alternative.id, "closed-subscription")
  const variants = slots.flatMap(s => s.alternative ? [s, s.alternative] : [s])
  assert.equal(new Set(variants.map(s => s.id)).size, variants.length)
  const abilityIds = [...actions.map(a => a.id), ...Object.values(standardScenario.factions).map(f => f.ability.id)]
  assert.equal(new Set(abilityIds).size, abilityIds.length)
})

test("the compute snapshot covers every market once and its recorded share sums to 100%", () => {
  assert.deepEqual(Object.keys(computeSnapshot.markets).sort(), [...regionIds].sort())
  const shares = Object.values(computeSnapshot.markets).map(market => market.recordedRealShareBps)
  assert.equal(shares.reduce((sum, share) => sum + share, 0), 10000)
  assert.equal(new Set(computeSnapshot.sites.map(site => site.id)).size, computeSnapshot.sites.length)
  for (const site of computeSnapshot.sites) {
    assert.ok(regionIds.includes(site.market))
    assert.equal(Number.isFinite(site.lat) && Number.isFinite(site.lon), true)
  }
})

test("compute places keep only built capacity, one point per small country or province", () => {
  assert.equal(placesFile.places.length, 38)
  assert.equal(new Set(placesFile.places.map(place => place.id)).size, 38)
  for (const place of placesFile.places) {
    assert.equal(place.kind, "current")
    assert.ok(place.realMw > 0)
    assert.equal(Number.isFinite(place.lat) && Number.isFinite(place.lon), true)
    assert.ok(place.sites >= 1)
  }
})

test("news, competitive events and decisions can be addressed by unambiguous IDs", () => {
  const ids = [...news, ...competition].map(x => x.id).concat(Object.keys(decisions))
  assert.equal(new Set(ids).size, ids.length)
  for (const { choices } of Object.values(decisions)) {
    assert.equal(new Set(choices.map(c => c.id)).size, choices.length)
    assert.ok(choices.length >= 2)
  }
})
