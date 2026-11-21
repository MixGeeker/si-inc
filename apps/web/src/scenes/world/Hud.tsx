import { useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { Glyph, Symbols } from "./Symbols"
import { surfaceUrl, type Location } from "../../cartography/atlas"
import { useLanguage } from "../../i18n/useLanguage"
import { countryName } from "../../cartography/place-names"
import { HUD, hudScale } from "../../cartography/layout"
import kyiv from "../../cartography/data/kyiv.webp"
import type { MapPanel, NewsView } from "../machine"
import type { DecisionId } from "../../../../../packages/rules/v0.1/events/decisions"
import type { CampaignHud, HudContent, PreviewHud } from "./hudContent"
import { NewsLayer } from "./NewsLayer"
import type { NewsItem } from "./newsFeed"
import { regionCapacity, regionIds, regions } from "../../../../../packages/rules/v0.1/world/regions"
import { btoken } from "../../../../../packages/rules/v0.1/economy/btoken"
import type { PlaceFocus } from "../store"

interface Props {
  location: Location | null
  place: PlaceFocus | null
  content: HudContent
  newsItems: readonly NewsItem[]
  newsView: NewsView | null
  newsItemId?: string
  newsDay: number | null
  openNews: (view: NewsView, itemId?: string) => void
  closeNews: () => void
  decide: (id: DecisionId, instanceId: string) => void
  zoom: number
  selectedSpeed: number
  manualPaused: boolean
  paused: boolean
  night: boolean
  toggleNight: () => void
  open: (panel: MapPanel) => void
  focusPlace: (place: PlaceFocus | null) => void
  setSpeed: (speed: number) => void
  onPause: (paused: boolean) => void
  setZoom: (zoom: number) => void
}

function Control({label,run,children,pressed,description,news}:{label:string;run:()=>void;children:ReactNode;pressed?:boolean;description?:string;news?:boolean}) {
  return <g className="svg-button" data-news={news ? "" : undefined} role="button" tabIndex={0} aria-label={label} aria-pressed={pressed} aria-description={description} onClick={run}
    onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();run()}}}>
    <title>{label}</title>{children}
  </g>
}
function Glass({d,accent=false}:{d:string;accent?:boolean}) {
  return <>
    <path d={d} fill="url(#hud-glass)"/>
    <path d={d} fill="url(#panel-grid)" pointerEvents="none"/>
    <path d={d} fill="none" stroke={accent ? "var(--hud-bloom-accent)" : "var(--hud-bloom)"} strokeOpacity={accent ? .48 : .26} strokeWidth="3.2" filter="url(#edge-bloom)"/>
    <path className="plate-edge" d={d} fill="none" stroke={accent ? "var(--hud-edge-accent)" : "var(--hud-edge)"} strokeOpacity={accent ? .76 : .66} strokeWidth="1.15" strokeLinejoin="miter" filter="url(#edge-glow)"/>
  </>
}
function cutRect(x:number,y:number,rw:number,rh:number,c:number) {
  return `M${x+c} ${y}H${x+rw-c}L${x+rw} ${y+c}V${y+rh-c}L${x+rw-c} ${y+rh}H${x+c}L${x} ${y+rh-c}V${y+c}Z`
}
function Corner({x,y,sx,sy,reach=78}:{x:number;y:number;sx:number;sy:number;reach?:number}) {
  return <g transform={`translate(${x} ${y}) scale(${sx} ${sy})`}>
    <path d={`M0 ${reach}V26L26 0H${reach}`} fill="none" stroke="var(--hud-corner-bloom)" strokeWidth="3.4" strokeOpacity=".58" filter="url(#edge-bloom)"/>
    <path d={`M0 ${reach}V26L26 0H${reach}`} fill="none" stroke="var(--hud-edge)" strokeWidth="1.5" strokeOpacity=".92"/>
    <path d={`M8 ${reach-16}V34L34 8H${reach-16}`} fill="none" stroke="var(--hud-edge)" strokeWidth="1" strokeOpacity=".42"/>
    <path d="M20 20h9v9h-9z" fill="var(--hud-corner-dot)" fillOpacity=".82"/>
    <path d="M0 52H-10M52 0V-10" fill="none" stroke="var(--hud-edge)" strokeWidth="1.3" strokeOpacity=".9"/>
  </g>
}
function mapFrame(w:number,h:number) {
  return {left:36, top:HUD.newsBottom+20, right:w-HUD.railRight-44, bottom:h-HUD.regionHeight-28, cut:52}
}
function FrameFrost({width,height,unit}:{width:number;height:number;unit:number}) {
  const frame=mapFrame(width/unit,height/unit)
  const l=frame.left*unit, t=frame.top*unit, r=frame.right*unit, b=frame.bottom*unit, c=frame.cut*unit
  const hole=`M${l+c} ${t}H${r-c}L${r} ${t+c}V${b-c}L${r-c} ${b}H${l+c}L${l} ${b-c}V${t+c}Z`
  const clip=`path(evenodd, "M0 0H${width}V${height}H0Z ${hole}")`
  return <div className="frame-frost" style={{clipPath:clip}} aria-hidden="true"/>
}
function ScreenBezel({w,h}:{w:number;h:number}) {
  const pad=10
  const {left,top,right,bottom}=mapFrame(w,h)
  const wide=right-left, tall=bottom-top, band=28
  const map=cutRect(left,top,wide,tall,52)
  const inner=cutRect(left+band,top+band,wide-band*2,tall-band*2,34)
  const cx=(left+right)/2, cy=(top+bottom)/2
  return <g className="screen-bezel" pointerEvents="none">
    <path d={`${map} ${inner}`} fill="url(#bezel-glass)" fillRule="evenodd"/>
    <path d={map} fill="none" stroke="var(--hud-bezel-bloom)" strokeWidth="5" strokeOpacity=".76" filter="url(#edge-bloom)" strokeLinejoin="miter"/>
    <path d={map} fill="none" stroke="var(--hud-edge)" strokeWidth="1.35" strokeOpacity=".88" strokeLinejoin="miter"/>
    <path d={inner} fill="none" stroke="var(--hud-edge)" strokeWidth="1.2" strokeOpacity=".55" filter="url(#edge-glow)" strokeLinejoin="miter"/>
    <path d={`M${left+58} ${top}H${right-58}`} fill="none" stroke="var(--hud-edge)" strokeWidth="1.6" strokeOpacity=".9" filter="url(#edge-glow)"/>
    <Corner x={left} y={top} sx={1} sy={1}/><Corner x={right} y={top} sx={-1} sy={1}/>
    <Corner x={left} y={bottom} sx={1} sy={-1}/><Corner x={right} y={bottom} sx={-1} sy={-1}/>
    <path d={`M${cx-54} ${top} l12 -12h84l12 12M${cx-8} ${top-7}h16`} fill="none" stroke="var(--hud-edge)" strokeWidth="1.15" strokeOpacity=".62" filter="url(#edge-glow)"/>
    <path d={`M${cx-54} ${bottom} l12 12h84l12 -12`} fill="none" stroke="var(--hud-edge)" strokeWidth="1.1" strokeOpacity=".42"/>
    <path d={`M${left} ${cy-40} l-12 12v56l12 12M${right} ${cy-40} l12 12v56l-12 12`} fill="none" stroke="var(--hud-edge)" strokeWidth="1.1" strokeOpacity=".48"/>
    <path d={`M${left-7} ${cy-28}h7m-7 14h7m-7 14h7m-7 14h7M${right} ${cy-28}h7m-7 14h7m-7 14h7m-7 14h7`} fill="none" stroke="var(--hud-edge)" strokeWidth="1" strokeOpacity=".42"/>
    <Corner x={pad} y={pad} sx={1} sy={1} reach={60}/><Corner x={w-pad} y={pad} sx={-1} sy={1} reach={60}/>
    <Corner x={pad} y={h-pad} sx={1} sy={-1} reach={60}/><Corner x={w-pad} y={h-pad} sx={-1} sy={-1} reach={60}/>
    <path d={`M${pad+72} ${pad}H${w/2-92}M${w/2+92} ${pad}H${w-pad-72}`} fill="none" stroke="var(--hud-edge)" strokeWidth="1.15" strokeOpacity=".48" filter="url(#edge-glow)"/>
    <path d={`M${pad+96} ${pad+6}H${w/2-150}M${w/2+150} ${pad+6}H${w-pad-96}`} fill="none" stroke="var(--hud-edge)" strokeWidth="1" strokeOpacity=".18"/>
    <path d={`M${w/2-78} ${pad}h34l8 8h12l8-8h34`} fill="none" stroke="var(--hud-edge)" strokeWidth="1.15" strokeOpacity=".7" filter="url(#edge-glow)"/>
    <rect x={w/2-3} y={pad-3} width="6" height="6" fill="var(--hud-center-dot)" fillOpacity=".88"/>
    <path d={`M${w/2-168} 4v7m10-7v7m10-7v7m10-7v7M${w/2+128} 4v7m10-7v7m10-7v7m10-7v7`} fill="none" stroke="var(--hud-edge)" strokeWidth="1" strokeOpacity=".45"/>
    <path d={`M${pad} ${pad+68}V${h-pad-68}M${w-pad} ${pad+68}V${h-pad-68}`} fill="none" stroke="var(--hud-edge)" strokeWidth="1.15" strokeOpacity=".36" filter="url(#edge-glow)"/>
    <path d={`M4 ${h/2-40}h7m-7 16h7m-7 16h7m-7 16h7M${w-4} ${h/2-40}h-7m7 16h-7m7 16h-7m7 16h-7`} fill="none" stroke="var(--hud-edge)" strokeWidth="1" strokeOpacity=".38"/>
  </g>
}
function SideMeter({world,x,y,open,content}:{world?:boolean;x:number;y:number;open:(p:MapPanel)=>void;content:PreviewHud}) {
  const { ui } = useLanguage()
  const label = world ? ui.world : content.overview
  return <g transform={`translate(${x} ${y})`}>
    <Control label={label} run={()=>open(world ? "world" : "overview")}>
      <Glass d="M0 1H312L345 33V120H0Z"/>
      <path d="M2 54h141l14-14M2 72h43" fill="none" stroke="var(--hud-hairline)" strokeOpacity=".28" strokeWidth="1"/>
      <path d="M245 6h64l30 28v13h-64l-30-29Z" fill={world ? "url(#hud-blue)" : "url(#hud-red)"}/>
      <path d="M245 6h64l30 28v13h-64l-30-29Z" fill="none" stroke="var(--hud-edge)" strokeOpacity=".36" strokeWidth="1" filter="url(#edge-glow)"/>
      <path d="M250 9h59l26 25v8h-56l-29-27Z" fill="none" stroke="var(--hud-edge)" strokeOpacity=".28"/>
      <Glyph name={world ? "flask" : "hexes"} x={world ? 270 : 260} y={8} width={world ? 40 : 76} height={38}/>
      <text x="8" y="49" fontSize="32">{world ? ui.world : ui.diseaseShort}</text>
      <rect x="13" y="78" width="321" height="35" fill={world ? "var(--hud-well-cool)" : "var(--hud-well-warm)"}/>
      <path d="M16 79.5h316" stroke="var(--hud-edge)" strokeOpacity=".4"/>
      <Glyph name={world ? "flask" : content.currencyIcon} x={21} y={78} size={34}/>
      <text x="75" y="108" fontSize="35" fontFamily="Arial,sans-serif">{world ? content.research : content.balance}</text>
    </Control>
  </g>
}

