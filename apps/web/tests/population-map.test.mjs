import assert from "node:assert/strict"
import test from "node:test"
import { populationShares } from "../../../packages/game/population.ts"
import { encodeCountryPopulations, encodeRegionPopulations, factionShaderIndex, flatCountryFill, populationColors, projectRegionPopulationsToContours, rivalPopulationColors } from "../src/cartography/country-field.ts"
import { createGameStore } from "../src/scenes/store.ts"
import { previewPopulations } from "../src/scenes/world/populationPreview.ts"

test("the East Asia sample only accepts edits in the open preview and never enters a run", () => {
  const store = createGameStore(), snapshot = store.getSnapshot
  const open = {type:"open-population-preview"}
  const set = percent => ({type:"set-preview-population",field:"peninsulaCoverage",percent})
  const initial = snapshot()
  store.dispatch(open); store.dispatch(set(100))
  assert.strictEqual(snapshot(), initial)
  store.dispatch({type:"open-panel",panel:"world"}); store.dispatch(open)
  store.dispatch(set(0))
  const zero = snapshot()
  assert.equal(zero.populationPreview.peninsulaCoverage, 0)
  for (const percent of [0, -1, 101, .5, NaN]) store.dispatch(set(percent))
  store.dispatch({...set(50),field:"unrecognized"})
  assert.strictEqual(snapshot(), zero)
  store.dispatch(set(100))
  const counts = previewPopulations(snapshot().populationPreview)
  assert.equal(populationShares(counts.KOR).coverage, 1)
  store.dispatch({type:"set-layer",layer:"population",enabled:false})
  assert.equal(snapshot().populationPreview, null)
  store.dispatch({type:"open-panel",panel:"world"}); store.dispatch(open)
  assert.equal(snapshot().layers.population, true)
  store.dispatch({type:"open-panel",panel:"menu"}); store.dispatch({type:"open-setup"})
  store.dispatch({type:"start",factionId:"gpt",startRegionId:"as",difficultyId:"standard",seed:15})
  assert.equal(snapshot().populationPreview, null)
  assert.ok(snapshot().scene.run.regionPopulations.as?.factions.gpt.immersed > 0)
  const projected = projectRegionPopulationsToContours(["CHN", "JPN", "KOR", "ATA"], snapshot().scene.run.regionPopulations)
  assert.strictEqual(projected.CHN, snapshot().scene.run.regionPopulations.as)
  assert.strictEqual(projected.JPN, snapshot().scene.run.regionPopulations.as)
  assert.equal(projected.ATA, undefined)
  const regBytes = encodeRegionPopulations(["CHN", "ATA"], snapshot().scene.run.regionPopulations)
  assert.ok(regBytes[1 * 4] > 0)
  assert.equal(regBytes[2 * 4], 0)
  store.dispatch({type:"open-panel",panel:"world"})
  const live = snapshot()
  store.dispatch(open); store.dispatch(set(25))
  assert.strictEqual(snapshot(), live)
})

test("the country denominator includes uncovered people and rejects contradictory cohorts", () => {
  const country = {total:100, factions:{gpt:{immersed:20,synthetic:10},claude:{immersed:20,synthetic:0}}}
  assert.equal(populationShares(country).coverage, .5)
  assert.deepEqual(populationShares({...country, factions:{claude:country.factions.claude,gpt:country.factions.gpt}}), populationShares(country))
  for (const total of [0, -1, 49, 80.5, NaN]) assert.equal(populationShares({...country,total}), null)
  for (const counts of [{immersed:-1,synthetic:4},{immersed:1,synthetic:Infinity},undefined]) {
    assert.equal(populationShares({total:100,factions:{gpt:counts}}),null)
  }
  assert.equal(populationShares({total:100,factions:{}}),null)
})

test("country population texture encoding preserves coverage, faction shares, and per-faction synthetic ratios", () => {
  const ids = ["KOR", "JPN", "EMPTY"]
  const populations = {
    KOR: { total: 200, factions: { gpt: { immersed: 20, synthetic: 0 }, claude: { immersed: 30, synthetic: 0 }, grok: { immersed: 50, synthetic: 0 } } },
    JPN: { total: 100, factions: { gpt: { immersed: 10, synthetic: 40 }, claude: { immersed: 30, synthetic: 0 }, grok: { immersed: 0, synthetic: 20 } } },
  }
  const bytes = encodeCountryPopulations(ids, populations)

  // Slot 1 = KOR (coverage 50%, total synthetic 0%, gpt 20%, claude 30%).
  const kor0 = 1 * 4, kor1 = (256 + 1) * 4
  assert.equal(bytes[kor0], Math.round(0.5 * 255))
  assert.equal(bytes[kor0 + 1], 0)
  assert.equal(bytes[kor0 + 2], Math.round(0.2 * 255))
  assert.equal(bytes[kor0 + 3], Math.round(0.3 * 255))
  assert.equal(bytes[kor1], 0)
  assert.equal(bytes[kor1 + 1], 0)
  assert.equal(bytes[kor1 + 2], 0)

  // Slot 2 = JPN (coverage 100%, total synthetic 60%, gpt 50% w/ 80% syn, claude 30% w/ 0% syn, grok 20% w/ 100% syn).
  const jpn0 = 2 * 4, jpn1 = (256 + 2) * 4
  assert.equal(bytes[jpn0], 255)
  assert.equal(bytes[jpn0 + 1], Math.round(0.6 * 255))
  assert.equal(bytes[jpn0 + 2], Math.round(0.5 * 255))
  assert.equal(bytes[jpn0 + 3], Math.round(0.3 * 255))
  assert.equal(bytes[jpn1], Math.round(0.8 * 255))
  assert.equal(bytes[jpn1 + 1], 0)
  assert.equal(bytes[jpn1 + 2], 255)

  // Slot 3 = EMPTY stays zeroed.
  assert.deepEqual([...bytes.subarray(3 * 4, 3 * 4 + 4)], [0, 0, 0, 0])
  assert.equal(flatCountryFill(populations.KOR).color, populationColors.grok[0])
  assert.equal(flatCountryFill(populations.KOR, "gpt").color, rivalPopulationColors.grok[0])
  assert.equal(flatCountryFill(populations.JPN, "gpt").color, populationColors.gpt[1])
  assert.equal(flatCountryFill(populations.JPN, "claude").color, rivalPopulationColors.gpt[1])
  assert.equal(factionShaderIndex("gpt"), 0)
  assert.equal(factionShaderIndex("claude"), 1)
  assert.equal(factionShaderIndex("grok"), 2)
  assert.equal(factionShaderIndex(null), -1)
  assert.equal(flatCountryFill(undefined), null)
})
