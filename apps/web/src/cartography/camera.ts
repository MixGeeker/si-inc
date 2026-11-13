import { PerspectiveCamera, Raycaster, Vector2, Vector3 } from "three"
import { Atlas, clamp, relief, wrapLon, type Location } from "./atlas"
import { overviewFrame, WORLD_WIDTH, Y_SCALE } from "./layout"

export const EUROPE = { lon: 2, lat: 22, zoom: .47 }
export const GLOBAL = { lon: 0, lat: 0, zoom: 0 }
export type Pose = typeof EUROPE
type Point = { x:number; y:number }
const FOV = 36
const HALF_FOV = FOV * Math.PI / 360
const TAN_HALF_FOV = Math.tan(HALF_FOV)
const REGIONAL_SPAN = 199
const ZOOM_RATIO = .11
// Release the overview framing smoothly before reaching the regional preset.
const overviewWeight = (zoom:number) => Math.max(0, 1 - zoom/.32) ** 2

export class MapCamera {
  readonly camera = new PerspectiveCamera(FOV, 16/9, .2, 1200)
  private readonly preview = this.camera.clone()
  private readonly ray = new Raycaster()
  private readonly ndc = new Vector2()
  private readonly hit = new Vector3()
  private readonly projected = new Vector3()
  current = { ...EUROPE }
  target = { ...EUROPE }
  width = 1
  height = 1
  tilt = 0
  flat = false
  surfaceHit?: (ray:Raycaster)=>{lon:number;lat:number}|null
  private dirty = true
  private overview = overviewFrame(1,1)
  constructor(readonly changeZoom: (value:number)=>void) {}
  setFlat(flat:boolean) {
    this.flat=flat
    this.dirty=true
  }

  resize(w:number,h:number) {
    if (w <= 0 || h <= 0 || w === this.width && h === this.height) return
    this.width = w; this.height = h
    this.overview = overviewFrame(w,h)
    this.dirty = true
  }
  private extent(zoom:number) {
    // A point above sea level projects closer to the eye. Fit even the tallest relief.
    const fitted = this.overview.span + 2 * TAN_HALF_FOV * relief(9000)
    return REGIONAL_SPAN * ZOOM_RATIO ** zoom * (fitted/REGIONAL_SPAN) ** overviewWeight(zoom)
  }
  private pitch(zoom:number) {
    const t = clamp(zoom/.68,0,1)
    return this.flat ? 0 : 56*t*t*(3-2*t)
  }
  private limit(p:Pose) {
    const extent = this.extent(p.zoom)
    const pitch = this.pitch(p.zoom)*Math.PI/180
    const free = 1 - overviewWeight(p.zoom)
    const margin = extent*.5*Math.cos(HALF_FOV)/Y_SCALE
    const south = Math.min(0, -90 + margin/Math.cos(pitch-HALF_FOV))
    const north = Math.max(0, 90 - margin/Math.cos(pitch+HALF_FOV))
    // At minimum zoom any navigation gesture converges on the same unbroken world.
    p.lon = clamp(wrapLon(p.lon), -180*free, 180*free)
    p.lat = clamp(p.lat, Math.max(south,-90*free), Math.min(north,90*free))
  }
  private place(camera:PerspectiveCamera,p:Pose) {
    const pitch = this.pitch(p.zoom)*Math.PI/180
    const distance = this.extent(p.zoom)*.5 / TAN_HALF_FOV
    camera.far = Math.max(1200, distance + WORLD_WIDTH)
    camera.position.set(p.lon,p.lat*Y_SCALE - Math.sin(pitch)*distance,Math.cos(pitch)*distance)
    camera.up.set(0,1,0)
    camera.lookAt(p.lon,p.lat*Y_SCALE,0)
    camera.setViewOffset(this.width,this.height,0,this.overview.offsetY*overviewWeight(p.zoom),this.width,this.height)
    camera.updateMatrixWorld()
  }
  step(dt:number, reduced:boolean) {
    this.limit(this.target)
    const c = this.current, t = this.target
    const dx = wrapLon(t.lon-c.lon), dy = t.lat-c.lat, dz = t.zoom-c.zoom
    if (!this.dirty && Math.abs(dx)+Math.abs(dy)+Math.abs(dz)<.00001) return false
    const a = reduced ? 1 : -Math.expm1(-12*Math.min(.12,dt))
    c.lon = wrapLon(c.lon+dx*a); c.lat += dy*a; c.zoom += dz*a
    this.limit(c)
    this.place(this.camera,c)
    this.tilt = this.pitch(c.zoom)
    this.dirty = false
    return true
  }
  private intersect(camera:PerspectiveCamera,p:Point,atlas?:Atlas) {
    this.ndc.set(p.x/this.width*2-1,1-p.y/this.height*2)
    this.ray.setFromCamera(this.ndc,camera)
    if (atlas && !this.flat && this.surfaceHit) {
      const hit=this.surfaceHit(this.ray)
      if (hit) return hit
    }
    const ray = this.ray.ray
    let z = 0
    for (let i=0;i<(atlas ? 5 : 1);i++) {
      ray.at((z-ray.origin.z)/ray.direction.z,this.hit)
      if (atlas) z = relief(atlas.metres(this.hit.x,this.hit.y/Y_SCALE))
    }
    return {lon:this.hit.x,lat:this.hit.y/Y_SCALE}
  }
  pick(p:Point,atlas:Atlas) {
    const pos = this.intersect(this.camera,p,this.flat ? undefined : atlas)
    return Math.abs(pos.lat)<=90 ? atlas.locate(pos.lon,pos.lat) : null
  }
  screen(lon:number,lat:number,z:number) {
    const x = this.current.lon + wrapLon(lon-this.current.lon)
    this.projected.set(x,lat*Y_SCALE,z).project(this.camera)
    return {x:(this.projected.x+1)*this.width/2,y:(1-this.projected.y)*this.height/2, visible:this.projected.z<1 }
  }
  pan(from:Point,to:Point) {
    this.place(this.preview,this.target)
    const a = this.intersect(this.preview,from), b = this.intersect(this.preview,to)
    this.target.lon = wrapLon(this.target.lon+a.lon-b.lon)
    this.target.lat += a.lat-b.lat
    this.limit(this.target)
  }
  zoom(value:number,anchor?:Point) {
    const t = this.target
    this.place(this.preview,t)
    const before = anchor && this.intersect(this.preview,anchor)
    t.zoom = clamp(value,0,1)
    if (anchor && before) {
      this.place(this.preview,t)
      const after = this.intersect(this.preview,anchor)
      t.lon = wrapLon(t.lon+before.lon-after.lon); t.lat += before.lat-after.lat
    }
    this.limit(t)
    this.changeZoom(t.zoom)
  }
  pinch(factor:number,anchor:Point) {
    // Invert the same span curve so a finger-distance ratio works across the overview transition.
    const span = this.extent(this.target.zoom)/factor
    if (span >= this.extent(0)) return this.zoom(0,anchor)
    if (span <= this.extent(1)) return this.zoom(1,anchor)
    let low=0, high=1
    for (let i=0;i<18;i++) {
      const mid=(low+high)/2
      if (this.extent(mid)>span) low=mid
      else high=mid
    }
    this.zoom((low+high)/2,anchor)
  }
  go(pose:Pose) {
    this.target = {...pose}
    this.changeZoom(pose.zoom)
  }
}

