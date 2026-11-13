import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { Atlas, loadAtlas, type Location } from "./cartography/atlas"
import { EUROPE, GLOBAL, MapCamera } from "./cartography/camera"
import Hud, { headline, type Panel } from "./cartography/Hud"
const MapViewport = lazy(()=>import("./cartography/MapViewport"))

function Dialog({panel,close,children}:{panel:Panel;close:()=>void;children?:ReactNode}) {
  const ref=useRef<HTMLDialogElement>(null)
  useEffect(()=>{
    const element=ref.current!
    const previous=document.activeElement
    element.showModal()
    return ()=>{element.close(); if(previous instanceof HTMLElement || previous instanceof SVGElement) previous.focus({preventScroll:true})}
  },[])
  const titles={world:"世界",region:"地区资料",disease:"疾病概况",menu:"菜单",news:headline}
  return <dialog className={panel==="news" ? "event-dialog" : "info-dialog"} ref={ref}
    aria-labelledby="window-title" onCancel={e=>{e.preventDefault();close()}}>
    {panel==="news" ? <section className="event-body">
      <div className="event-icon"><svg viewBox="0 0 64 64" aria-hidden="true"><use href="#bio"/></svg></div>
      <div className="event-copy"><h2 id="window-title">{headline}</h2><p>PAX-12 已经感染了第一个人类。西非出现首例报告，世界地图和地区档案已更新。</p></div>
      <button onClick={close} autoFocus>OK</button>
    </section> : <section className="window-body">
      <header><h2 id="window-title">{titles[panel]}</h2><button className="close" aria-label="关闭" autoFocus onClick={close}>×</button></header>
      {children}
    </section>}
  </dialog>
}
function Reading({atlas,place}:{atlas:Atlas;place:Location}) {
  function format(layer:"sea"|"air") {
    const v={x:0,y:0}
    if (!atlas.vector(place.lon,place.lat,layer,v)) return atlas.isLand(place.lon,place.lat) ? "陆地" : "无观测值"
    const speed=Math.hypot(v.x,v.y)
    if (speed<.005) return "0.00 m/s"
    const bearing=(Math.atan2(v.x,v.y)*180/Math.PI+360)%360
    return `${speed.toFixed(2)} m/s · 流向 ${Math.round(bearing)%360}°`
  }
  return <dl className="readings">
    {place.islandName && <div><dt>群岛</dt><dd>{place.islandName}</dd></div>}
    {place.site && <div><dt>交通节点</dt><dd>{place.site}</dd></div>}
    <div><dt>坐标</dt><dd>{Math.abs(place.lat).toFixed(2)}°{place.lat>=0 ? "N" : "S"} &nbsp; {Math.abs(place.lon).toFixed(2)}°{place.lon>=0 ? "E" : "W"}</dd></div>
    <div><dt>地形高度</dt><dd>{Math.round(atlas.metres(place.lon,place.lat)).toLocaleString("zh-CN")} m</dd></div>
    <div><dt>850 hPa 风</dt><dd>{format("air")}</dd></div>
    <div><dt>表层洋流</dt><dd>{format("sea")}</dd></div>
  </dl>
}
export default function App() {
  const [atlas,setAtlas]=useState<Atlas|null>(null), [error,setError]=useState(""), [attempt,setAttempt]=useState(0)
  const [location,setLocation]=useState<Location|null>(null), [panel,setPanel]=useState<Panel|null>(null)
  const [zoom,setZoom]=useState(EUROPE.zoom), [speed,setSpeed]=useState(1)
  const [rig]=useState(()=>new MapCamera(setZoom))
  const [cloud,setCloud]=useState(true), [current,setCurrent]=useState(true)
  const [reduced,setReduced]=useState(()=>matchMedia("(prefers-reduced-motion: reduce)").matches)
  const [full,setFull]=useState(Boolean(document.fullscreenElement)),[screenError,setScreenError]=useState("")
  useEffect(()=>{
    let active=true
    setError("")
    loadAtlas().then(map=>{
      if (!active) return
      setAtlas(map); setLocation(map.locate(31.2,49.1))
    }).catch(e=>{if(active)setError(String(e))})
    return ()=>{active=false}
  },[attempt])
  useEffect(()=>{
    const media=matchMedia("(prefers-reduced-motion: reduce)")
    const update=()=>setReduced(media.matches), screen=()=>setFull(Boolean(document.fullscreenElement))
    media.addEventListener("change",update);document.addEventListener("fullscreenchange",screen)
    return ()=>{media.removeEventListener("change",update);document.removeEventListener("fullscreenchange",screen)}
  },[])
  const open=useCallback((p:Panel)=>setPanel(p),[])
  function preset(name:"global"|"europe") {
    rig.go(name==="global" ? GLOBAL : EUROPE)
    setLocation(name==="global" ? null : atlas?.locate(31.2,49.1) ?? null)
    setPanel(null)
  }
  async function fullscreen() {
    try {if(document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen()}
    catch {setScreenError("此窗口无法进入全屏。")}
  }
  const layers={cloud,current,speed,reduced}
  return <main className="game" aria-label="世界地图">
    {atlas ? <Suspense fallback={<span className="map-loading" role="status">正在载入地图…</span>}>
      <MapViewport atlas={atlas} rig={rig} selected={location?.country} layers={layers} pick={setLocation} showNews={()=>open("news")}/>
    </Suspense> : <div className="map-loading" role="status">{error ? <>地图读取失败 <button onClick={()=>setAttempt(n=>n+1)}>重试</button></> : "正在读取地形与海气数据…"}</div>}
    <Hud location={location} zoom={zoom} speed={speed} setSpeed={setSpeed} open={open} setZoom={v=>rig.zoom(v)}/>
    {panel && <Dialog panel={panel} close={()=>setPanel(null)}>
      {panel==="world" && <>
        <fieldset><legend>环境图层</legend>
          <label><input type="checkbox" checked={cloud} onChange={e=>setCloud(e.target.checked)}/> 大气云层</label>
          <label><input type="checkbox" checked={current} onChange={e=>setCurrent(e.target.checked)}/> 表层洋流</label>
        </fieldset>
        <p className="source-note">十一月气候态 · NOAA 风场与全球漂流浮标</p>
        <div className="window-actions"><button onClick={()=>preset("global")}>全球总览</button><button onClick={()=>preset("europe")}>欧洲近景</button></div>
        <a href="/map-credits.html" target="_blank" rel="noreferrer">地图数据与署名 ↗</a>
      </>}
      {panel==="region" && atlas && <>
        <h3>{location?.country?.name ?? (location ? "海域" : "世界概况")}</h3>
        {location ? <Reading atlas={atlas} place={location}/> : <p>点选陆地或海面可读取当地的高度、风速及流速。</p>}
        <label className="country-list">定位地区<select value={location?.country?.id ?? ""} onChange={e=>{
          const c=atlas.countries.find(c=>c.id===e.target.value)
          if(c) {setLocation({country:c,lon:c.lon,lat:c.lat});rig.go({lon:c.lon,lat:c.lat,zoom:.65});setPanel(null)}
        }}><option value="">选择地区</option>{[...atlas.countries].sort((a,b)=>a.name.localeCompare(b.name,"zh-CN")).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      </>}
      {panel==="disease" && <dl className="readings"><div><dt>名称</dt><dd>PAX-12</dd></div><div><dt>DNA 点数</dt><dd>1</dd></div><div><dt>受感染</dt><dd>1</dd></div><div><dt>死亡</dt><dd>0</dd></div></dl>}
      {panel==="menu" && <><div className="window-actions">
        <button onClick={()=>preset("global")}>全球总览</button><button onClick={()=>preset("europe")}>欧洲近景</button>
        {document.fullscreenEnabled && <button onClick={fullscreen}>{full ? "退出全屏" : "进入全屏"}</button>}
      </div><p className="source-note">拖动平移 · 滚轮或双指缩放 · Home 返回全球</p>{screenError && <p role="status">{screenError}</p>}</>}
    </Dialog>}
  </main>
}
