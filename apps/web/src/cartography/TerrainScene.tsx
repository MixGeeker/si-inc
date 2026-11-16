import { useEffect, useLayoutEffect, useMemo, useRef } from "react"
import { useFrame, useLoader, useThree } from "@react-three/fiber"
import { Color, MathUtils, Mesh, TextureLoader } from "three"
import { Atlas, surfaceUrl, nightLightsUrl, vaporUrl, type Country } from "./atlas"
import humidityUrl from "./data/humidity.png"
import type { PopulationSurface } from "./population-surface"
import type { PopulationProfile } from "./population-field"
import { populationMesh } from "./population-mesh"
import { MapCamera } from "./camera"
import { WORLD_WIDTH, WORLD_HEIGHT, Y_SCALE } from "./layout"
import { CurrentTraces } from "./currents"
import { borders, materials, reliefGeometry, selectionTexture, velocityTexture } from "./materials"
import { SWEEP_MS, cloudCoverAt, hasOutgoingClouds, type CloudSweep } from "./cloud-sweep"

type LightTransition = CloudSweep & { lightStartedAt:number; initialNight:number }

export type LayerState = { cloud:boolean; current:boolean; speed:number; reduced:boolean; night:boolean }
type Props = {atlas:Atlas; rig:MapCamera; selected:readonly Country[]; layers:LayerState;
  surfaces:readonly PopulationSurface[]; profiles:ReadonlyMap<string, PopulationProfile>;
  project:(time:number)=>void; onReady:()=>void}
export default function TerrainScene({atlas,rig,selected,layers,surfaces,profiles,project,onReady}:Props) {
  const {gl, invalidate, set} = useThree()
  const [surface,nightLights,vapor,humidity] = useLoader(TextureLoader,[surfaceUrl,nightLightsUrl,vaporUrl,humidityUrl])
  const geometry = useMemo(()=>reliefGeometry(atlas),[atlas])
  const wind = useMemo(()=>velocityTexture(atlas),[atlas])
  const bordersMap = useMemo(()=>borders(atlas),[atlas])
  const blank = useMemo(()=>selectionTexture(),[])
  const mark = useMemo(()=>selected.length ? selectionTexture(selected) : blank,[selected,blank])
  const mat = useMemo(()=>materials(surface,nightLights,vapor,humidity,wind,bordersMap,blank),[surface,nightLights,vapor,humidity,wind,bordersMap,blank])
  const backdrop = useMemo(()=>({ day:new Color(0x164458), night:new Color(0x04060f), color:new Color() }),[])
  const previousNight = useRef(layers.night)
  const sweep = useRef<LightTransition | null>(null)
  const traces = useMemo(()=>new CurrentTraces(atlas),[atlas])
  const population = useMemo(()=>surfaces.map(field=>populationMesh(atlas,field)),[atlas,surfaces])
  const elapsed = useRef(0), seaDt = useRef(0), overlayDt = useRef(1)
  const terrainMeshes=useRef<(Mesh|null)[]>([])
  useLayoutEffect(()=>{
    rig.surfaceHit=ray=>{
      const meshes=terrainMeshes.current.filter((mesh):mesh is Mesh=>mesh!==null)
      const first=ray.intersectObjects(meshes,false)[0]
      return first ? {lon:first.point.x,lat:first.point.y/Y_SCALE} : null
    }
    return ()=>{rig.surfaceHit=undefined}
  },[rig])
  useLayoutEffect(()=>{
    set({camera:rig.camera})
    rig.setFlat(false)
    const node = gl.domElement
    node.setAttribute("aria-label","三维世界地形")
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
  useEffect(()=>()=>{for (const p of population) {
    p.texture.dispose(); p.material.dispose(); p.geometry.dispose()
  }},[population])
  useEffect(()=>()=>{geometry.dispose(); wind.dispose(); bordersMap.dispose(); blank.texture.dispose()
    mat.ground.dispose(); mat.sky.dispose(); traces.geometry.dispose()
  },[geometry,wind,bordersMap,blank,mat,traces])
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
    for (const p of population) {
      p.surface.update(profiles.get(p.surface.id)!, elapsed.current)
      if (p.uploaded !== p.surface.revision) { p.texture.needsUpdate = true; p.uploaded = p.surface.revision }
    }
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
    {[-360,0,360].map((x,i)=><group key={x} position-x={x}>
      <mesh ref={el=>{terrainMeshes.current[i]=el}} geometry={geometry} material={mat.ground} dispose={null}/>
      {population.map(p=><mesh key={p.surface.id} geometry={p.geometry} material={p.material} renderOrder={1} dispose={null}/>)}
      {layers.current && <lineSegments geometry={traces.geometry} frustumCulled={false} dispose={null}>
        <lineBasicMaterial vertexColors transparent opacity={.46} depthWrite={false} toneMapped={false}/>
      </lineSegments>}
      {layers.cloud && <mesh position-z={2.45} material={mat.sky} renderOrder={2}>
        <planeGeometry args={[WORLD_WIDTH,WORLD_HEIGHT]}/>
      </mesh>}
    </group>)}
  </>
}
