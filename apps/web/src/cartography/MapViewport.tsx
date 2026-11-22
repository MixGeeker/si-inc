import { Component, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Canvas, useThree } from "@react-three/fiber"
import { Atlas, nightLightsUrl, relief, surfaceUrl, type Country, type Location } from "./atlas"
import type { MapBubble } from "../../../../packages/game/operations.ts"
import type { CountryPopulations } from "../../../../packages/game/population.ts"
import { standardScenario } from "../../../../packages/rules/v0.1/scenario.ts"
import { flatCountryFill } from "./country-field"
import { attachNavigation, MapCamera } from "./camera"
import { hudScale, Y_SCALE } from "./layout"
import TerrainScene, { type LayerState } from "./TerrainScene"
import { countryName } from "./place-names"
import { useLanguage } from "../i18n/useLanguage"
import { formatCompactTokens } from "../scenes/world/hudContent"
import { computePlaceLabel, computePlaces } from "./compute-markers"

type Props = {
  atlas:Atlas; rig:MapCamera; selected:readonly Country[]; layers:LayerState
  populations:CountryPopulations; populationScope:string|null
  bubbles?:readonly MapBubble[]
  onCollectBubble?:(bubble:MapBubble)=>void
  pick:(pos:Location)=>void; showGlobal:()=>void
}