function ResourceMeter({x,y,title,value,detail,icon,research,onOpen}:{x:number;y:number;title:string;value:string;detail:string;icon:string;research?:boolean;onOpen?:()=>void}) {
  const face = <>
    <Glass d="M0 1H312L345 33V120H0Z"/>
    <path d="M2 34h120l14-14" fill="none" stroke="var(--hud-hairline)" strokeOpacity=".28" strokeWidth="1"/>
    <path d="M245 6h64l30 28v13h-64l-30-29Z" fill={research ? "url(#hud-blue)" : "url(#hud-red)"}/>
    <path d="M245 6h64l30 28v13h-64l-30-29Z" fill="none" stroke="var(--hud-edge)" strokeOpacity=".36" strokeWidth="1" filter="url(#edge-glow)"/>
    <path d="M250 9h59l26 25v8h-56l-29-27Z" fill="none" stroke="var(--hud-edge)" strokeOpacity=".28"/>
    <Glyph name={icon} x={268} y={8} width={40} height={38}/>
    <text x="8" y="30" fontSize="28">{title}</text>
    <text x="8" y="58" fontSize="20" fill="var(--hud-muted)">{detail}</text>
    <rect x="13" y="78" width="321" height="35" fill={research ? "var(--hud-well-cool)" : "var(--hud-well-warm)"}/>
    <path d="M16 79.5h316" stroke="var(--hud-edge)" strokeOpacity=".4"/>
    <Glyph name={icon} x={21} y={78} size={34}/>
    <text x="75" y="108" fontSize="35" fontFamily="Arial,sans-serif">{value}</text>
  </>
  return <g transform={`translate(${x} ${y})`}>
    {onOpen ? <Control label={title} description={`${value} · ${detail}`} run={onOpen}>{face}</Control>
      : <g role="group" aria-label={`${title} · ${value} · ${detail}`}>{face}</g>}
  </g>
}

