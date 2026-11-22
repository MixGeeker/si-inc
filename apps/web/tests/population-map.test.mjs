import assert from "node:assert/strict"
import test from "node:test"
import { populationShares } from "../../../packages/game/population.ts"
import { createPopulationPointBuilder, populationColors } from "../src/cartography/population-points.ts"
import { Y_SCALE } from "../src/cartography/layout.ts"
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
  assert.ok(snapshot().scene.run.countryPopulations.CHN?.factions.gpt.immersed > 0)
  for (const sampleId of ["KOR", "PRK", "JPN"]) assert.equal(snapshot().scene.run.countryPopulations[sampleId], undefined)
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

function cloudColors(cloud) {
  const points = new Map()
  let offset = 0
  for (const { color, start, count } of cloud.groups) {
    assert.equal(start, offset)
    for (let point = start; point < start + count; point++) {
      const xyz = cloud.positions.subarray(point * 3, point * 3 + 3)
      const rgb = cloud.colors.subarray(point * 3, point * 3 + 3)
      assert.equal(`#${Array.from(rgb, value => value.toString(16).padStart(2, "0")).join("")}`, color)
      points.set(xyz.join(","), color)
      offset++
    }
  }
  assert.equal(offset * 3, cloud.positions.length)
  assert.equal(cloud.colors.length, cloud.positions.length)
  return points
}

test("country points preserve partial coverage and stable cohorts across snapshots", () => {
  const shape = { id: "ONE", box: [0, -6, 16, 2],
    d: "M180,88 188,88 188,96 180,96ZM182,90 185,90 185,93 182,93ZM193,91 196,91 196,94 193,94Z" }
  const shapeData = new Int16Array(721 * 361)
  const build = createPopulationPointBuilder([shape], shapeData)
  const counts = (total, synthetic) => ({ ONE: { total, factions: {
    gpt: { immersed: 70 - synthetic, synthetic }, claude: { immersed: 30, synthetic: 0 },
  } } })
  const full = build(counts(100, 0)), partial = build(counts(200, 20))
  assert.ok(full.positions.length > 0)
  assert.equal(partial.positions.length / 3, Math.round(full.positions.length / 6))
  const cohort = color => partial.groups.find(group => group.color === color)?.count ?? 0
  const expected = [[populationColors.gpt[0], .5], [populationColors.gpt[1], .2], [populationColors.claude[0], .3]]
  for (const [color, fraction] of expected) {
    assert.ok(Math.abs(cohort(color) - partial.positions.length / 3 * fraction) <= 1)
  }

  const before = cloudColors(full), after = cloudColors(build(counts(100, 70)))
  for (const [point, color] of before) {
    assert.equal(after.get(point), color === populationColors.gpt[0] ? populationColors.gpt[1] : color)
  }
  for (const point of cloudColors(partial).keys()) assert.ok(before.has(point))
  assert.deepEqual(build(counts(100, 0)), full)
  assert.equal(build({}).positions.length, 0)

  let island = 0
  for (let i = 0; i < full.positions.length; i += 3) {
    const x = full.positions[i] + 180, y = 90 - full.positions[i + 1] / Y_SCALE
    if (x > 193 && x < 196 && y > 91 && y < 94) island++
    else assert.ok(x > 180 && x < 188 && y > 88 && y < 96)
    assert.ok(!(x > 182 && x < 185 && y > 90 && y < 93))
  }
  assert.ok(island > 0)
})

test("point altitude follows the terrain triangle with a fixed lift", () => {
  const shape = { id: "ONE", box: [.02, -.48, .48, -.02], d: "M180.02,90.02 180.48,90.02 180.48,90.48 180.02,90.48Z" }
  const heights = new Int16Array(721 * 361)
  heights[180 * 721 + 360] = 2500
  const build = createPopulationPointBuilder([shape], heights)
  const { positions } = build({ ONE: { total: 1, factions: { gpt: { immersed: 1, synthetic: 0 } } } })
  assert.ok(positions.some((z, i) => i % 3 === 2 && z > .1))
  for (let i = 0; i < positions.length; i += 3) {
    const fraction = Math.max(0, 1 - 2 * (positions[i] - positions[i + 1] / Y_SCALE))
    assert.ok(Math.abs(positions[i + 2] - (.08 + 2500 * .00055 * fraction)) < .0001)
  }
})

test("full global coverage is capped and independent of geometry insertion order", () => {
  const countries = Array.from({ length: 60 }, (_, i) => ({ id: `T${i}`, box: [-170, 20, -80, 80],
    d: "M10,10 100,10 100,70 10,70Z" }))
  const populations = Object.fromEntries(countries.map(({ id }) => [id, { total: 1, factions: { grok: { immersed: 1, synthetic: 0 } } }]))
  const heights = new Int16Array(721 * 361)
  const full = createPopulationPointBuilder(countries, heights)(populations)
  assert.ok(full.positions.length / 3 <= 20_000)
  assert.ok(full.positions.length / 3 > 19_000)
  assert.deepEqual(createPopulationPointBuilder(countries.reverse(), heights)(populations), full)
})
