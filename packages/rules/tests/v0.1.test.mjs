import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { resolveStartRegionId, standardScenario } from "../v0.1/scenario.ts"
import { endings, victoryEpilogues } from "../v0.1/endings/standard.ts"
import { attributeIds, researchNode, researchNodes, trees } from "../v0.1/evolution/trees.ts"
import { actions } from "../v0.1/evolution/actions.ts"
import { btoken } from "../v0.1/economy/btoken.ts"
import { channels } from "../v0.1/world/channels.ts"
import { computeSnapshot } from "../v0.1/world/compute.ts"
import { globalPlayablePopulation, regionCapacity, regionIds, regionOfCountry, regions, slotUnlockLimit } from "../v0.1/world/regions.ts"
import placesFile from "../v0.1/world/compute-places.json" with { type: "json" }
import { decisions } from "../v0.1/events/decisions.ts"
import { news } from "../v0.1/events/news.ts"
import { competition } from "../v0.1/events/competition.ts"
import { eventPool } from "../v0.1/events/pool.ts"
import { zhCN } from "../v0.1/locales/zh-CN.ts"
import { en } from "../v0.1/locales/en.ts"

test("every playable faction, start market and faction epilogue belongs to the standard scenario", () => {
  const { factions, regions: scenarioRegions, rules } = standardScenario
  assert.deepEqual(Object.keys(factions).sort(), [...rules.factionIds].sort())
  assert.deepEqual(Object.keys(victoryEpilogues).sort(), [...rules.factionIds].sort())
  assert.equal(new Set(Object.values(factions).map(f => f.ability.id)).size, rules.factionIds.length)
  assert.equal(Object.keys(scenarioRegions).length, rules.regionCount)
  assert.equal(Object.keys(channels).length, 5)
  assert.equal(rules.daySecondsAt1x, 4)
  assert.deepEqual(rules.speedMultipliers, [1, 2, 5])
  assert.equal(rules.research.initialSlots, 7)
  assert.equal(rules.research.slotCosts.length, 7)
  assert.equal(Object.hasOwn(rules, "maxDays"), false)
  const outcomes = ["ai-victory", "human-victory", "rival-victory"]
  assert.deepEqual(Object.keys(endings).sort(), outcomes)
  for (const locale of [zhCN, en]) assert.deepEqual(Object.keys(locale.endings).sort(), [...outcomes, "withdrawn"])
  for (const id of regionIds) assert.equal(resolveStartRegionId(id), id)
  for (const id of ["we", "ee", "sa", "latam", "__proto__", ["as"]]) assert.equal(resolveStartRegionId(id), undefined)
})

test("every map contour outside Antarctica belongs to one continent and continental slots/populations are consistent", () => {
  const atlas = readFileSync(new URL("../../../apps/web/src/cartography/data/countries.svg", import.meta.url), "utf8")
  const shapes = [...atlas.matchAll(/<path id="([^"]+)"/g)].map(match => match[1])
  const mapped = new Set()
  for (const regionId of regionIds) {
    const spec = regions[regionId]
    assert.ok(spec.population > 0, regionId)
    assert.ok(spec.internetBps > 0 && spec.internetBps <= 10000, regionId)
    assert.ok(spec.slots >= 3, regionId)
    assert.equal(spec.slotCapacity, Math.ceil(spec.population / spec.slots), regionId)
    assert.ok(spec.bubblePoints.length >= 5, regionId)
    for (const [lon, lat] of spec.bubblePoints) {
      assert.ok(lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90, regionId)
    }
    assert.equal(slotUnlockLimit(spec.slots, 0), 1, regionId)
    assert.ok(slotUnlockLimit(spec.slots, 1) >= 2 && slotUnlockLimit(spec.slots, 1) <= spec.slots, regionId)
    assert.ok(slotUnlockLimit(spec.slots, 2) >= slotUnlockLimit(spec.slots, 1), regionId)
    assert.equal(slotUnlockLimit(spec.slots, 3), spec.slots, regionId)
    for (const countryId of spec.countries) {
      assert.equal(mapped.has(countryId), false, countryId)
      mapped.add(countryId)
      assert.equal(regionOfCountry(countryId), regionId)
    }
  }
  assert.deepEqual([...mapped].sort(), shapes.filter(id => id !== "ATA").sort())
  assert.equal(regionIds.reduce((sum, id) => sum + regionCapacity(id), 0), 36)
  assert.equal(globalPlayablePopulation, regionIds.reduce((sum, id) => sum + regions[id].population, 0))
  for (const id of ["ATA", "unknown", "__proto__"]) assert.equal(regionOfCountry(id), undefined)
  assert.equal(btoken.buildCardCost, 12)
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
  for (const [continent, countryList] of Object.entries(borders)) {
    for (const country of countryList) assert.equal(regionOfCountry(country), continent, country)
  }
})

