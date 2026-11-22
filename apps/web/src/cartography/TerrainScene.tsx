import { useEffect, useLayoutEffect, useMemo, useRef } from "react"
import { useFrame, useLoader, useThree } from "@react-three/fiber"
import { Color, Group, MathUtils, TextureLoader } from "three"
import type { CountryPopulations } from "../../../../packages/game/population.ts"
import { Atlas, relief, surfaceUrl, nightLightsUrl, vaporUrl, type Country } from "./atlas"
import humidityUrl from "./data/humidity.png"
import { buildCountryFieldTexture, createCountryPopulationTexture, updateCountryPopulationTexture } from "./country-field"
import { MapCamera } from "./camera"
import { WORLD_WIDTH, WORLD_HEIGHT, Y_SCALE } from "./layout"
import { CurrentTraces } from "./currents"
import { borders, materials, selectionTexture, velocityTexture } from "./materials"
import { terrainTiles } from "./terrain-geometry"
import { SWEEP_MS, cloudCoverAt, hasOutgoingClouds, type CloudSweep } from "./cloud-sweep"

type LightTransition = CloudSweep & { lightStartedAt:number; initialNight:number }
const worldCopies = [-WORLD_WIDTH, 0, WORLD_WIDTH]
const terrainTextures = [surfaceUrl, nightLightsUrl, vaporUrl, humidityUrl]

export function preloadTerrainTextures() {
  useLoader.preload(TextureLoader, terrainTextures)
}

export type LayerState = { cloud:boolean; current:boolean; speed:number; reduced:boolean; night:boolean }
type Props = {
  terrainLabel:string; atlas:Atlas; rig:MapCamera; selected:readonly Country[]; layers:LayerState
  populations:CountryPopulations; populationScope:string | null
  project:(time:number)=>void; onReady:()=>void
}

