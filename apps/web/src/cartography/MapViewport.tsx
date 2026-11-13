import { Component, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Canvas, useThree } from "@react-three/fiber"
import { Atlas, relief, surfaceUrl, type Country, type Location } from "./atlas"
import { attachNavigation, MapCamera } from "./camera"
import { hudScale, Y_SCALE } from "./layout"
import TerrainScene, { type LayerState } from "./TerrainScene"
import { journeys, sites } from "./traffic"

type Props = {atlas:Atlas; rig:MapCamera; selected?:Country|null; layers:LayerState; pick:(pos:Location)=>void; marker?:{lon:number;lat:number;label:string}; showNews:()=>void}
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
function FlatMap({atlas,selected,rig,project,reduced}:{atlas:Atlas;selected?:Country|null;rig:MapCamera;project:(t:number)=>void;reduced:boolean}) {
  const svg=useRef<SVGSVGElement>(null)
  useLayoutEffect(()=>{
    rig.setFlat(true)
    let frame=0, last=performance.now()
    const draw=(now:number)=>{
      const node=svg.current
      if (!node) return
      if (!node.clientWidth || !node.clientHeight) {frame=requestAnimationFrame(draw);return}
      rig.resize(node.clientWidth,node.clientHeight)
      rig.step((now-last)/1000,reduced); last=now
      const nw=rig.screen(-180,90,0)
      // Use an unwrapped span even when the antimeridian crosses the view.
      const h=Math.abs(rig.screen(0,-90,0).y-nw.y), w=h*2/Y_SCALE
      const cx=rig.width/2-(rig.current.lon/360+.5)*w
      node.setAttribute("viewBox",`${-cx/w*360} ${-nw.y/h*180} ${rig.width/w*360} ${rig.height/h*180}`)
      project(0)
      frame=requestAnimationFrame(draw)
    }
    frame=requestAnimationFrame(draw)
    return ()=>cancelAnimationFrame(frame)
  },[rig,project,reduced])
  return <svg ref={svg} className="flat-map" preserveAspectRatio="none" role="img" aria-label="二维矢量世界地图">
    <defs><g id="flat-world"><image href={surfaceUrl} width="360" height="180"/>
      {atlas.countries.map(c=><path key={c.id} d={c.d} fill={selected?.id===c.id ? "#f8ffc12b" : "none"}
        stroke={selected?.id===c.id ? "#ffffe4" : "#bdd1b7"} strokeWidth={selected?.id===c.id ? .19 : .065} fillRule="evenodd"/>)}
    </g></defs>{[-360,0,360].map(x=><use key={x} x={x} href="#flat-world"/>)}
  </svg>
}

