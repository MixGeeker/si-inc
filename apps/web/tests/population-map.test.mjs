import assert from "node:assert/strict"
import test from "node:test"
import { populationShares } from "../../../packages/game/population.ts"
import { createPopulationField, populationColors } from "../src/cartography/population-field.ts"
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
  assert.deepEqual(snapshot().scene.run.countryPopulations, {})
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

test("animated coverage preserves land area and cohort shares, including holes and detached islands", () => {
  const w = 90, h = 52, mask = new Uint8ClampedArray(w*h*4)
  for (let y=0;y<h;y++) for (let x=0;x<w;x++) {
    if ((x<62 && y>3 && !(x>15 && x<27 && y>11 && y<22)) || (x>72 && y>20 && y<36)) {
      mask[(y*w+x)*4+3]=x===0 ? 128 : 255
    }
  }
  const field = createPopulationField(w,mask,10,932)
  const area = mask.reduce((sum,value)=>sum+value,0)
  const input = (total, synthetic) => populationShares({total,factions:{
    gpt:{immersed:70-synthetic,synthetic},claude:{immersed:30,synthetic:0},
  }})
  const colorAt = (pixels,i) => "#" + [pixels[i],pixels[i+1],pixels[i+2]].map(n=>n.toString(16).padStart(2,"0")).join("")
  let initial
  for (const t of [0,.75,2.1]) {
    const partial=field.paint(input(200,20),t)
    let covered=0,synth=0
    for(let i=0;i<partial.length;i+=4){
      const alpha=partial[i+3]
      assert.ok(alpha<=mask[i+3])
      covered+=alpha
      if(alpha && colorAt(partial,i)===populationColors.gpt[1]) synth+=alpha
    }
    assert.ok(Math.abs(covered/area-.5)<.001)
    assert.ok(Math.abs(synth/covered-.2)<.001)
    const full=field.paint(input(100,20),t)
    for(let i=3;i<full.length;i+=4) assert.equal(full[i],mask[i])
    if(initial) assert.notDeepEqual(full,initial)
    else initial=full.slice()
  }
  const before=field.paint(input(100,0),1).slice(), after=field.paint(input(100,70),1)
  for(let i=0;i<after.length;i+=4) if(mask[i+3]){
    const color=colorAt(before,i)
    assert.equal(colorAt(after,i),color===populationColors.gpt[0] ? populationColors.gpt[1] : color)
  }
})