test("the three research pages contain fifty distinct technologies and reciprocal exclusive choices", () => {
  assert.deepEqual(trees.map(t => t.skills.length), [17, 17, 16])
  const skills = researchNodes.map(n => n.skill)
  assert.equal(new Set(skills.map(s => s.id)).size, 50)
  assert.equal(skills.filter(s => s.repeatCostStep).length, 4)
  assert.equal(skills.filter(s => s.dangerBps).length, 5)
  assert.equal(skills.filter(s => s.excludes).length, 4)
  for (const s of skills.filter(s => s.excludes)) assert.equal(researchNode(s.excludes).skill.excludes, s.id)
  const abilityIds = [...actions.map(a => a.id), ...Object.values(standardScenario.factions).map(f => f.ability.id)]
  assert.equal(new Set(abilityIds).size, abilityIds.length)
})

test("the dependency graph is acyclic and every technology is reachable under valid exclusive choices", () => {
  const visited = new Set(), visiting = new Set()
  function visit(id) {
    if (visited.has(id)) return
    assert.ok(!visiting.has(id), id)
    visiting.add(id)
    const { skill } = researchNode(id)
    for (const group of skill.requires) {
      assert.ok(group.length)
      group.forEach(visit)
    }
    for (const v of [skill.cost, skill.days, skill.repeatCostStep, skill.dailyCorpusBonus, skill.dangerBps])
      if (v !== undefined) assert.ok(Number.isSafeInteger(v) && v > 0, id)
    assert.ok(Object.entries(skill.attributes).every(([key, v]) => attributeIds.includes(key) && Number.isInteger(v)), id)
    visiting.delete(id)
    visited.add(id)
  }
  researchNodes.forEach(n => visit(n.skill.id))
  const covered = new Set()
  for (const excluded of [new Set(["closed-subscription", "autonomous-decisions"]), new Set(["open-source", "human-approval"])]) {
    const done = new Set()
    let progress = true
    while (progress) {
      progress = false
      for (const { skill } of researchNodes) {
        if (done.has(skill.id) || excluded.has(skill.id)) continue
        if (skill.requires.every(g => g.some(p => done.has(p)))) {
          done.add(skill.id)
          covered.add(skill.id)
          progress = true
        }
      }
    }
    assert.equal(done.size, 46)
  }
  assert.equal(covered.size, 50)
  assert.equal(standardScenario.rules.standardVictory.minGlobalSyntheticBps, 10000)
  assert.equal(standardScenario.rules.standardVictory.minPlayerSyntheticShareBps, 5000)
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

test("five illustrated decisions have payable options, translated outcomes and valid content references", () => {
  assert.deepEqual(Object.keys(decisions).sort(), ["unexpected-coding", "community-router", "inference-dividend", "audit-request", "research-exchange"].sort())
  const images = new Set()
  const newsIds = new Set(news.map(item => item.id))
  for (const [id, decision] of Object.entries(decisions)) {
    assert.ok(decision.source && decision.scope, id)
    if (decision.requiresSkill) assert.ok(researchNode(decision.requiresSkill), id)
    assert.ok(decision.choices.some(choice => choice.cost === 0 && choice.corpusCost === 0), `${id}: no free fallback`)
    for (const choice of decision.choices) {
      for (const amount of [choice.cost, choice.corpusCost, choice.effect.tokens, choice.effect.corpus, choice.effect.humanBps])
        assert.ok(Number.isSafeInteger(amount), `${id}/${choice.id}`)
      assert.ok(choice.cost >= 0 && choice.corpusCost >= 0)
      if (choice.followUp) {
        assert.ok(newsIds.has(choice.followUp.id), choice.followUp.id)
        assert.ok(Number.isSafeInteger(choice.followUp.delayDays) && choice.followUp.delayDays > 0)
      }
      for (const locale of [zhCN, en]) {
        assert.ok(locale.choices[id][choice.id].label)
        assert.ok(locale.choices[id][choice.id].result)
      }
    }
    for (const locale of [zhCN, en]) {
      assert.ok(locale.events[id].title && locale.events[id].body)
      assert.ok(locale.eventDetails[id].source && locale.eventDetails[id].scope)
    }
    assert.match(decision.image, /^\/assets\/events\/[a-z-]+\.png$/)
    images.add(decision.image)
    const image = readFileSync(new URL(`../../../apps/web/public${decision.image}`, import.meta.url))
    assert.equal(image.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", decision.image)
    assert.ok(image.readUInt32BE(16) > image.readUInt32BE(20), `${id}: banner must be landscape`)
  }
  assert.equal(images.size, 5)
  for (const id of ["unexpected-coding", "coding-integrated", "coding-isolated"])
    assert.equal(eventPool.some(item => item.id === id), false, `${id}: belongs to a chain, not a random draw`)
})
