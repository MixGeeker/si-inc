import { useEffect, useLayoutEffect, useMemo, useRef } from "react"
import { useFrame, useLoader, useThree } from "@react-three/fiber"
import { Mesh, TextureLoader } from "three"
import { Atlas, surfaceUrl, vaporUrl, type Country } from "./atlas"
import humidityUrl from "./data/humidity.png"
import { MapCamera } from "./camera"
import { WORLD_WIDTH, WORLD_HEIGHT, Y_SCALE } from "./layout"
import { CurrentTraces } from "./currents"
import { borders, materials, reliefGeometry, selectionTexture, velocityTexture } from "./materials"

export type LayerState = { cloud:boolean; current:boolean; speed:number; reduced:boolean }
type Props = {atlas:Atlas; rig:MapCamera; selected?:Country | null; layers:LayerState;
  project:(time:number)=>void; onReady:()=>void}
export default function TerrainScene({atlas,rig,selected,layers,project,onReady}:Props) {
  const {gl, invalidate, set} = useThree()
  const [surface,vapor,humidity] = useLoader(TextureLoader,[surfaceUrl,vaporUrl,humidityUrl])
  const geometry = useMemo(()=>reliefGeometry(atlas),[atlas])
  const wind = useMemo(()=>velocityTexture(atlas),[atlas])
  const bordersMap = useMemo(()=>borders(atlas),[atlas])
  const blank = useMemo(()=>selectionTexture(null),[])
  const mark = useMemo(()=>selected ? selectionTexture(selected) : blank,[selected,blank])
  const mat = useMemo(()=>materials(surface,vapor,humidity,wind,bordersMap,blank),[surface,vapor,humidity,wind,bordersMap,blank])
  const traces = useMemo(()=>new CurrentTraces(atlas),[atlas])
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
    gl.setClearColor(0x04060f,1)
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
    mat.uniforms.cloudsOn.value = layers.cloud ? 1 : 0
    mat.uniforms.currentsOn.value = layers.current ? 1 : 0
    invalidate()
  },[mat,mark,layers,invalidate])
  useEffect(()=>()=>{if(mark!==blank) mark.texture.dispose()},[mark,blank])
  useEffect(()=>()=>{geometry.dispose(); wind.dispose(); bordersMap.dispose(); blank.texture.dispose()
    mat.ground.dispose(); mat.sky.dispose(); traces.geometry.dispose()
  },[geometry,wind,bordersMap,blank,mat,traces])
  useFrame((state,delta)=>{
    if (document.hidden || gl.getContext().isContextLost()) return
    const w=gl.domElement.clientWidth, h=gl.domElement.clientHeight
    rig.resize(w,h)
    const moved = rig.step(delta,layers.reduced)
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
    if (moved || speed>0) state.invalidate()
  })
  return <>
    {[-360,0,360].map((x,i)=><group key={x} position-x={x}>
      <mesh ref={el=>{terrainMeshes.current[i]=el}} geometry={geometry} material={mat.ground} dispose={null}/>
      {layers.current && <lineSegments geometry={traces.geometry} frustumCulled={false} dispose={null}>
        <lineBasicMaterial vertexColors transparent opacity={.46} depthWrite={false} toneMapped={false}/>
      </lineSegments>}
      {layers.cloud && <mesh position-z={2.45} material={mat.sky} renderOrder={2}>
        <planeGeometry args={[WORLD_WIDTH,WORLD_HEIGHT]}/>
      </mesh>}
    </group>)}
  </>
}
