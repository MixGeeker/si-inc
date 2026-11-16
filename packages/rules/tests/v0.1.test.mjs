import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { standardScenario } from "../v0.1/scenario.ts"
import { victoryEpilogues } from "../v0.1/endings/standard.ts"
import { attributeIds, researchNode, researchNodes, trees } from "../v0.1/evolution/trees.ts"
import { researchBuilds } from "../v0.1/evolution/builds.ts"
import { actions } from "../v0.1/evolution/actions.ts"
import { channels } from "../v0.1/world/channels.ts"
import { computeSnapshot } from "../v0.1/world/compute.ts"
import { regionCapacity, regionIds, regionOfCountry, regions } from "../v0.1/world/regions.ts"
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

test("every map selection outside Antarctica belongs to one continent and keeps its reference capacity", () => {
  const reference = readFileSync(new URL("../../../docs/data-center-capacity.csv", import.meta.url), "utf8")
  const [header, ...rows] = reference.trimEnd().split(/\r?\n/).map(line => line.split(","))
  const column = header.indexOf("建议总槽位")
  assert.ok(column > 0)
  const atlas = readFileSync(new URL("../../../apps/web/src/cartography/data/countries.svg", import.meta.url), "utf8")
  const shapes = [...atlas.matchAll(/<path id="([^"]+)"/g)].map(match => match[1])
  assert.deepEqual(shapes.sort(), rows.map(row => row[0]).sort())

  const slots = new Map()
  for (const region of regionIds) {
    for (const [id, count] of Object.entries(regions[region].slots)) {
      assert.equal(slots.has(id), false, id)
      slots.set(id, count)
      assert.equal(regionOfCountry(id), region)
    }
  }
  assert.deepEqual(slots, new Map(rows.filter(([id]) => id !== "ATA").map(row => [row[0], row[column] ? Number(row[column]) : null])))
  assert.equal([...slots.values()].filter(n => n !== null).length, 215)
  assert.equal(regionIds.reduce((sum, id) => sum + regionCapacity(id), 0), 339)
  for (const id of ["ATA", "unknown", "__proto__"]) assert.equal(regionOfCountry(id), undefined)
})

test("the six starting markets follow continental borders and share the all-market coverage goal", () => {
  assert.deepEqual(regionIds.map(id => regions[id].name).sort(), ["亚洲", "北美", "南美", "大洋洲", "欧洲", "非洲"].sort())
  assert.equal(standardScenario.rules.standardVictory.minCoveredRegions, regionIds.length)
  const borders = {
    as: ["RUS", "CHN", "JPN", "KOR", "IND", "SGP", "KAZ", "TUR", "GEO", "ARM", "AZE", "CYP"],
    eu: ["UKR", "POL", "ISL", "GBR", "FRA", "ALD"], af: ["EGY", "MAR", "KEN", "ZAF", "SAH"],
    na: ["USA", "CAN", "GRL", "MEX", "PAN", "CUB", "HTI"], sam: ["COL", "VEN", "BRA", "ARG", "FLK"],
    oc: ["AUS", "NZL", "PNG", "FJI", "COK"],
  }
  for (const [continent, countries] of Object.entries(borders)) {
    for (const country of countries) assert.equal(regionOfCountry(country), continent, country)
  }
})

test("the three research pages contain fifty distinct technologies and reciprocal exclusive choices", () => {
  assert.deepEqual(trees.map(t => t.skills.length), [17,17,16])
  const skills = researchNodes.map(n => n.skill)
  assert.equal(new Set(skills.map(s => s.id)).size, 50)
  assert.equal(skills.filter(s => s.repeatCostStep).length, 4)
  assert.equal(skills.filter(s => s.dangerBps).length, 5)
  assert.equal(skills.filter(s => s.excludes).length, 4)
  for (const s of skills.filter(s => s.excludes)) assert.equal(researchNode(s.excludes).skill.excludes, s.id)
  const abilityIds = [...actions.map(a => a.id), ...Object.values(standardScenario.factions).map(f => f.ability.id)]
  assert.equal(new Set(abilityIds).size, abilityIds.length)
})

test("the dependency graph is acyclic and ten feasible build paths cover all fifty projects", () => {
  const visited = new Set(), visiting = new Set()
  function visit(id) {
    if (visited.has(id)) return
    assert.ok(!visiting.has(id), id)
    visiting.add(id)
    const {skill} = researchNode(id)
    for (const group of skill.requires) {
      assert.ok(group.length)
      group.forEach(visit)
    }
    for (const v of [skill.cost, skill.weeks, skill.repeatCostStep, skill.weeklyCorpusBonus, skill.dangerBps])
      if (v !== undefined) assert.ok(Number.isSafeInteger(v) && v > 0, id)
    assert.ok(Object.entries(skill.attributes).every(([key,v]) => attributeIds.includes(key) && Number.isInteger(v)), id)
    visiting.delete(id)
    visited.add(id)
  }
  researchNodes.forEach(n => visit(n.skill.id))
  const covered = new Set()
  assert.equal(researchBuilds.length, 10)
  for (const build of researchBuilds) {
    const done = new Set()
    for (const id of build.path) {
      const {skill} = researchNode(id)
      assert.ok(!done.has(id) && !done.has(skill.excludes) && skill.requires.every(g => g.some(p => done.has(p))), id)
      done.add(id)
      covered.add(id)
    }
  }
  assert.equal(covered.size, 50)
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
  assert.equal(computeSnapshot.sites.length, 221)
  const totalMw = computeSnapshot.sites.reduce((sum, site) => sum + Math.round(site.realMw * 10000), 0) / 10000
  assert.equal(totalMw, 6785.2102)
  for (const id of regionIds) {
    const sites = computeSnapshot.sites.filter(site => site.market === id)
    const market = computeSnapshot.markets[id]
    assert.equal(market.sites, sites.length)
    assert.equal(market.sitesWithRealMw, sites.filter(site => site.realMw > 0).length)
    assert.deepEqual(new Set(market.countries), new Set(sites.map(site => site.country)))
    for (const field of ["realMw", "envMw"]) {
      const sum = sites.reduce((total, site) => total + Math.round((site[field] ?? 0) * 10000), 0)
      assert.equal(market[field], sum / 10000)
    }
    assert.ok(Math.abs(market.recordedRealShareBps - market.realMw / totalMw * 10000) < 1)
  }
  assert.equal(computeSnapshot.markets.as.sites, 59)
  assert.equal(computeSnapshot.markets.as.realMw, 2471.8)
  assert.deepEqual(computeSnapshot.markets.as.countries, ["AE", "CN", "ID", "IL", "IN", "JP", "KR", "MY", "QA", "SA", "SG"])
  assert.equal(computeSnapshot.markets.af.sites + computeSnapshot.markets.sam.sites, 0)
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