class GraphicsBoundary extends Component<{children:ReactNode; fail:()=>void},{failed:boolean}> {
  state={failed:false}
  static getDerivedStateFromError() { return {failed:true} }
  componentDidCatch() {this.props.fail()}
  render() {return this.state.failed ? null : this.props.children}
}
function Wake({setWake}:{setWake:(callback:()=>void)=>void}) {
  const invalidate=useThree(s=>s.invalidate)
  useLayoutEffect(()=>{setWake(invalidate); return ()=>setWake(()=>{})},[invalidate,setWake])
  return null
}
function ScreenGrid() {
  const ref = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({width:0, height:0})
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const measure = () => {
      const width = element.clientWidth, height = element.clientHeight
      setSize(old => old.width === width && old.height === height ? old : {width, height})
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const cx = size.width * 0.508
  const cy = size.height * 0.462
  const rx = size.width * 0.41 * 1.75
  const ry = size.height * 0.353 * 1.75
  return <svg ref={ref} className="screen-grid" viewBox={size.width ? `0 0 ${size.width} ${size.height}` : undefined} aria-hidden="true">
    <defs>
      <pattern id="screen-slots" width="25" height="4.5" patternUnits="userSpaceOnUse">
        <rect width="25" height="4.5" fill="white"/>
        <rect x=".65" y=".42" width="23.7" height="3.66" rx=".65" fill="black"/>
      </pattern>
      <mask id="screen-grille" maskUnits="userSpaceOnUse" x="0" y="0" width={size.width} height={size.height}>
        <rect width={size.width} height={size.height} fill="url(#screen-slots)"/>
      </mask>
      <radialGradient id="grid-clear" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="1" gradientTransform={`translate(${cx} ${cy}) scale(${rx} ${ry})`}>
        <stop offset="0" stopColor="#fff" stopOpacity=".3"/>
        <stop offset=".4" stopColor="#fff" stopOpacity=".3"/>
        <stop offset=".72" stopColor="#fff" stopOpacity=".58"/>
        <stop offset="1" stopColor="#fff"/>
      </radialGradient>
      <mask id="grid-falloff" maskUnits="userSpaceOnUse" x="0" y="0" width={size.width} height={size.height}>
        <rect width={size.width} height={size.height} fill="url(#grid-clear)"/>
      </mask>
    </defs>
    {size.width > 0 && <g mask="url(#grid-falloff)">
      <rect width={size.width} height={size.height} style={{ fill: "var(--map-grid-fill)", opacity: "var(--map-grid-opacity)" }} mask="url(#screen-grille)"/>
    </g>}
  </svg>
}
function FlatMap({atlas,selected,rig,project,layers,populations,populationScope}:{atlas:Atlas;selected:readonly Country[];rig:MapCamera;project:(t:number)=>void;
  layers:LayerState;populations:CountryPopulations;populationScope:string|null}) {
  const { ui } = useLanguage()
  const { night, reduced } = layers
  const svg=useRef<SVGSVGElement>(null)
  useLayoutEffect(()=>{
    rig.setFlat(true)
    let frame=0, last=performance.now()
    let previousView = ""
    const draw=(now:number)=>{
      const node=svg.current
      if (!node) return
      if (!node.clientWidth || !node.clientHeight) {frame=requestAnimationFrame(draw);return}
      const dt = Math.min((now-last)/1000,.12); last=now
      if (document.hidden) { frame=requestAnimationFrame(draw); return }
      rig.resize(node.clientWidth,node.clientHeight)
      rig.step(dt,reduced)
      const nw=rig.screen(-180,90,0)
      // Use an unwrapped span even when the antimeridian crosses the view.
      const h=Math.abs(rig.screen(0,-90,0).y-nw.y), w=h*2/Y_SCALE
      const cx=rig.width/2-(rig.current.lon/360+.5)*w
      const view = `${-cx/w*360} ${-nw.y/h*180} ${rig.width/w*360} ${rig.height/h*180}`
      if (view !== previousView) node.setAttribute("viewBox",view)
      previousView = view
      project(0)
      frame=requestAnimationFrame(draw)
    }
    frame=requestAnimationFrame(draw)
    return ()=>cancelAnimationFrame(frame)
  },[rig,project,reduced])
  return <svg ref={svg} className="flat-map" preserveAspectRatio="none" role="img" aria-label={ui.flatMap}>
    <defs><g id="flat-world"><image href={surfaceUrl} width="360" height="180" style={night ? {filter:"brightness(.45) saturate(.75)"} : undefined}/>
      {night && <image href={nightLightsUrl} width="360" height="180"/>}
      {atlas.countries.map(c => {
        const isSelected = selected.includes(c)
        const fill = populationScope !== null ? flatCountryFill(populations[c.id]) : null
        return <path key={c.id} d={c.d} fill={fill ? fill.color : "none"} fillOpacity={fill ? fill.opacity : undefined}
          stroke={isSelected ? (night ? "#d6f2f6" : "#f6f8e6") : (night ? "#567c84" : "#bdd1b7")}
          strokeWidth={isSelected ? .19 : (night ? .075 : .065)} fillRule="evenodd"/>
      })}
    </g></defs>{[-360,0,360].map(x=><use key={x} x={x} href="#flat-world"/>)}
  </svg>
}

const cursorShape = "M0 0 7.2 14 0 10.2-7.2 14Z"
const cursors = [
  { start: [-1.19, 51.86], end: [2.19, 48.59], phase: .12, seconds: 9 },
  { start: [2.19, 48.59], end: [6.36, 50.92], phase: .58, seconds: 8 },
  { start: [2.12, 41.39], end: [11.34, 44.52], phase: .33, seconds: 11 },
] as const

const cubeRx = 12.6
const cubeRy = 6.8
const cubeH = 6.0
const cubeTiers = [0.2, -7.6] as const

function ComputeGlyph() {
  const rx = cubeRx, ry = cubeRy, h = cubeH
  const topY = cubeTiers[cubeTiers.length - 1]
  return <g className="compute-cube">
    {cubeTiers.map(y => {
      const top = `M0 ${y - ry} L${rx} ${y} L0 ${y + ry} L${-rx} ${y} Z`
      const left = `M${-rx} ${y} L0 ${y + ry} L0 ${y + ry + h} L${-rx} ${y + h} Z`
      const right = `M${rx} ${y} L0 ${y + ry} L0 ${y + ry + h} L${rx} ${y + h} Z`
      const outline = `M0 ${y - ry} L${rx} ${y} V${y + h} L0 ${y + ry + h} L${-rx} ${y + h} V${y} Z`
      return <g key={y}>
        <path d={left} fill="url(#cube-left)"/>
        <path d={right} fill="url(#cube-right)"/>
        <path d={top} fill="url(#cube-top)"/>
        <path d={outline} fill="none" stroke="var(--map-cube-edge)" strokeWidth=".7" strokeLinejoin="round"/>
      </g>
    })}
    <path d={`M0 ${topY - 2.2} L3.2 ${topY} L0 ${topY + 2.2} L-3.2 ${topY} Z`} fill="var(--map-cube-core)"/>
  </g>
}

const emptyBubbles: readonly MapBubble[] = []

export default function MapViewport({atlas,rig,selected,layers,populations,populationScope,bubbles = emptyBubbles,onCollectBubble,pick,showGlobal}:Props) {
  const language = useLanguage()
  const { ui, locale, number, percent } = language
  const host=useRef<HTMLDivElement>(null), overlay=useRef<SVGSVGElement>(null), cursorOverlay=useRef<SVGSVGElement>(null), bubbleOverlay=useRef<SVGSVGElement>(null)
  const placedView=useRef("")
  const marks=useRef<(SVGGElement|null)[]>([])
  const cursorMarks=useRef<(SVGGElement|null)[]>([])
  const bubbleMarks=useRef<Record<string, SVGGElement|null>>({})
  const [popups, setPopups] = useState<readonly { id: string; text: string; kind: MapBubble["kind"]; x: number; y: number }[]>([])
  const islands=useMemo(()=>atlas.countries.flatMap(country=>country.islandGroup ? [{country,...country.islandGroup}] : []),[atlas])
  const islandMarks=useRef<(SVGGElement|null)[]>([])
  const [failed,setFailed]=useState(false), [ready,setReady]=useState(false)
  const [lost,setLost]=useState(false)
  const wake=useRef<()=>void>(()=>{})
  const setWake=useCallback((fn:()=>void)=>{wake.current=fn},[])
  const select=useRef(pick); select.current=pick
  const onReady=useCallback(()=>setReady(true),[])
  const onFail=useCallback(()=>setFailed(true),[])
  const baseAltitudes=useMemo(()=>computePlaces.map(p=>relief(atlas.metres(p.lon,p.lat))),[atlas])
  const altitudes=useMemo(()=>computePlaces.map((p,i)=>{
    if (populationScope === null) return baseAltitudes[i] + .18
    const entry = populations[p.country]
    const active = entry !== undefined && Object.values(entry.factions).some(c => c && c.immersed + c.synthetic > 0)
    return active ? .14 : baseAltitudes[i] * .26 + .16
  }),[baseAltitudes, populationScope, populations])
  const bubbleCoords=useMemo(()=>bubbles.map(bubble=>{
    const country = atlas.countryById.get(bubble.countryId)
    const lon = country?.lon ?? 0
    const lat = country?.lat ?? 0
    return { bubble, lon, lat, z: relief(atlas.metres(lon, lat)) + .55 }
  }),[atlas, bubbles])
  const bubbleKey = useMemo(() => bubbles.map(b => b.id).join(","), [bubbles])
  const project=useCallback((time:number)=>{
    const w=rig.width,h=rig.height
    const view=`0 0 ${w} ${h}`
    const size=Math.max(.43,Math.min(1.15,hudScale(w,h)))*(1+.16*rig.current.zoom)
    function place(el:SVGGElement|null|undefined,lon:number,lat:number,z:number,angle=0,scale=size) {
      if (!el) return
      const point=rig.screen(lon,lat,z)
      const visible=point.visible && point.x>-25 && point.x<w+25 && point.y>-25 && point.y<h+25
      const display=visible ? "" : "none"
      if (el.style.display !== display) el.style.display=display
      if (!visible) return
      const transform=`translate(${point.x.toFixed(2)} ${point.y.toFixed(2)}) scale(${scale}) rotate(${angle})`
      if (el.getAttribute("transform") !== transform) el.setAttribute("transform",transform)
    }
    if (cursorOverlay.current) {
      if (cursorOverlay.current.getAttribute("viewBox") !== view) cursorOverlay.current.setAttribute("viewBox",view)
      cursors.forEach((route,i)=>{
        const along=((time/route.seconds)+route.phase)%1
        const lon=route.start[0]+(route.end[0]-route.start[0])*along
        const lat=route.start[1]+(route.end[1]-route.start[1])*along
        const end=rig.screen(route.end[0],route.end[1],.4)
        const start=rig.screen(route.start[0],route.start[1],.4)
        const angle=Math.atan2(end.y-start.y,end.x-start.x)*180/Math.PI+90
        place(cursorMarks.current[i],lon,lat,.5,angle,size*1.55)
      })
    }
    const pose=`${view}|${rig.flat?1:0}|${populationScope??""}|${bubbleKey}|${rig.current.lon.toFixed(4)}|${rig.current.lat.toFixed(4)}|${rig.current.zoom.toFixed(4)}`
    if (!overlay.current || pose === placedView.current) return
    placedView.current=pose
    overlay.current.setAttribute("viewBox",view)
    computePlaces.forEach((p,i)=>place(marks.current[i],p.lon,p.lat,altitudes[i]))
    islands.forEach((island,i)=>place(islandMarks.current[i],island.lon,island.lat,.06))
    if (bubbleOverlay.current) {
      bubbleOverlay.current.setAttribute("viewBox",view)
      bubbleCoords.forEach(({ bubble, lon, lat, z }) => place(bubbleMarks.current[bubble.id], lon, lat, z, 0, Math.max(.75, size * 1.15)))
    }
  },[altitudes,bubbleCoords,bubbleKey,islands,populationScope,rig])

  function handleBubbleClick(bubble: MapBubble, lon: number, lat: number, z: number) {
    if (!onCollectBubble) return
    const pt = rig.screen(lon, lat, z)
    const text = bubble.kind === "traffic"
      ? `+${formatCompactTokens(bubble.value, locale, number)} token`
      : bubble.kind === "corpus"
        ? ui.ops.bubbles.corpusShort(bubble.value)
        : `−${percent.format(bubble.value / 10000)} / −${percent.format(standardScenario.rules.bubbles.alertHumanReliefBps / 10000)}`
    const popupId = `${bubble.id}:${Date.now()}`
    setPopups(prev => [...prev.slice(-4), { id: popupId, text, kind: bubble.kind, x: pt.x, y: pt.y }])
    window.setTimeout(() => setPopups(prev => prev.filter(item => item.id !== popupId)), 1150)
    onCollectBubble(bubble)
  }
  useEffect(()=>{
    const el=host.current!
    const detach=attachNavigation(el,rig,atlas,(location,point)=>{
      let distance=Math.max(12,hudScale(rig.width,rig.height)*38), nearest=-1
      computePlaces.forEach((site,i)=>{
        const screen=rig.screen(site.lon,site.lat,altitudes[i])
        const dist=Math.hypot(screen.x-point.x,screen.y-point.y)
        if(screen.visible && dist<=distance) {distance=dist;nearest=i}
      })
      if(nearest<0) {select.current(location);return}
      const site=computePlaces[nearest]
      select.current({...atlas.locate(site.lon,site.lat),siteId:site.id})
    },showGlobal)
    const signal=()=>wake.current()
    const lost=(e:Event)=>{e.preventDefault();setLost(true)}
    const restored=()=>{rig.setFlat(false);setLost(false);wake.current()}
    const events=["wheel","pointerdown","pointermove","pointerup","keydown"]
    for (const e of events) el.addEventListener(e,signal)
    el.addEventListener("webglcontextlost",lost,true)
    el.addEventListener("webglcontextrestored",restored,true)
    return ()=>{detach();for(const e of events) el.removeEventListener(e,signal)
      el.removeEventListener("webglcontextlost",lost,true);el.removeEventListener("webglcontextrestored",restored,true)}
  },[atlas,rig,altitudes,showGlobal])
  useEffect(()=>{wake.current()})
  return <div className="map-viewport" ref={host} tabIndex={0} role="region" aria-label={ui.interactiveMap}>
    {!failed && <GraphicsBoundary fail={onFail}><Canvas frameloop="demand" flat linear dpr={[1,1.5]} resize={{offsetSize:true}}
      gl={{antialias:true,alpha:false,powerPreference:"high-performance"}} camera={rig.camera}>
      <Wake setWake={setWake}/>
      <Suspense fallback={null}><TerrainScene terrainLabel={ui.terrain} atlas={atlas} rig={rig} selected={selected} layers={layers}
        populations={populations} populationScope={populationScope} project={project} onReady={onReady}/></Suspense>
    </Canvas></GraphicsBoundary>}
    {(failed || lost) && <FlatMap atlas={atlas} selected={selected} rig={rig} project={project} layers={layers} populations={populations} populationScope={populationScope}/>}
    {layers.night && <div className="map-vignette" />}
    <ScreenGrid/>
    {!ready && !failed && !rig.flat && <span className="map-loading" role="status">{ui.buildingTerrain}</span>}
    <svg ref={overlay} className="geo-marks" aria-label={ui.computeSites}>
      <defs>
        <linearGradient id="cube-top" x1="0" y1="0" x2="1" y2="1">
          <stop style={{ stopColor: "var(--map-cube-top-0)" }} stopOpacity=".9"/>
          <stop offset="1" style={{ stopColor: "var(--map-cube-top-1)" }} stopOpacity=".46"/>
        </linearGradient>
        <linearGradient id="cube-left" x1="0" y1="0" x2="0" y2="1">
          <stop style={{ stopColor: "var(--map-cube-left-0)" }} stopOpacity=".66"/>
          <stop offset="1" style={{ stopColor: "var(--map-cube-left-1)" }} stopOpacity=".72"/>
        </linearGradient>
        <linearGradient id="cube-right" x1="0" y1="0" x2="1" y2="1">
          <stop style={{ stopColor: "var(--map-cube-right-0)" }} stopOpacity=".62"/>
          <stop offset="1" style={{ stopColor: "var(--map-cube-right-1)" }} stopOpacity=".72"/>
        </linearGradient>
      </defs>
      {computePlaces.map((p,i)=><g key={p.id} ref={el=>{marks.current[i]=el}}>
        <ComputeGlyph/>
        <title>{computePlaceLabel(p, language)}</title>
      </g>)}
      {islands.map(({country,id,lon,lat},i)=>{
        const label = `${ui.spratly} · ${countryName(country, locale)}`
        const choose=()=>pick({country,lon,lat,islandId:id})
        return <g key={id} ref={el=>{islandMarks.current[i]=el}} className="island-mark" style={{display:"none"}}
          role="button" aria-label={label} tabIndex={0} onClick={choose}
          onKeyDown={e=>{if(e.key==="Enter" || e.key===" ") {e.preventDefault();choose()}}}>
          <title>{label}</title>
          <circle r="13" fill="transparent"/>
          <path d="M0-5 5 0 0 5-5 0Z" stroke="var(--map-island-stroke)" strokeWidth="1.4" fill={selected.includes(country) ? "var(--map-island-selected)" : "var(--map-island-fill)"}/>
        </g>
      })}
    </svg>
    <svg ref={cursorOverlay} className="geo-marks" aria-hidden="true">
      <defs>
        <filter id="cursor-glow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="1.7"/></filter>
      </defs>
      {cursors.map((_,i)=><g key={i} ref={el=>{cursorMarks.current[i]=el}}>
        <g filter="url(#cursor-glow)">
          <path d={cursorShape} fill="var(--map-cursor)"/>
          <circle cx="0" cy="26" r="5.6" fill="var(--map-cursor)"/>
        </g>
        <path d={cursorShape} fill="var(--map-cursor)" stroke="var(--map-cursor-stroke)" strokeWidth=".7" strokeLinejoin="round"/>
        <g>
          <circle cx="0" cy="26" r="5.6" fill="var(--map-cursor)" stroke="var(--map-cursor-stroke)" strokeWidth=".7"/>
          <rect x="-2.45" y="23.7" width="1.45" height="3.1" rx=".7" fill="var(--map-cursor-stroke)"/>
          <rect x="1" y="23.7" width="1.45" height="3.1" rx=".7" fill="var(--map-cursor-stroke)"/>
        </g>
      </g>)}
    </svg>
    <svg ref={bubbleOverlay} className="geo-marks map-bubbles-layer" aria-label={ui.action}>
      {bubbleCoords.map(({ bubble, lon, lat, z }) => {
        const title = bubble.kind === "traffic"
          ? ui.ops.bubbles.traffic(formatCompactTokens(bubble.value, locale, number))
          : bubble.kind === "corpus"
            ? ui.ops.bubbles.corpus(bubble.value)
            : ui.ops.bubbles.alert(percent.format(bubble.value / 10000), percent.format(standardScenario.rules.bubbles.alertHumanReliefBps / 10000))
        const shortText = bubble.kind === "traffic"
          ? ui.ops.bubbles.trafficShort(formatCompactTokens(bubble.value, locale, number))
          : bubble.kind === "corpus"
            ? ui.ops.bubbles.corpusShort(bubble.value)
            : ui.ops.bubbles.alertShort
        return <g
          key={bubble.id}
          ref={el => { bubbleMarks.current[bubble.id] = el }}
          className={`map-bubble is-${bubble.kind}`}
          style={{ display: "none" }}
          role="button"
          tabIndex={0}
          aria-label={title}
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); handleBubbleClick(bubble, lon, lat, z) }}
          onKeyDown={e => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault()
              e.stopPropagation()
              handleBubbleClick(bubble, lon, lat, z)
            }
          }}
        >
          <title>{title}</title>
          <circle className="bubble-halo" r="24"/>
          <circle className="bubble-core" r="18"/>
          {bubble.kind === "traffic" && <path className="bubble-glyph" d="M2-9L-6 1h5l-3 8 8-10h-5z"/>}
          {bubble.kind === "corpus" && <path className="bubble-glyph" d="M-3-8h6v4l5 9a2 2 0 0 1-1.7 3H-6.3A2 2 0 0 1-8 5l5-9z"/>}
          {bubble.kind === "alert" && <path className="bubble-glyph" d="M0-9 8-5v6c0 5-3.4 8.5-8 10-4.6-1.5-8-5-8-10v-6z"/>}
          <text className="bubble-tag" y="30" textAnchor="middle">{shortText}</text>
        </g>
      })}
    </svg>
    {popups.map(popup => (
      <span key={popup.id} className={`bubble-popup is-${popup.kind}`} style={{ left: popup.x, top: popup.y }} aria-hidden="true">
        {popup.text}
      </span>
    ))}
  </div>
}