function PlaceThumb({location}:{location:Location|null}) {
  const country = location?.country
  const thumbnail = country?.id === "UKR" ? kyiv : surfaceUrl
  return <>
    <clipPath id="feed-clip"><path d="M7 7h170l26 25v172H30L7 181Z"/></clipPath>
    <svg x="7" y="7" width="198" height="198" viewBox="7 7 198 198" overflow="hidden" clipPath="url(#feed-clip)">
      {country?.id === "UKR" ? <image href={thumbnail} x="7" y="7" width="198" height="198" preserveAspectRatio="xMidYMid slice"/> :
        <svg x="7" y="7" width="198" height="198" preserveAspectRatio="xMidYMid slice"
          viewBox={location ? `${location.lon + 154} ${69 - location.lat} 52 42` : "55 15 250 150"}>
          <image href={thumbnail} width="360" height="180"/>
        </svg>}
      <path d="M5 5h200v200H5z" fill="url(#scanlines)"/>
    </svg>
    <path d="M7 7h170l26 25v172H30L7 181Z" fill="none" stroke="var(--hud-edge)" strokeOpacity=".44" strokeWidth="1" filter="url(#edge-glow)"/>
  </>
}

function StripBar({footer, human}:{footer?:string; human:string}) {
  return <>
    <path d="M217 163h757v37H217z" fill="url(#hud-blue)"/>
    <path d="M217 163h757v37H217z" fill="none" stroke="var(--hud-edge)" strokeOpacity=".26" strokeWidth="1"/>
    <path d="M219 164h754" stroke="var(--hud-edge)" strokeOpacity=".38"/>
    <path d="M219 164h754v31H219z" fill="url(#rule)"/>
    {footer && <text x="232" y="188" fontSize="20">{footer}</text>}
    <text x="960" y="188" textAnchor="end" fontSize="20">{human}</text>
  </>
}

