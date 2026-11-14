import { useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { Glyph, Symbols } from "./Symbols"
import { surfaceUrl, type Location } from "../../cartography/atlas"
import { HUD, hudScale } from "../../cartography/layout"
import kyiv from "../../cartography/data/kyiv.webp"
import type { MapPanel } from "../machine"
import type { HudContent } from "./hudContent"
type Props = {location:Location|null; content:HudContent; zoom:number; speed:number; night:boolean; toggleNight:()=>void; open:(p:MapPanel)=>void; setSpeed:(n:number)=>void; setZoom:(n:number)=>void}

function Control({label,run,children,pressed,description}:{label:string;run:()=>void;children:ReactNode;pressed?:boolean;description?:string}) {
  return <g className="svg-button" role="button" tabIndex={0} aria-label={label} aria-pressed={pressed} aria-description={description} onClick={run}
    onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();run()}}}>
    <title>{label}</title>{children}
  </g>
}
function Glass({d,accent=false}:{d:string;accent?:boolean}) {
  return <path d={d} fill="url(#hud-glass)" stroke={accent ? "#b7deed" : "url(#hud-edge)"} strokeWidth="1.8" strokeLinejoin="round"/>
}
function SideMeter({world,x,y,open,content}:{world?:boolean;x:number;y:number;open:(p:MapPanel)=>void;content:HudContent}) {
  const label=world ? "世界" : content.overview
  return <g transform={`translate(${x} ${y})`}>
    <Control label={label} run={()=>open(world ? "world" : "overview")}>
      <Glass d="M0 1H312L345 33V120H0Z"/>
      <path d="M2 54h141l14-14M2 72h43" fill="none" stroke="#bad5d6" strokeWidth="1.7"/>
      <path d="M245 6h64l30 28v13h-64l-30-29Z" fill={world ? "url(#hud-blue)" : "url(#hud-red)"} stroke="#d9fcff" strokeWidth="2.2"/>
      <path d="M250 9h59l26 25v8h-56l-29-27Z" fill="none" stroke="#ffffff68"/>
      <Glyph name={world ? "flask" : "hexes"} x={world ? 270 : 260} y={8} width={world ? 40 : 76} height={38}/>
      <text x="8" y="49" fontSize="32">{label}</text>
      <rect x="13" y="78" width="321" height="35" fill={world ? "#07334fcc" : "#350d18cc"} stroke={world ? "#67ddff" : "#d44762"} strokeWidth="2"/>
      <path d="M16 80h316" stroke="#ffffff65"/>
      <Glyph name={world ? "flask" : content.currencyIcon} x={21} y={78} size={34}/>
      <text x="75" y="108" fontSize="35" fontFamily="Arial,sans-serif">{world ? content.research : content.balance}</text>
    </Control>
  </g>
}

