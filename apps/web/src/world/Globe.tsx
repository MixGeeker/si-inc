import { use, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type Ref } from "react"
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber"
import { DirectionalLight, InstancedMesh, MathUtils, Matrix4, Vector3 } from "three"
import { OrbitControls } from "three/addons/controls/OrbitControls.js"
import { createAtlas } from "./atlas"
import { loadCountries } from "../cartography/atlas"
import { exampleRoutes, regionIds, regions, type Layer, type RegionId } from "./snapshot"

interface GlobeProps {
  selected: RegionId
  layer: Layer
  focus: { id: RegionId }
  onPick: (id: RegionId) => void
}
type Rig = { zoom: (factor: number) => void }

function direction(id: RegionId) {
  const [longitude, latitude] = regions[id].center
  const lon = MathUtils.degToRad(longitude), lat = MathUtils.degToRad(latitude)
  return new Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon))
}

function CameraRig({ focus, rig, onContext }: Pick<GlobeProps, "focus"> & {
  rig: Ref<Rig>; onContext: (lost: boolean) => void
}) {
  const { camera, gl, invalidate } = useThree()
  const orbit = useRef<OrbitControls | null>(null)
  const light = useRef<DirectionalLight>(null)
  useLayoutEffect(() => {
    const element = gl.domElement
    const controls = new OrbitControls(camera, element)
    controls.enablePan = false
    controls.minDistance = 2.1
    controls.maxDistance = 4.2
    controls.rotateSpeed = 0.65
    const redraw = () => invalidate()
    controls.addEventListener("change", redraw)
    orbit.current = controls
    const lost = (event: Event) => { event.preventDefault(); onContext(true) }
    const restored = () => { onContext(false); invalidate() }
    element.addEventListener("webglcontextlost", lost)
    element.addEventListener("webglcontextrestored", restored)
    return () => {
      element.removeEventListener("webglcontextlost", lost)
      element.removeEventListener("webglcontextrestored", restored)
      controls.removeEventListener("change", redraw)
      controls.dispose()
      orbit.current = null
    }
  }, [camera, gl, invalidate, onContext])

  useLayoutEffect(() => {
    const distance = camera.position.length()
    camera.position.copy(direction(focus.id)).multiplyScalar(distance)
    orbit.current?.update()
    invalidate()
  }, [focus, camera, invalidate])

  useImperativeHandle(rig, () => ({
    zoom(factor) {
      const controls = orbit.current
      if (!controls) return
      const distance = MathUtils.clamp(camera.position.length() * factor, controls.minDistance, controls.maxDistance)
      camera.position.setLength(distance)
      controls.update()
    },
  }), [camera])

  useFrame(() => { light.current?.position.set(-2, 3, 4).applyQuaternion(camera.quaternion) })
  return <directionalLight ref={light} color="#fff1d6" intensity={1.65} />
}

function Network() {
  const nodes = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    if (!nodes.current) return
    regionIds.forEach((id, i) => {
      nodes.current!.setMatrixAt(i, new Matrix4().makeTranslation(direction(id).multiplyScalar(1.014)))
    })
    nodes.current.instanceMatrix.needsUpdate = true
    nodes.current.computeBoundingSphere()
  }, [])
  const arcs = useMemo(() => {
    const segments: number[] = []
    for (const [a, b] of exampleRoutes) {
      const start = direction(a), end = direction(b)
      const angle = Math.acos(MathUtils.clamp(start.dot(end), -1, 1))
      let previous = start.clone().multiplyScalar(1.014)
      for (let i = 1; i <= 36; i++) {
        const t = i / 36
        const next = start.clone().multiplyScalar(Math.sin((1 - t) * angle))
          .addScaledVector(end, Math.sin(t * angle)).normalize()
          .multiplyScalar(1.014 + 0.10 * Math.sin(Math.PI * t))
        segments.push(...previous.toArray(), ...next.toArray())
        previous = next
      }
    }
    return Float32Array.from(segments)
  }, [])
  return <>
    <lineSegments>
      <bufferGeometry><bufferAttribute attach="attributes-position" args={[arcs, 3]} /></bufferGeometry>
      <lineBasicMaterial color="#f6bc6e" transparent opacity={0.85} />
    </lineSegments>
    <instancedMesh ref={nodes} args={[undefined, undefined, regionIds.length]}>
      <sphereGeometry args={[0.013, 10, 7]} /><meshBasicMaterial color="#ffdfa2" />
    </instancedMesh>
  </>
}

function Surface({ selected, layer, onPick }: Omit<GlobeProps, "focus">) {
  const countries = use(loadCountries())
  const atlas = useMemo(() => createAtlas(countries), [countries])
  const invalidate = useThree(state => state.invalidate)
  useLayoutEffect(() => {
    atlas.paint(layer, selected)
    invalidate()
  }, [atlas, layer, selected, invalidate])
  useEffect(() => () => atlas.texture.dispose(), [atlas])
  function pick(event: ThreeEvent<MouseEvent>) {
    if (!event.uv || event.delta > 4 || event.button !== 0) return
    const id = atlas.pick(event.uv.x, event.uv.y)
    if (id) onPick(id)
  }
  return <mesh onClick={pick}>
    <sphereGeometry args={[1, 64, 48]} />
    <meshPhongMaterial map={atlas.texture} specular="#1a3742" shininess={14} />
  </mesh>
}

export default function Globe({ focus, ...surface }: GlobeProps) {
  const rig = useRef<Rig>(null)
  const [lost, setLost] = useState(false)
  return <>
    <div className="scene" aria-label="可拖动、缩放和点选地区的三维地球">
      <Canvas camera={{ position: [0, 0, 2.85], fov: 47, near: 0.1, far: 16 }}
        dpr={[1, 1.5]} frameloop="demand" flat gl={{ antialias: true, alpha: true }}
        fallback={<p role="status">此设备不支持 3D 显示，可从地区列表查看态势。</p>}>
        <ambientLight color="#d4e4ef" intensity={1.35} />
        <CameraRig focus={focus} rig={rig} onContext={setLost} />
        <Surface {...surface} /><Network />
      </Canvas>
    </div>
    {lost && <div className="scene-message" role="status">正在恢复 3D 显示，地区列表仍可使用。</div>}
    <div className="zoom" aria-label="地球缩放">
      <button type="button" aria-label="拉近地球" onClick={() => rig.current?.zoom(0.88)}>＋</button>
      <button type="button" aria-label="拉远地球" onClick={() => rig.current?.zoom(1 / 0.88)}>−</button>
    </div>
  </>
}