function CampaignStrip({x,y,place,location,content,focusPlace,openDetails}:{
  x:number; y:number; place:PlaceFocus|null; location:Location|null; content:CampaignHud
  focusPlace:Props["focusPlace"]; openDetails:()=>void
}) {
  const { ui, locale, scenario, percent } = useLanguage()
  const marketName = place ? scenario.regions[place.id] : null
  const name = marketName ?? ui.globalMarket
  const footer = place ? ui.marketRewards(btoken.adoptionMilestones.map(m => `${percent.format(m.adoptionBps / 10000)} +${m.reward}`).join(" / ")) : undefined
  const outline = "M0 0H956l30 31v180H31L0 178Z"
  const detailName = marketName ?? (location ? countryName(location.country, locale) ?? ui.ocean : null)
  return <g transform={`translate(${x} ${y})`} role="group" aria-label={name}>
    <path d="M-54 220V82l31-32H1038v170Z" fill="url(#hud-glass)"/>
    <path d="M-54 220V82l31-32H1038v170Z" fill="none" stroke="var(--hud-edge)" strokeOpacity=".24" strokeWidth="1" filter="url(#edge-glow)"/>
    <g aria-hidden="true" pointerEvents="none">
      <Glass d={outline}/>
      <PlaceThumb location={location}/>
    </g>
    <StripBar footer={footer} human={content.human}/>
    <text x={place ? 316 : 218} y="32" fontSize="26" fontWeight="600">{name}</text>
    {place && <Control label={ui.backGlobal} run={() => focusPlace(null)}>
      <rect x="212" y="3" width="87" height="36" fill="transparent"/>
      <text x="218" y="30" fontSize="21" fill="var(--hud-muted)">‹ {ui.globalShort}</text>
    </Control>}
    {!place && regionIds.map((id, i) => {
      const capacity = regionCapacity(id)
      return <g key={id} transform={`translate(${215 + (i % 3) * 254} ${46 + Math.floor(i / 3) * 56})`}>
        <Control label={scenario.regions[id]} description={ui.slotsFull(capacity)} run={() => focusPlace({ kind: "market", id })}>
          <rect className="place-cell" width="246" height="49"/>
          <text x="10" y="32" fontSize="25">{scenario.regions[id]}</text>
          <text x="235" y="32" textAnchor="end" fontSize="19" fill="var(--hud-muted)">{ui.slots(capacity)}</text>
        </Control>
      </g>
    })}
    {place && <g transform="translate(220 76)">
      <text fontSize="22" fill="var(--hud-muted)">{ui.regions}</text><text y="42" fontSize="36">{Object.keys(regions[place.id].slots).length}</text>
      <text x="360" fontSize="22" fill="var(--hud-muted)">{ui.capacity}</text><text x="360" y="42" fontSize="36">{regionCapacity(place.id)}</text>
    </g>}
    <Control label={detailName ? `${ui.regionProfile} · ${detailName}` : ui.locate} run={openDetails}>
      <rect x="743" y="3" width="223" height="36" fill="transparent"/>
      <text x="958" y="30" textAnchor="end" fontSize="21" fill="var(--hud-muted)">{place ? ui.regionProfile : detailName ?? ui.locate} ›</text>
    </Control>
  </g>
}

