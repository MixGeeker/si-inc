import assert from "node:assert/strict"
import test from "node:test"
import { standardScenario } from "../v0.1/scenario.ts"
import { victoryEpilogues } from "../v0.1/endings/standard.ts"
import { trees } from "../v0.1/evolution/trees.ts"
import { actions } from "../v0.1/evolution/actions.ts"
import { channels } from "../v0.1/world/channels.ts"
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

test("news, competitive events and decisions can be addressed by unambiguous IDs", () => {
  const ids = [...news, ...competition].map(x => x.id).concat(Object.keys(decisions))
  assert.equal(new Set(ids).size, ids.length)
  for (const { choices } of Object.values(decisions)) {
    assert.equal(new Set(choices.map(c => c.id)).size, choices.length)
    assert.ok(choices.length >= 2)
  }
})