export default function TerrainScene({
  terrainLabel, atlas, rig, selected, layers, populations, populationScope, project, onReady,
}:Props) {
  const {gl, invalidate, set} = useThree()
  const [surface,nightLights,vapor,humidity] = useLoader(TextureLoader, terrainTextures)
  const tiles = useMemo(()=>terrainTiles(i=>relief(atlas.heights[i])),[atlas])
  const wind = useMemo(()=>velocityTexture(atlas),[atlas])
  const bordersMap = useMemo(()=>borders(atlas),[atlas])
  const countryField = useMemo(()=>buildCountryFieldTexture(atlas, nightLights),[atlas, nightLights])
  const countryPop = useMemo(()=>createCountryPopulationTexture(),[])
  const blank = useMemo(()=>selectionTexture(),[])
  const mark = useMemo(()=>selected.length ? selectionTexture(selected) : blank,[selected,blank])
  const mat = useMemo(
    ()=>materials(surface,nightLights,vapor,humidity,wind,bordersMap,blank,countryField,countryPop.texture),
    [surface,nightLights,vapor,humidity,wind,bordersMap,blank,countryField,countryPop],
  )
  const terrain = useRef<Group>(null)
  const ground = useMemo(()=><group ref={terrain}>
    {worldCopies.map(x=><group key={x} position-x={x}>
      {tiles.map(tile=><mesh key={tile.id} geometry={tile} material={mat.ground} dispose={null}/>)}
    </group>)}
  </group>,[tiles,mat.ground])
  const backdrop = useMemo(()=>({ day:new Color(0x164458), night:new Color(0x020207), color:new Color() }),[])
  const previousNight = useRef(layers.night)
  const sweep = useRef<LightTransition | null>(null)
  const traces = useMemo(()=>new CurrentTraces(atlas),[atlas])
  const elapsed = useRef(0), seaDt = useRef(0), overlayDt = useRef(1)

  useLayoutEffect(()=>{
    rig.surfaceHit=ray=>{
      const first=terrain.current && ray.intersectObject(terrain.current,true)[0]
      return first ? {lon:first.point.x,lat:first.point.y/Y_SCALE} : null
    }
    return ()=>{rig.surfaceHit=undefined}
  },[rig])
  useLayoutEffect(() => { gl.domElement.setAttribute("aria-label", terrainLabel) }, [gl, terrainLabel])
  useLayoutEffect(()=>{
    if (populationScope !== null) {
      updateCountryPopulationTexture(countryPop, atlas, populations)
      mat.uniforms.popEnabled.value = 1
    } else {
      mat.uniforms.popEnabled.value = 0
    }
    invalidate()
  },[atlas, countryPop, invalidate, mat, populationScope, populations])
  useLayoutEffect(()=>{
    set({camera:rig.camera})
    rig.setFlat(false)
    const node = gl.domElement
    node.dataset.renderer = "terrain"
    const wake = ()=>invalidate()
    document.addEventListener("visibilitychange",wake)
    onReady()
    return ()=>document.removeEventListener("visibilitychange",wake)
  },[set,gl,rig,invalidate,onReady])
  useLayoutEffect(()=>{
    mat.uniforms.selected.value = mark.texture
    mat.uniforms.selectionRect.value = mark.rect
    mat.uniforms.currentsOn.value = layers.current ? 1 : 0
    if (!layers.cloud || layers.reduced) {
      sweep.current = null
    } else if (layers.night !== previousNight.current) {
      const now = performance.now()
      const previous = sweep.current
      // A second toggle redirects the light while clouds already in flight keep moving left.
      sweep.current = {
        startedAt: previous && hasOutgoingClouds(previous, now) ? previous.startedAt : now,
        initialCover: previous ? cloudCoverAt(previous, now, previousNight.current) : mat.uniforms.cloudCover.value,
        lightStartedAt: now,
        initialNight: mat.uniforms.night.value,
      }
    }
    previousNight.current = layers.night
    if (!sweep.current) {
      mat.uniforms.cloudSweep.value = 0
      mat.setCloudCover(Number(layers.cloud && !layers.night))
      mat.uniforms.night.value = Number(layers.night)
      gl.setClearColor(layers.night ? backdrop.night : backdrop.day, 1)
    }
    invalidate()
  },[mat,mark,layers,gl,backdrop,invalidate])
  useEffect(()=>()=>{if(mark!==blank) mark.texture.dispose()},[mark,blank])
  useEffect(()=>()=>{for (const tile of tiles) tile.dispose()},[tiles])
  useEffect(()=>()=>{
    wind.dispose(); bordersMap.dispose(); countryField.dispose(); countryPop.texture.dispose(); blank.texture.dispose()
    mat.ground.dispose(); mat.sky.dispose(); traces.geometry.dispose()
  },[wind,bordersMap,countryField,countryPop,blank,mat,traces])
  useFrame((state,delta)=>{
    if (document.hidden || gl.getContext().isContextLost()) return
    const w=gl.domElement.clientWidth, h=gl.domElement.clientHeight
    rig.resize(w,h)
    const moved = rig.step(delta,layers.reduced)
    const gust = sweep.current
    if (gust) {
      const now = performance.now()
      const age = now - gust.startedAt
      const uniforms = mat.uniforms
      gl.getDrawingBufferSize(uniforms.viewportPixels.value)
      uniforms.cloudSweep.value = hasOutgoingClouds(gust, now) ? MathUtils.smoothstep(age, 0, SWEEP_MS) : 0
      const cover = cloudCoverAt(gust, now, layers.night)
      mat.setCloudCover(cover)
      const light = MathUtils.smoothstep(now - gust.lightStartedAt, 0, SWEEP_MS)
      uniforms.night.value = MathUtils.lerp(gust.initialNight, Number(layers.night), light)
      gl.setClearColor(backdrop.color.lerpColors(backdrop.day, backdrop.night, uniforms.night.value), 1)
      if (light === 1 && cover === Number(!layers.night)) sweep.current = null
    }
    const speed = layers.reduced ? 0 : layers.speed
    const dt = Math.min(delta,.12)*speed
    elapsed.current += dt
    mat.uniforms.elapsed.value = elapsed.current
    if (layers.current && dt>0) {
      seaDt.current += dt
      if (seaDt.current >= 1/24) { traces.advance(seaDt.current); seaDt.current=0 }
    }
    overlayDt.current += Math.min(delta,.12)
    if (moved || overlayDt.current>=1/24) {
      project(elapsed.current); overlayDt.current=0
      gl.domElement.dataset.tilt = rig.tilt.toFixed(2)
      gl.domElement.dataset.zoom = rig.current.zoom.toFixed(3)
    }
    if (moved || speed>0 || sweep.current) state.invalidate()
  })
  return <>
    {ground}
    {worldCopies.map(x=><group key={x} position-x={x}>
      {layers.current && <lineSegments geometry={traces.geometry} frustumCulled={false} dispose={null}>
        <lineBasicMaterial vertexColors transparent opacity={.46} depthWrite={false} toneMapped={false}/>
      </lineSegments>}
      {layers.cloud && <mesh position-z={2.45} material={mat.sky} renderOrder={2}>
        <planeGeometry args={[WORLD_WIDTH,WORLD_HEIGHT]}/>
      </mesh>}
    </group>)}
  </>
}