function RegionStrip({location,place,open,x,y,content}:{location:Location|null;place:PlaceFocus|null;open:(p:MapPanel)=>void;x:number;y:number;content:PreviewHud}) {
  const { ui, locale, scenario } = useLanguage()
  const name = place ? scenario.regions[place.id] : countryName(location?.country, locale) ?? (location ? ui.ocean : ui.worldOverview)
  const outline = "M0 0H956l30 31v180H31L0 178Z"
  return <g transform={`translate(${x} ${y})`}>
    <path d="M-54 220V82l31-32H1038v170Z" fill="url(#hud-glass)"/>
    <path d="M-54 220V82l31-32H1038v170Z" fill="none" stroke="var(--hud-edge)" strokeOpacity=".24" strokeWidth="1" filter="url(#edge-glow)"/>
    <g aria-hidden="true" pointerEvents="none">
      <Glass d={outline}/>
      <PlaceThumb location={location}/>
      <text x="212" y="34" fontSize="32">{name}</text><path d="M205 42h113l15-15" fill="none" stroke="var(--hud-hairline)" strokeOpacity=".28" strokeWidth="1"/>
      {content.metrics.map((metric,i)=><g key={metric.label} transform={`translate(${221+i*274} 54)`}>
        <path d="M3 0h8v97H3z" fill="url(#vents)"/><rect x="16" y="47" width="227" height="46" fill="var(--hud-metric-well)"/>
        <Glyph name={metric.icon} x={16} y={0} size={48}/>
        <text x="75" y="36" fontSize="27">{metric.label}</text>
        <text x="21" y="77" fontSize="25" fontFamily="Arial,sans-serif">//{metric.value}</text>
      </g>)}
      <path d="M891 4h63l28 26v15h-65l-26-25Z" fill="var(--hud-thumb-bg)"/>
      <path d="M891 4h63l28 26v15h-65l-26-25Z" fill="none" stroke="var(--hud-edge)" strokeOpacity=".34" strokeWidth="1" filter="url(#edge-glow)"/>
      <text x="918" y="36" fontSize="34" fontWeight="bold" letterSpacing="2">···</text>
      <g opacity=".45" stroke="var(--hud-hairline)" fill="var(--hud-hex-fill)"><path d="m660 20 11-16h20l10 16-10 16h-20z"/><path d="m716 20 11-16h20l10 16-10 16h-20z"/><path d="m773 20 11-16h20l10 16-10 16h-20z"/><path d="m831 20 11-16h20l10 16-10 16h-20z"/></g>
      <path d="M217 163h757v37H217z" fill="url(#hud-blue)"/>
      <path d="M217 163h757" stroke="var(--hud-edge)" strokeOpacity=".32"/>
      <path d="M219 164h754v31H219z" fill="url(#rule)"/>
      <path d="M995 208v-114m8 114v-89" stroke="var(--hud-edge)" strokeOpacity=".48" strokeWidth="1.2" filter="url(#edge-glow)"/><path d="M1012 208v-102" stroke="var(--hud-drop-edge)" strokeOpacity=".75" strokeWidth="1.2" filter="url(#edge-glow)"/>
    </g>
    {/* The thumbnail projects a whole-world image. Its unclipped bounds must not capture neighboring buttons. */}
    <Control label={ui.regionDetails(name)} description={content.metrics.map(m => `${m.label} ${m.value}`).join(" · ")} run={()=>open("region")}>
      <path d={outline} fill="transparent"/>
    </Control>
  </g>
}
export default function Hud({location,place,content,newsItems,newsView,newsItemId,newsDay,openNews,closeNews,decide,zoom,selectedSpeed,manualPaused,paused,night,toggleNight,open,focusPlace,setSpeed,onPause,setZoom}:Props) {
  const { ui, percent } = useLanguage()
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
  // Keep the news and menu legible when the full map frame scales down.
  const newsUnit = Math.max(unit, Math.min(.52, size.width / 1030))
  const menuUnit = Math.max(unit, Math.min(.60, size.width / 600))
  const menuWidth = content.kind === "preview" ? 430 : 586
  const stacked = 1010 * newsUnit + menuWidth * menuUnit > size.width
  const menuTop = stacked ? 88 * newsUnit : 0
  const sheetTop = stacked ? menuTop + 115 * menuUnit + 4 : 118 * newsUnit
  const railX=w-HUD.railRight, railY=h/2-HUD.railAboveMiddle
  const progress=Math.log1p(68*zoom)/Math.log(69)
  const thumb=HUD.railTrackTop+(1-progress)*HUD.railTravel
  return <div className="hud-layer" ref={host}>
    <FrameFrost width={size.width} height={size.height} unit={unit}/>
    <svg className="hud" viewBox={`0 0 ${w} ${h}`} aria-label={ui.mapControls}>
      <Symbols/>
      <defs><pattern id="scanlines" width="4" height="4" patternUnits="userSpaceOnUse"><path d="M0 1h4" stroke="var(--hud-scanline)" strokeWidth=".6" opacity=".28"/></pattern>
        <clipPath id="news-clip"><path d="M16 26h92v58l-36 34H16z"/></clipPath>
      </defs>
      <path d={`M0 ${h-182}h21l32 32v105H${w-53}v-105l32-32h21V${h}H0Z`} fill="var(--hud-skirt)"/>
      <path d={`M0 ${h-182}h21l32 32`} fill="none" stroke="var(--hud-edge)" strokeOpacity=".28" filter="url(#edge-glow)"/>
      <g transform={`scale(${newsUnit / unit})`}>
        <Glass d="M16 26h959l34 33v17H109l-36 42H16Z"/>
        <path d="M17 26h91v59l-36 33H16Z" fill="var(--hud-badge-bg)"/>
        <path d="M17 26h91v59l-36 33H16Z" fill="none" stroke="var(--hud-edge)" strokeOpacity=".38" strokeWidth="1" filter="url(#edge-glow)"/>
        <g clipPath="url(#news-clip)"><image href={surfaceUrl} x="-63" y="24" width="230" height="114" opacity=".45"/>
          <path d="M17 34h90v40H17z" fill="var(--hud-badge-scrim)"/><text x="22" y="62" fontSize="26" fontFamily="Arial,sans-serif" fontWeight="bold" fill="var(--hud-badge-text)">{ui.newsBadge}</text></g>
        <path d="M167 31h185v6H167zm537 12h90v6h-90z" fill="url(#vents)" opacity=".8"/>
        <path d="M914 29h59l33 31v13h-62l-30-29Z" fill="var(--hud-drop-bg)"/>
        <path d="M914 29h59l33 31v13h-62l-30-29Z" fill="none" stroke="var(--hud-drop-edge)" strokeOpacity=".6" strokeWidth="1" filter="url(#edge-glow)"/>
        <path d="m944 42 15 14 16-14" fill="none" stroke="var(--hud-drop-arrow)" strokeWidth="2.4" filter="url(#edge-glow)"/>
        <Control label={ui.archive} description={ui.allNews} pressed={newsView==="archive"} news run={()=>openNews("archive")}>
          <path d="M16 26h96v92H16Z" fill="transparent"/>
        </Control>
        <Control label={ui.thisDay} pressed={newsView==="day"} news run={()=>openNews("day")}>
          <path d="M910 26h100v52H910Z" fill="transparent"/>
        </Control>
      </g>
      <g transform={`translate(${w} ${menuTop / unit}) scale(${menuUnit / unit})`}>
        {content.kind === "preview" ? <g transform="translate(-430 26)">
          <Control label={night ? ui.switchDay : ui.switchNight} pressed={night} run={toggleNight}>
            <Glass d="M0 0h92v51H0Z"/>
            <text x="46" y="35" textAnchor="middle" fontSize="28">{night ? ui.night : ui.daylight}</text>
          </Control>
        </g> : <g transform="translate(-586 26)" role="group" aria-label={night ? ui.secondActFull : ui.firstActFull}>
          <Glass d="M0 0h248v51H0Z"/>
          <text x="124" y="35" textAnchor="middle" fontSize="26">{night ? ui.secondAct : ui.firstAct}</text>
        </g>}
        <g transform="translate(-326 26)">
          <Control label={ui.dateMenu} run={()=>open("menu")}>
            <Glass d="M0 0h306v51H32L0 18Z"/><text x="30" y="38" fontSize="38" fontFamily="Arial,sans-serif">{content.date}</text>
            <path d="M260 4h42v42h-42z M265 9l32 32m0-32-32 32" fill="none" stroke="var(--hud-menu-x)" strokeOpacity=".6" strokeWidth="1.1" filter="url(#edge-glow)"/>
          </Control>
          <Glass d="M90 51h216v38H126Z"/>
          <Control label={manualPaused ? ui.resumePlayback : ui.pause} pressed={manualPaused}
            description={paused && !manualPaused ? ui.automaticallyPaused : undefined} run={() => onPause(!manualPaused)}>
            <rect x="112" y="53" width="38" height="35" fill="transparent"/>
            <g transform="translate(122 61)" fill={paused ? "var(--hud-control-active)" : "var(--hud-control-idle)"}>
              {manualPaused ? <path d="M1 0l17 10L1 20Z"/> : <path d="M1 0h6v20H1zm11 0h6v20h-6z"/>}
            </g>
          </Control>
          {content.speeds.map((n,index)=><Control key={n} label={ui.speed(n)} pressed={selectedSpeed===n} run={()=>setSpeed(n)}>
            <rect x={150+index*38} y="53" width="38" height="35" fill="transparent"/>
            <g transform={`translate(${169+index*38} 78)`} fill={selectedSpeed===n ? "var(--hud-control-active)" : "var(--hud-control-idle)"} opacity={selectedSpeed===n ? 1 : .7}>
              <text textAnchor="middle" fontSize="16" fontWeight="700">{n}×</text>
            </g>
          </Control>)}
        </g>
      </g>
      <g transform={`translate(${railX} ${railY})`}>
        <Glass d="M0 0h33l35 34v568H34L0 568Z"/>
        <path d="M34 4v592" stroke="var(--hud-edge)" strokeOpacity=".18" strokeWidth="1"/>
        <g transform={`translate(4 ${thumb})`}><path d="M0-6h16l5-8h13l5 8h20V7H39l-5 8H21l-5-8H0Z" fill="var(--hud-thumb-bg)"/>
          <path d="M0-6h16l5-8h13l5 8h20V7H39l-5 8H21l-5-8H0Z" fill="none" stroke="var(--hud-edge)" strokeOpacity=".45" strokeWidth="1" filter="url(#edge-glow)"/>
          <path d="m21 0 5-9h6l5 9-5 9h-6Z" fill="var(--hud-thumb-core)"/></g>
      </g>
      {content.kind === "preview" ? <>
        <SideMeter x={20} y={h-130} open={open} content={content}/>
        <RegionStrip x={w/2-503} y={h-HUD.regionHeight} location={location} place={place} open={open} content={content}/>
        <SideMeter world x={w-362} y={h-130} open={open} content={content}/>
      </> : <>
        <ResourceMeter x={20} y={h-130} title={ui.action} value={content.token} detail={ui.cards(content.cards)} icon="token"/>
        <CampaignStrip x={w/2-503} y={h-HUD.regionHeight} place={place} location={location} content={content} focusPlace={focusPlace} openDetails={() => open("region")}/>
        <ResourceMeter x={w-362} y={h-130} title={ui.research} value={content.corpus} detail={content.yieldText} icon="flask" research onOpen={() => open("overview")}/>
      </>}
      <ScreenBezel w={w} h={h}/>
    </svg>
    <input className="zoom-rail" type="range" min="0" max="1000" step="1" value={Math.round(progress*1000)}
      style={{left:railX*unit,top:(railY+HUD.railTrackTop)*unit,width:68*unit,height:HUD.railTravel*unit}}
      aria-label={ui.mapZoom} aria-valuetext={percent.format(Math.round(zoom * 100) / 100)} onChange={e=>setZoom(Math.expm1(Number(e.target.value)/1000*Math.log(69))/68)}/>
    <NewsLayer unit={newsUnit} sheetTop={sheetTop} items={newsItems} view={newsView} itemId={newsItemId} day={newsDay} dated={content.kind==="campaign"} open={openNews} close={closeNews} decide={decide}/>
  </div>
}