function RegionStrip({location,open,x,y,content}:{location:Location|null;open:(p:MapPanel)=>void;x:number;y:number;content:HudContent}) {
  const country=location?.country
  const name=country?.name ?? (location ? "海域" : "世界概况")
  const thumbnail = country?.id==="UKR" ? kyiv : surfaceUrl
  const outline = "M0 0H956l30 31v180H31L0 178Z"
  return <g transform={`translate(${x} ${y})`}>
    <path d="M-54 220V82l31-32H1038v170Z" fill="url(#hud-glass)" stroke="#61b9d1" strokeWidth="1.3"/>
    <g aria-hidden="true" pointerEvents="none">
      <Glass d={outline}/>
      <clipPath id="feed-clip"><path d="M7 7h170l26 25v172H30L7 181Z"/></clipPath>
      <svg x="7" y="7" width="198" height="198" viewBox="7 7 198 198" overflow="hidden" clipPath="url(#feed-clip)">
        {country?.id==="UKR" ? <image href={thumbnail} x="7" y="7" width="198" height="198" preserveAspectRatio="xMidYMid slice"/> :
          <svg x="7" y="7" width="198" height="198" preserveAspectRatio="xMidYMid slice"
            viewBox={location ? `${location.lon+154} ${69-location.lat} 52 42` : "55 15 250 150"}>
            <image href={thumbnail} width="360" height="180"/>
          </svg>}
        <path d="M5 5h200v200H5z" fill="url(#scanlines)"/>
      </svg>
      <path d="M7 7h170l26 25v172H30L7 181Z" fill="none" stroke="#c7d5de" strokeWidth="1.8"/>
      <text x="212" y="34" fontSize="32">{name}</text><path d="M205 42h113l15-15" fill="none" stroke="#d0e5e4" strokeWidth="1.5"/>
      {content.metrics.map((metric,i)=><g key={metric.label} transform={`translate(${221+i*274} 54)`}>
        <path d="M3 0h8v97H3z" fill="url(#vents)"/><rect x="16" y="47" width="227" height="46" fill="#6d8f9430"/>
        <Glyph name={metric.icon} x={16} y={0} size={48}/>
        <text x="75" y="36" fontSize="27">{metric.label}</text>
        <text x="21" y="77" fontSize="25" fontFamily="Arial,sans-serif">//{metric.value}</text>
      </g>)}
      <path d="M891 4h63l28 26v15h-65l-26-25Z" fill="#041a25" stroke="#79bed4" strokeWidth="2"/>
      <text x="918" y="36" fontSize="34" fontWeight="bold" letterSpacing="2">···</text>
      <g opacity=".5" stroke="#a2a994" fill="#182527"><path d="m660 20 11-16h20l10 16-10 16h-20z"/><path d="m716 20 11-16h20l10 16-10 16h-20z"/><path d="m773 20 11-16h20l10 16-10 16h-20z"/><path d="m831 20 11-16h20l10 16-10 16h-20z"/></g>
      <path d="M217 163h757v37H217z" fill="url(#hud-blue)" stroke="#9ae8f2" strokeWidth="2"/>
      <path d="M219 164h754v31H219z" fill="url(#rule)"/><path d="M221 199h748" stroke="#25639b" strokeWidth="4"/>
      <path d="M995 208v-114m8 114v-89" stroke="#4aab75" opacity=".8" strokeWidth="3"/><path d="M1012 208v-102" stroke="#972631" strokeWidth="3"/>
    </g>
    {/* The thumbnail projects a whole-world image. Its unclipped bounds must not capture neighboring buttons. */}
    <Control label={`地区详情 · ${name}`} description={content.metrics.map(m => `${m.label} ${m.value}`).join("，")} run={()=>open("region")}>
      <path d={outline} fill="transparent"/>
    </Control>
  </g>
}
export default function Hud({location,content,zoom,speed,night,toggleNight,open,setSpeed,setZoom}:Props) {
  const host=useRef<HTMLDivElement>(null)
  const [size,setSize]=useState({width:HUD.width,height:HUD.height})
  useLayoutEffect(()=>{
    const element=host.current!
    function measure() {
      const width=element.clientWidth, height=element.clientHeight
      if (width && height) setSize(old=>old.width===width && old.height===height ? old : {width,height})
    }
    measure()
    const observer=new ResizeObserver(measure)
    observer.observe(element)
    return ()=>observer.disconnect()
  },[])
  const unit=hudScale(size.width,size.height)
  const w=size.width/unit, h=size.height/unit
  const railX=w-HUD.railRight, railY=h/2-HUD.railAboveMiddle
  const progress=Math.log1p(68*zoom)/Math.log(69)
  const thumb=HUD.railTrackTop+(1-progress)*HUD.railTravel
  return <div className="hud-layer" ref={host}>
    <svg className="hud" viewBox={`0 0 ${w} ${h}`} aria-label="地图控制台">
      <Symbols/>
      <defs><pattern id="scanlines" width="4" height="4" patternUnits="userSpaceOnUse"><path d="M0 1h4" stroke="#6f8f9c" strokeWidth=".6" opacity=".28"/></pattern>
        <clipPath id="news-clip"><path d="M16 26h92v58l-36 34H16z"/></clipPath>
      </defs>
      <path d={`M0 ${h-182}h21l32 32v105H${w-53}v-105l32-32h21V${h}H0Z`} fill="#091d24aa" stroke="#53a1bc" strokeWidth="1.5"/>
      <Control label="新闻" run={()=>open("news")}>
        <Glass d="M16 26h959l34 33v17H109l-36 42H16Z"/>
        <path d="M17 26h91v59l-36 33H16Z" fill="#143a38" stroke="#88dbea" strokeWidth="2"/>
        <g clipPath="url(#news-clip)"><image href={surfaceUrl} x="-63" y="24" width="230" height="114" opacity=".7"/>
          <path d="M17 34h90v40H17z" fill="#061616b8"/><text x="22" y="62" fontSize="28" fontFamily="Arial,sans-serif" fontWeight="bold">NEWS</text></g>
        <path d="M167 31h185v6H167zm537 12h90v6h-90z" fill="url(#vents)" opacity=".8"/>
        <text x="552" y="63" textAnchor="middle" fontSize="39">{content.headline}</text>
        <path d="M914 29h59l33 31v13h-62l-30-29Z" fill="#03151e" stroke="#84beca" strokeWidth="1.6"/>
        <path d="m944 42 15 14 16-14" fill="none" stroke="#eefcff" strokeWidth="7"/>
      </Control>
      <g transform={`translate(${w-430} 26)`}>
        <Control label={night ? "切换到白天" : "切换到黑夜"} pressed={night} run={toggleNight}>
          <Glass d="M0 0h92v51H0Z"/>
          <text x="46" y="35" textAnchor="middle" fontSize="28">{night ? "黑夜" : "白天"}</text>
        </Control>
      </g>
      <g transform={`translate(${w-326} 26)`}>
        <Control label="日期与菜单" run={()=>open("menu")}>
          <Glass d="M0 0h306v51H32L0 18Z"/><text x="30" y="38" fontSize="38" fontFamily="Arial,sans-serif">{content.date}</text>
          <path d="M260 4h42v42h-42z M265 9l32 32m0-32-32 32" fill="none" stroke="#d0edf1" strokeWidth="2.1"/>
        </Control>
        <Glass d="M90 51h216v38H126Z"/>
        {content.speeds.map((n)=><Control key={n} label={n===0 ? "暂停" : `${n} 倍速`} pressed={speed===n} run={()=>setSpeed(n)}>
          <rect x={120+n*40} y="53" width={n===3 ? 63 : 40} height="35" fill="transparent"/>
          <g transform={`translate(${131+n*39} 60)`} fill={speed===n ? "#fff" : "#829195"} opacity={speed===n ? 1 : .75}>
            {n===0 ? <path d="M1 0h6v20H1zm11 0h6v20h-6z"/> : Array.from({length:n},(_,j)=><path key={j} d={`M${j*14} 0l17 10-17 10Z`}/>)}
          </g>
        </Control>)}
      </g>
      <g transform={`translate(${railX} ${railY})`}>
        <Glass d="M0 0h33l35 34v568H34L0 568Z"/>
        <path d="M34 4v592" stroke="#51747a" opacity=".25" strokeWidth="2"/>
        <g transform={`translate(4 ${thumb})`}><path d="M0-6h16l5-8h13l5 8h20V7H39l-5 8H21l-5-8H0Z" fill="#051116" stroke="#62828b" strokeWidth="2"/>
          <path d="m21 0 5-9h6l5 9-5 9h-6Z" fill="#163746"/></g>
      </g>
      <SideMeter x={20} y={h-130} open={open} content={content}/>
      <RegionStrip x={w/2-503} y={h-HUD.regionHeight} location={location} open={open} content={content}/>
      <SideMeter world x={w-362} y={h-130} open={open} content={content}/>
    </svg>
    <input className="zoom-rail" type="range" min="0" max="1000" step="1" value={Math.round(progress*1000)}
      style={{left:railX*unit,top:(railY+HUD.railTrackTop)*unit,width:68*unit,height:HUD.railTravel*unit}}
      aria-label="地图缩放" aria-valuetext={`${Math.round(zoom*100)}%`} onChange={e=>setZoom(Math.expm1(Number(e.target.value)/1000*Math.log(69))/68)}/>
  </div>
}