export function attachNavigation(element:HTMLElement, rig:MapCamera, atlas:Atlas, pick:(place:Location,point:Point)=>void) {
  const pointers = new Map<number,Point>()
  let start:Point | null = null, dragged = false
  const local = (e:PointerEvent | WheelEvent) => {
    const b = element.getBoundingClientRect()
    // The playfield rotates clockwise on a portrait phone.
    return matchMedia("(orientation: portrait) and (pointer: coarse)").matches
      ? {x:e.clientY-b.top,y:b.right-e.clientX}
      : {x:e.clientX-b.left,y:e.clientY-b.top}
  }
  const dist = (a:Point,b:Point) => Math.hypot(a.x-b.x,a.y-b.y)
  const mid = (a:Point,b:Point) => ({x:(a.x+b.x)/2,y:(a.y+b.y)/2})
  function down(e:PointerEvent) {
    if (e.button !== 0 || e.target instanceof Element && e.target.closest('[role="button"]')) return
    element.focus({preventScroll:true}); element.setPointerCapture(e.pointerId)
    const p = local(e)
    if (!pointers.size) { start = p; dragged = false }
    else dragged = true
    pointers.set(e.pointerId,p)
  }
  function move(e:PointerEvent) {
    const prior = pointers.get(e.pointerId)
    if (!prior) return
    const p = local(e), other = [...pointers].find(([id])=>id!==e.pointerId)?.[1]
    if (other) {
      const centre = mid(prior,other)
      rig.pinch(Math.max(1,dist(p,other))/Math.max(1,dist(prior,other)),centre)
      rig.pan(centre,mid(p,other))
    } else {
      if (start && dist(p,start)>4) dragged=true
      if (dragged) rig.pan(prior,p)
    }
    pointers.set(e.pointerId,p)
  }
  function up(e:PointerEvent) {
    if (!pointers.has(e.pointerId)) return
    if (e.type==="pointerup" && !dragged && start) {
      const point=local(e)
      const location=rig.pick(point,atlas)
      if (location) pick(location,point)
    }
    pointers.delete(e.pointerId)
    if (!pointers.size) start=null
    if (element.hasPointerCapture(e.pointerId)) element.releasePointerCapture(e.pointerId)
  }
  function wheel(e:WheelEvent) {
    e.preventDefault()
    const units = e.deltaMode===1 ? 16 : e.deltaMode===2 ? rig.height : 1
    rig.zoom(rig.target.zoom-clamp(e.deltaY*units,-320,320)*.00085,local(e))
  }
  function key(e:KeyboardEvent) {
    if(e.target!==element) return
    const step = Math.min(rig.width,rig.height)*.12
    const moves:Record<string,Point> = {ArrowLeft:{x:step,y:0},ArrowRight:{x:-step,y:0},ArrowUp:{x:0,y:step},ArrowDown:{x:0,y:-step}}
    if (e.key==="Home") rig.go(GLOBAL)
    else if (["=","+","-","_"].includes(e.key)) rig.zoom(rig.target.zoom+("=+".includes(e.key) ? .09 : -.09))
    else if (moves[e.key]) rig.pan({x:rig.width/2,y:rig.height/2},{x:rig.width/2+moves[e.key].x,y:rig.height/2+moves[e.key].y})
    else return
    e.preventDefault()
  }
  const events = {pointerdown:down,pointermove:move,pointerup:up,pointercancel:up,lostpointercapture:up,wheel,keydown:key}
  for (const [name,fn] of Object.entries(events)) element.addEventListener(name,fn as EventListener,{passive:false})
  return () => { for (const [name,fn] of Object.entries(events)) element.removeEventListener(name,fn as EventListener) }
}