export default function MapViewport({atlas,rig,selected,layers,pick,marker,showNews}:Props) {
  const host=useRef<HTMLDivElement>(null), overlay=useRef<SVGSVGElement>(null)
  const marks=useRef<(SVGGElement|null)[]>([]), vehicles=useRef<(SVGGElement|null)[]>([])
  const islands=useMemo(()=>atlas.countries.flatMap(country=>country.islandGroup ? [{country,...country.islandGroup}] : []),[atlas])
  const islandMarks=useRef<(SVGGElement|null)[]>([])
  const eventPin=useRef<SVGGElement>(null)
  const [failed,setFailed]=useState(false), [ready,setReady]=useState(false)
  const [lost,setLost]=useState(false)
  const wake=useRef<()=>void>(()=>{})
  const setWake=useCallback((fn:()=>void)=>{wake.current=fn},[])
  const select=useRef(pick); select.current=pick
  const onReady=useCallback(()=>setReady(true),[])
  const onFail=useCallback(()=>setFailed(true),[])
  const altitudes=useMemo(()=>sites.map(p=>relief(atlas.metres(p.lon,p.lat))+.18),[atlas])
  const project=useCallback((t:number)=>{
    if (!overlay.current) return
    const w=rig.width,h=rig.height
    overlay.current.setAttribute("viewBox",`0 0 ${w} ${h}`)
    const size=Math.max(.43,Math.min(1.15,hudScale(w,h)))*(1+.16*rig.current.zoom)
    function place(el:SVGGElement|null|undefined,lon:number,lat:number,z:number,angle=0,scale=size) {
      if (!el) return
      const point=rig.screen(lon,lat,z)
      const visible=point.visible && point.x>-25 && point.x<w+25 && point.y>-25 && point.y<h+25
      el.style.display=visible ? "" : "none"
      if(visible) el.setAttribute("transform",`translate(${point.x.toFixed(2)} ${point.y.toFixed(2)}) scale(${scale}) rotate(${angle})`)
    }
    sites.forEach((p,i)=>place(marks.current[i],p.lon,p.lat,altitudes[i]))
    islands.forEach((island,i)=>place(islandMarks.current[i],island.lon,island.lat,.06))
    if(eventPin.current && marker) {
      if (rig.current.zoom<.17) place(eventPin.current,marker.lon,marker.lat,.30)
      else eventPin.current.style.display="none"
    }
    journeys.forEach((route,i)=>{
      const fraction=(route.phase+t/(route.kind==="ship" ? 220 : 105))%1
      const lon=route.start[0]+(route.end[0]-route.start[0])*fraction
      const lat=route.start[1]+(route.end[1]-route.start[1])*fraction
      const end=rig.screen(route.end[0],route.end[1],0), start=rig.screen(route.start[0],route.start[1],0)
      const angle=Math.atan2(end.y-start.y,end.x-start.x)*180/Math.PI+(route.kind==="plane" ? 90 : 0)
      place(vehicles.current[i],lon,lat,route.kind==="plane" ? 2.7 : .08,angle,size*(.25+rig.current.zoom*1.48))
    })
  },[altitudes,islands,marker,rig])
  useEffect(()=>{
    const el=host.current!
    const detach=attachNavigation(el,rig,atlas,(location,point)=>{
      let distance=Math.max(5,hudScale(rig.width,rig.height)*14), nearest=-1
      sites.forEach((site,i)=>{
        const screen=rig.screen(site.lon,site.lat,altitudes[i])
        const dist=Math.hypot(screen.x-point.x,screen.y-point.y)
        if(screen.visible && dist<distance) {distance=dist;nearest=i}
      })
      if(nearest<0) {select.current(location);return}
      const site=sites[nearest]
      select.current({...atlas.locate(site.lon,site.lat),site:`${site.kind==="plane" ? "机场" : "港口"} · ${site.id}`})
    })
    const signal=()=>wake.current()
    const lost=(e:Event)=>{e.preventDefault();setLost(true)}
    const restored=()=>{rig.setFlat(false);setLost(false);wake.current()}
    const events=["wheel","pointerdown","pointermove","pointerup","keydown"]
    for (const e of events) el.addEventListener(e,signal)
    el.addEventListener("webglcontextlost",lost,true)
    el.addEventListener("webglcontextrestored",restored,true)
    return ()=>{detach();for(const e of events) el.removeEventListener(e,signal)
      el.removeEventListener("webglcontextlost",lost,true);el.removeEventListener("webglcontextrestored",restored,true)}
  },[atlas,rig,altitudes])
  useEffect(()=>{wake.current()})
  return <div className="map-viewport" ref={host} tabIndex={0} role="region" aria-label="互动世界地图，方向键平移，加减键缩放，Home 返回全球">
    {!failed && <GraphicsBoundary fail={onFail}><Canvas frameloop="demand" flat linear dpr={[1,1.5]} resize={{offsetSize:true}}
      gl={{antialias:true,alpha:false,powerPreference:"high-performance"}} camera={rig.camera}>
      <Wake setWake={setWake}/>
      <Suspense fallback={null}><TerrainScene atlas={atlas} rig={rig} selected={selected} layers={layers} project={project} onReady={onReady}/></Suspense>
    </Canvas></GraphicsBoundary>}
    {(failed || lost) && <FlatMap atlas={atlas} selected={selected} rig={rig} project={project} reduced={layers.reduced}/>}
    {!ready && !failed && !rig.flat && <span className="map-loading" role="status">正在建立地形…</span>}
    <svg ref={overlay} className="geo-marks" aria-label="交通与事件标记">
      <defs><radialGradient id="event-red" cx=".38" cy=".30" r=".78"><stop stopColor="#dd3045"/><stop offset=".43" stopColor="#92172a"/><stop offset="1" stopColor="#290510"/></radialGradient></defs>
      {sites.map((p,i)=><g key={p.id} ref={el=>{marks.current[i]=el}}>
        <rect x="-11.5" y="-11.5" width="23" height="23" rx="2.5" fill="#102931" fillOpacity=".86" stroke="#b9d5d2" strokeWidth=".9"/>
        <use href={`#${p.kind}`} x="-9.8" y="-9.8" width="19.6" height="19.6"/>
      </g>)}
      {islands.map(({country,name,lon,lat},i)=>{
        const choose=()=>pick({country,lon,lat,islandName:name})
        return <g key={name} ref={el=>{islandMarks.current[i]=el}} className="island-mark" style={{display:"none"}}
          role="button" aria-label={`${name} · ${country.name}`} tabIndex={0} onClick={choose}
          onKeyDown={e=>{if(e.key==="Enter" || e.key===" ") {e.preventDefault();choose()}}}>
          <title>{name} · {country.name}</title>
          <circle r="13" fill="transparent"/>
          <path d="M0-5 5 0 0 5-5 0Z" stroke="#e6eee0" strokeWidth="1.4" fill={selected?.id===country.id ? "#e8f1b7" : "#426057"}/>
        </g>
      })}
      {journeys.map((r,i)=><g key={i} ref={el=>{vehicles.current[i]=el}}>
        {r.kind==="plane" && <use href="#plane" x="-29" y="-23" width="56" height="53" color="#21323b" opacity=".52" transform="translate(4 4)"/>}
        <use href={`#${r.kind}`} x={r.kind==="ship" ? -23 : -28} y={r.kind==="ship" ? -8 : -26} width={r.kind==="ship" ? 46 : 56} height={r.kind==="ship" ? 16 : 53}/>
      </g>)}
      {marker && <g ref={eventPin} style={{display:"none",pointerEvents:"auto",cursor:"pointer"}} role="button" aria-label={marker.label} tabIndex={0}
        onPointerDown={e=>e.stopPropagation()} onPointerUp={e=>e.stopPropagation()}
        onClick={showNews} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();showNews()}}}>
        <title>{marker.label}</title>
        <path d="M-12-22 0 0l12-22" fill="#d6dad7" stroke="#263133" strokeWidth="2"/>
        <circle cy="-62" r="48" stroke="#d5d7c7" strokeWidth="4" fill="url(#event-red)"/>
        <use href="#bio" x="-37" y="-99" width="74" height="74" color="#fff3e4"/>
      </g>}
    </svg>
  </div>
}
