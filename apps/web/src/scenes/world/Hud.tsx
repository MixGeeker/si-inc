import { useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { useGameSnapshot, useGameStore } from "../GameContext"
import { musicCatalog, musicTrackTitle } from "../../audio/music"
import { formatShortcutKey } from "../../input/shortcuts"
import { Glyph, Symbols } from "./Symbols"
import { surfaceUrl, type Location } from "../../cartography/atlas"
import { useLanguage } from "../../i18n/useLanguage"
import { countryName } from "../../cartography/place-names"
import { HUD, hudScale } from "../../cartography/layout"
import kyiv from "../../cartography/data/kyiv.webp"
import type { MapPanel, NewsView } from "../machine"
import type { DecisionId } from "../../../../../packages/rules/v0.1/events/decisions"
import { factions, type FactionId } from "../../../../../packages/rules/v0.1/factions/roster"
import type { CampaignHud, FactionBarData, HudContent, PreviewHud } from "./hudContent"
import { NewsLayer } from "./NewsLayer"
import type { NewsItem } from "./newsFeed"
import { regionIds } from "../../../../../packages/rules/v0.1/world/regions"
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
  musicOpen: boolean
  setMusicOpen: (open: boolean | ((prev: boolean) => boolean)) => void
  openShortcutsHelp: () => void
  open: (panel: MapPanel) => void
  openSetup: () => void
  focusPlace: (place: PlaceFocus | null) => void
  setSpeed: (speed: number) => void
  onPause: (paused: boolean) => void
  setZoom: (zoom: number) => void
}

function Control({label,run,children,pressed,description,news}:{label:string;run:()=>void;children:ReactNode;pressed?:boolean;description?:string;news?:boolean}) {
  return <g className="svg-button" data-news={news ? "" : undefined} role="button" tabIndex={0} aria-label={label} aria-pressed={pressed} aria-description={description}
    onClick={e => { e.currentTarget.blur(); run() }}
    onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();run()}}}>
    <title>{label}</title>{children}
  </g>
}

function SvgKeycap({ x, y, label }: { x: number; y: number; label: string }) {
  const width = Math.max(26, label.length * 11 + 14)
  return <g className="hud-svg-keycap" transform={`translate(${x} ${y})`} pointerEvents="none" aria-hidden="true">
    <rect width={width} height="22" rx="4" fill="rgba(7, 16, 28, .82)" stroke="var(--hud-edge)" strokeOpacity=".68" strokeWidth="1"/>
    <text x={width / 2} y="15.5" textAnchor="middle" fontSize="13" fontWeight="700" fontFamily="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" fill="var(--hud-bloom)">{label}</text>
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

function ResourceMeter({x,y,title,value,detail,icon,research,shortcut,onOpen}:{x:number;y:number;title:string;value:string;detail:string;icon:string;research?:boolean;shortcut?:string;onOpen?:()=>void}) {
  const glyphWidth = icon === "hexes" ? 72 : 40
  const glyphX = icon === "hexes" ? 260 : 268
  const face = <>
    <Glass d="M0 1H312L345 33V120H0Z"/>
    <path d="M2 34h120l14-14" fill="none" stroke="var(--hud-hairline)" strokeOpacity=".28" strokeWidth="1"/>
    <path d="M245 6h64l30 28v13h-64l-30-29Z" fill={research ? "url(#hud-blue)" : "url(#hud-red)"}/>
    <path d="M245 6h64l30 28v13h-64l-30-29Z" fill="none" stroke="var(--hud-edge)" strokeOpacity=".36" strokeWidth="1" filter="url(#edge-glow)"/>
    <path d="M250 9h59l26 25v8h-56l-29-27Z" fill="none" stroke="var(--hud-edge)" strokeOpacity=".28"/>
    <Glyph name={icon} x={glyphX} y={8} width={glyphWidth} height={38}/>
    <text x="8" y="30" fontSize="28">{title}</text>
    {shortcut && <SvgKeycap x={200} y={9} label={shortcut}/>}
    <text x="8" y="58" fontSize="20" fill="var(--hud-muted)">{detail}</text>
    <rect x="13" y="78" width="321" height="35" fill={research ? "var(--hud-well-cool)" : "var(--hud-well-warm)"}/>
    <path d="M16 79.5h316" stroke="var(--hud-edge)" strokeOpacity=".4"/>
    <Glyph name={icon} x={21} y={78} width={icon === "hexes" ? 50 : 34} height={34}/>
    <text x={icon === "hexes" ? 82 : 75} y="108" fontSize="32">{value}</text>
  </>
  const accessibleLabel = shortcut ? `${title} (${shortcut})` : title
  return <g transform={`translate(${x} ${y})`}>
    {onOpen ? <Control label={accessibleLabel} description={`${value} · ${detail}`} run={onOpen}>{face}</Control>
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

const barFactionColors: Record<FactionId, { playerImm: string; playerSyn: string; rivalImm: string; rivalSyn: string }> = {
  gpt: { playerImm: "#00c864", playerSyn: "#4effa6", rivalImm: "#145735", rivalSyn: "#1e7a4b" },
  claude: { playerImm: "#ff5c1a", playerSyn: "#ffb347", rivalImm: "#732c14", rivalSyn: "#993d1c" },
  grok: { playerImm: "#8f38ff", playerSyn: "#d19cff", rivalImm: "#401e75", rivalSyn: "#5a2ca3" },
}

function FactionStackedBar({ x, y, width, height, bar, clipId }: {
  x: number; y: number; width: number; height: number; bar: FactionBarData; clipId: string
}) {
  let cursor = x
  return <g aria-hidden="true">
    <clipPath id={clipId}><rect x={x} y={y} width={width} height={height} rx={Math.min(4, height / 2)}/></clipPath>
    <rect x={x} y={y} width={width} height={height} rx={Math.min(4, height / 2)} fill="rgba(8, 18, 32, .88)" stroke="var(--hud-edge)" strokeOpacity=".34" strokeWidth=".9"/>
    <g clipPath={`url(#${clipId})`}>
      {bar.segments.map(seg => {
        const pal = barFactionColors[seg.factionId]
        const synW = width * (seg.syntheticBps / 10000)
        const immW = width * (seg.immersedBps / 10000)
        const sx = cursor
        const ix = sx + synW
        cursor = ix + immW
        return <g key={seg.factionId}>
          {synW > 0.2 && <>
            <rect x={sx} y={y} width={synW} height={height} fill={seg.isPlayer ? pal.playerSyn : pal.rivalSyn}/>
            <rect x={sx} y={y} width={synW} height={height} fill="url(#hud-bar-hex)" opacity={seg.isPlayer ? .52 : .35}/>
          </>}
          {immW > 0.2 && <rect x={ix} y={y} width={immW} height={height} fill={seg.isPlayer ? pal.playerImm : pal.rivalImm}/>}
        </g>
      })}
    </g>
    {/* Subtle 50% singularity reference tick */}
    <line x1={x + width * 0.5} y1={y - 1} x2={x + width * 0.5} y2={y + height + 1} stroke="rgba(226, 242, 255, .36)" strokeWidth="1" strokeDasharray="2 2"/>
  </g>
}

function RiskProgressBar({ x, y, width, label, valueText, bps, ticks, fill, urgent }: {
  x: number; y: number; width: number; label: string; valueText: string; bps: number
  ticks: readonly number[]; fill: string; urgent?: boolean
}) {
  const clamped = Math.max(0, Math.min(10000, bps))
  const fillW = width * (clamped / 10000)
  return <g>
    <text x={x} y={y + 13} fontSize="14.5" fill={urgent ? "var(--ui-risk)" : "var(--hud-muted)"}>{label}</text>
    <text x={x + width} y={y + 13} textAnchor="end" fontSize="14.5" fontWeight="600" fill={urgent ? "var(--ui-risk)" : "var(--hud-text)"}>{valueText}</text>
    <rect x={x} y={y + 19} width={width} height="11" rx="2.5" fill="rgba(6, 14, 26, .9)" stroke={urgent ? "var(--ui-risk)" : "var(--hud-edge)"} strokeOpacity={urgent ? .85 : .36} strokeWidth="1"/>
    {fillW > 0.5 && <rect x={x + 1} y={y + 20} width={Math.max(1, fillW - 2)} height="9" rx="1.8" fill={fill}/>}
    {ticks.map(t => (
      <line key={t} x1={x + width * t} y1={y + 18} x2={x + width * t} y2={y + 31} stroke="rgba(241, 248, 255, .5)" strokeWidth="1"/>
    ))}
  </g>
}

function CampaignStrip({x,y,place,location,content,focusPlace,openDetails,regionShortcut}:{
  x:number; y:number; place:PlaceFocus|null; location:Location|null; content:CampaignHud
  focusPlace:Props["focusPlace"]; openDetails:()=>void; regionShortcut:string
}) {
  const { ui, locale, scenario, percent } = useLanguage()
  const marketName = place ? scenario.regions[place.id] : null
  const currentRegion = place ? content.regions[place.id] : null
  const focusBar = place ? content.regionBars[place.id] : content.globalBar
  const focusTitle = marketName
    ? `${marketName}${currentRegion?.subsidyDaysLeft ? ` · ${ui.ops.subsidyActive(currentRegion.subsidyDaysLeft)}` : ""}`
    : ui.globalMarket
  const outline = "M0 0H956l30 31v180H31L0 178Z"
  const detailName = marketName ?? (location ? countryName(location.country, locale) ?? ui.ocean : null)
  const exposureColor = content.exposureBps >= 6000 ? "#ef4444" : content.exposureBps >= 2500 ? "#f59e0b" : "#38bdf8"
  const humanColor = content.humanBps >= 7500 ? "#f43f5e" : "#ec4899"
  return <g transform={`translate(${x} ${y})`} role="group" aria-label={marketName ?? ui.globalMarket}>
    <path d="M-54 220V82l31-32H1038v170Z" fill="url(#hud-glass)"/>
    <path d="M-54 220V82l31-32H1038v170Z" fill="none" stroke="var(--hud-edge)" strokeOpacity=".24" strokeWidth="1" filter="url(#edge-glow)"/>
    <g aria-hidden="true" pointerEvents="none">
      <Glass d={outline}/>
      <PlaceThumb location={location}/>
    </g>

    {/* Layer 1: Focus header + main stacked faction & synthetic progress bar */}
    {place && <Control label={ui.backGlobal} run={() => focusPlace(null)}>
      <rect x="212" y="4" width="76" height="28" fill="transparent"/>
      <text x="218" y="24" fontSize="18" fill="var(--hud-muted)">‹ {ui.globalShort}</text>
    </Control>}
    <text x={place ? 292 : 218} y="25" fontSize="22" fontWeight="600">{focusTitle}</text>
    <Control label={`${detailName ? `${ui.regionProfile} · ${detailName}` : ui.locate} (${regionShortcut})`} run={openDetails}>
      <rect x="740" y="3" width="224" height="29" fill="transparent"/>
      <text x="960" y="24" textAnchor="end" fontSize="18" fill="var(--hud-muted)">[{regionShortcut}] {place ? ui.regionProfile : detailName ?? ui.locate} ›</text>
    </Control>

    <FactionStackedBar x={218} y={33} width={744} height={22} bar={focusBar} clipId="hud-focus-bar-clip"/>
    <g fontSize="13.5">
      {focusBar.segments.map((seg, idx) => {
        const pal = barFactionColors[seg.factionId]
        const sx = 218 + idx * 204
        const name = factions[seg.factionId].name
        const pctText = `${percent.format(seg.totalBps / 10000)}${seg.syntheticBps > 0 ? ` (◈${percent.format(seg.syntheticBps / 10000)})` : ""}`
        return <g key={seg.factionId} transform={`translate(${sx} 68)`}>
          <rect y="-10" width="9" height="9" rx="2" fill={seg.isPlayer ? pal.playerImm : pal.rivalImm}/>
          <text x="14" fill={seg.isPlayer ? "var(--hud-text)" : "var(--hud-muted)"} fontWeight={seg.isPlayer ? "600" : "400"}>
            {name} {pctText}
          </text>
        </g>
      })}
      <text x="962" y="68" textAnchor="end" fill={content.syntheticActive ? "var(--ui-accent-bright)" : "var(--hud-muted)"}>
        {place && currentRegion
          ? `${ui.ops.centersShort(currentRegion.occupiedCenters, currentRegion.totalSlots)} · ${ui.ops.playerCenters} ${currentRegion.centers}`
          : `${ui.ops.barSynthetic} ${content.syntheticText}`}
      </text>
    </g>

    {/* Layer 2: 2x3 Continental compact bar matrix (clickable focus switcher) */}
    {regionIds.map((id, i) => {
      const summary = content.regions[id]
      const bar = content.regionBars[id]
      const col = i % 3
      const row = Math.floor(i / 3)
      const cx = 218 + col * 250
      const cy = 78 + row * 40
      const isSelected = place?.id === id
      const readyToBuild = content.buildCards > 0 && summary.buildable
      const stroke = isSelected
        ? "var(--hud-bloom)"
        : summary.syntheticEnabled
          ? "var(--ui-accent)"
          : readyToBuild
            ? "var(--ui-gain)"
            : undefined
      const rightTag = summary.entered
        ? `${percent.format(summary.adoptionBps / 10000)} · ${summary.centers}/${summary.totalSlots}`
        : content.rivalsByRegion[id].length > 0
          ? ui.ops.rivalCount(content.rivalsByRegion[id].length)
          : ui.ops.unentered
      const desc = `${scenario.regions[id]} · ${rightTag}`
      return <g key={id} transform={`translate(${cx} ${cy})`}>
        <Control label={scenario.regions[id]} description={desc} pressed={isSelected} run={() => focusPlace({ kind: "market", id })}>
          <rect className="place-cell" width="244" height="35" rx="3" stroke={stroke} strokeWidth={isSelected ? 1.6 : 1}/>
          <text x="8" y="15.5" fontSize="14.5" fontWeight={isSelected ? "600" : "400"}>
            {summary.syntheticEnabled ? `◈ ${scenario.regions[id]}` : scenario.regions[id]}
          </text>
          <text x="236" y="15.5" textAnchor="end" fontSize="13" fill={summary.syntheticEnabled ? "var(--ui-accent-bright)" : readyToBuild ? "var(--ui-gain)" : "var(--hud-muted)"}>
            {rightTag}
          </text>
          <FactionStackedBar x={8} y={21} width={228} height={8} bar={bar} clipId={`hud-reg-bar-${id}`}/>
        </Control>
      </g>
    })}

    {/* Layer 3: Exposure & Project HUMAN dual risk meters */}
    <RiskProgressBar
      x={218} y={163} width={362}
      label={`${ui.ops.barExposure} · ${content.alertLabel}`}
      valueText={percent.format(content.exposureBps / 10000)}
      bps={content.exposureBps}
      ticks={[0.25, 0.5, 0.75]}
      fill={exposureColor}
      urgent={content.exposureBps >= 5000}
    />
    <RiskProgressBar
      x={600} y={163} width={362}
      label={ui.ops.barHuman}
      valueText={content.humanBps > 0 ? percent.format(content.humanBps / 10000) : ui.humanInactive}
      bps={content.humanBps}
      ticks={[0.25, 0.75]}
      fill={humanColor}
      urgent={content.humanBps >= 5000}
    />
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
        <Glyph name={metric.icon} x={18} y={4} size={38}/>
        <text x="68" y="34" fontSize="24">{metric.label}</text>
        <text x="24" y="77" fontSize="25">{metric.value}</text>
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

export default function Hud({location,place,content,newsItems,newsView,newsItemId,newsDay,openNews,closeNews,decide,zoom,selectedSpeed,manualPaused,paused,night,toggleNight,musicOpen,setMusicOpen,openShortcutsHelp,open,openSetup,focusPlace,setSpeed,onPause,setZoom}:Props) {
  const { locale, ui, percent } = useLanguage()
  const music = useGameSnapshot(state => state.music)
  const shortcuts = useGameSnapshot(state => state.shortcuts)
  const store = useGameStore()
  const keyLabel = (code: string) => formatShortcutKey(code, locale, true)
  const pauseKey = keyLabel(shortcuts.togglePause)
  const speedKeys = [keyLabel(shortcuts.speed1), keyLabel(shortcuts.speed2), keyLabel(shortcuts.speed5)]
  const helpKey = keyLabel(shortcuts.toggleHelp)
  const newsKey = keyLabel(shortcuts.panelNews)
  const worldKey = keyLabel(shortcuts.panelWorld)
  const regionKey = keyLabel(shortcuts.panelRegion)
  const actionsKey = keyLabel(shortcuts.panelActions)
  const researchKey = keyLabel(shortcuts.panelResearch)
  const advisorKey = keyLabel(shortcuts.followAdvisor)
  const musicLabel = useRef<HTMLDivElement>(null)
  const musicGroup = useRef<SVGGElement>(null)
  const [musicPlate, setMusicPlate] = useState(156)
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
  useLayoutEffect(() => {
    const label = musicLabel.current
    const group = musicGroup.current
    if (!label || !group) return
    const bounds = group.getBBox()
    const scale = bounds.width ? group.getBoundingClientRect().width / bounds.width : 0
    if (!scale) return
    const plate = Math.ceil(46 + label.getBoundingClientRect().width / scale + 10)
    setMusicPlate(old => old === plate ? old : plate)
  }, [ui.front.music, musicPlate])
  const unit=hudScale(size.width,size.height)
  const w=size.width/unit, h=size.height/unit
  // Keep the news and menu legible when the full map frame scales down.
  const newsUnit = Math.max(unit, Math.min(.52, size.width / 1030))
  const menuUnit = Math.max(unit, Math.min(.60, size.width / 600))
  const menuWidth = content.kind === "preview" ? 496 : Math.max(586, 408 + musicPlate)
  const stacked = 1010 * newsUnit + menuWidth * menuUnit > size.width
  const menuTop = stacked ? 88 * newsUnit : 0
  const sheetTop = stacked ? menuTop + 115 * menuUnit + 4 : 118 * newsUnit
  const statusHalf = 238 * menuUnit
  const statusMin = 1010 * newsUnit + statusHalf
  const statusMax = size.width - menuWidth * menuUnit - statusHalf
  const statusFits = statusMin <= statusMax
  const statusX = statusFits ? Math.max(statusMin, Math.min(statusMax, size.width / 2)) : size.width / 2
  const statusTop = statusFits ? 0 : menuTop + 90 * menuUnit
  const railX=w-HUD.railRight, railY=h/2-HUD.railAboveMiddle
  const progress=Math.log1p(68*zoom)/Math.log(69)
  const thumb=HUD.railTrackTop+(1-progress)*HUD.railTravel
  return <div className="hud-layer" ref={host}>
    <FrameFrost width={size.width} height={size.height} unit={unit}/>
    <svg className="hud" viewBox={`0 0 ${w} ${h}`} aria-label={ui.mapControls}>
      <Symbols/>
      <defs><pattern id="scanlines" width="4" height="4" patternUnits="userSpaceOnUse"><path d="M0 1h4" stroke="var(--hud-scanline)" strokeWidth=".6" opacity=".28"/></pattern>
        <pattern id="hud-bar-hex" width="8" height="8" patternUnits="userSpaceOnUse">
          <path d="M0 4 4 0 8 4 4 8Z" fill="none" stroke="rgba(255,255,255,.75)" strokeWidth=".9"/>
        </pattern>
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
        <Control label={`${ui.archive} (${newsKey})`} description={ui.allNews} pressed={newsView==="archive"} news run={()=>openNews("archive")}>
          <path d="M16 26h96v92H16Z" fill="transparent"/>
        </Control>
        <SvgKeycap x={24} y={84} label={newsKey}/>
        <Control label={ui.thisDay} pressed={newsView==="day"} news run={()=>openNews("day")}>
          <path d="M910 26h100v52H910Z" fill="transparent"/>
        </Control>
      </g>
      {content.kind === "campaign" && <g transform={`translate(${statusX / unit} ${statusTop / unit}) scale(${menuUnit / unit})`}>
        <g transform="translate(-235 26)">
          <Control label={`${ui.ops.factionStandings} (${worldKey})`} description={content.worldStatusFull} run={() => open("world")}>
            <Glass d="M0 0h470v51H0Z" accent={content.syntheticActive || content.computeAlert}/>
            <SvgKeycap x={12} y={14} label={worldKey}/>
            <text x="242" y="34" textAnchor="middle" fontSize="20" fill={content.computeAlert ? "var(--ui-risk)" : undefined}>{content.worldStatus}</text>
            <text x="454" y="34" textAnchor="end" aria-hidden="true" fontSize="22">›</text>
          </Control>
        </g>
      </g>}
      <g transform={`translate(${w} ${menuTop / unit}) scale(${menuUnit / unit})`}>
        <g transform={`translate(${content.kind === "preview" ? -492 : -400 - musicPlate} 26)`}>
          <Control label={`${ui.shortcuts.title} (${helpKey})`} run={openShortcutsHelp}>
            <Glass d="M0 0h52v51H0Z"/>
            <text x="26" y="34" textAnchor="middle" fontSize="22" fontWeight="700" fontFamily="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace">{helpKey}</text>
          </Control>
        </g>
        {content.kind === "preview" ? <g transform="translate(-430 26)">
          <Control label={night ? ui.switchDay : ui.switchNight} pressed={night} run={toggleNight}>
            <Glass d="M0 0h92v51H0Z"/>
            <text x="46" y="35" textAnchor="middle" fontSize="28">{night ? ui.night : ui.daylight}</text>
          </Control>
        </g> : <g ref={musicGroup} transform={`translate(${-338 - musicPlate} 26)`}>
          <Glass d={`M0 0h${musicPlate}v51H0Z`}/>
          <Control label={ui.front.musicOn} pressed={music.enabled} run={() => store.dispatch({ type: "set-music-enabled", enabled: !music.enabled })}>
            <rect width="44" height="51" fill="transparent"/>
            <path d="M14 16v19l7-3.5L32 38V12L21 18.5z" fill={music.enabled ? "var(--hud-bloom)" : "var(--hud-control-idle)"}/>
          </Control>
          <Control label={ui.front.musicChannel} pressed={musicOpen} run={() => setMusicOpen(open => !open)}>
            <rect x="44" width={musicPlate - 44} height="51" fill="transparent"/>
            <foreignObject x="46" y="8" width={Math.max(musicPlate - 54, 24)} height="36">
              <div className="hud-music-label" ref={musicLabel}>
                <span>{ui.front.music}</span>
                <svg viewBox="0 0 16 10" width="14" height="9" aria-hidden="true"><path d="M1 1.5 8 8l7-6.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/></svg>
              </div>
            </foreignObject>
          </Control>
        </g>}
        <g transform="translate(-326 26)">
          <Control label={`${ui.dateMenu} (Esc)`} run={()=>open("menu")}>
            <Glass d="M0 0h306v51H32L0 18Z"/><text x="30" y="37" fontSize="34">{content.date}</text>
            <path d="M260 4h42v42h-42z M265 9l32 32m0-32-32 32" fill="none" stroke="var(--hud-menu-x)" strokeOpacity=".6" strokeWidth="1.1" filter="url(#edge-glow)"/>
          </Control>
          <Glass d="M90 51h216v38H126Z"/>
          <Control label={`${manualPaused ? ui.resumePlayback : ui.pause} (${pauseKey})`} pressed={manualPaused}
            description={paused && !manualPaused ? ui.automaticallyPaused : undefined} run={() => onPause(!manualPaused)}>
            <rect x="112" y="53" width="38" height="35" fill="transparent"/>
            <g transform="translate(122 61)" fill={paused ? "var(--hud-control-active)" : "var(--hud-control-idle)"}>
              {manualPaused ? <path d="M1 0l17 10L1 20Z"/> : <path d="M1 0h6v20H1zm11 0h6v20h-6z"/>}
            </g>
          </Control>
          {content.speeds.map((n,index)=><Control key={n} label={`${ui.speed(n)} (${speedKeys[index] ?? ""})`} pressed={selectedSpeed===n} run={()=>setSpeed(n)}>
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
        <ResourceMeter x={20} y={h-130} title={ui.newRun} value={content.marketValue} detail={content.factionDetail} icon="token" onOpen={openSetup}/>
        <RegionStrip x={w/2-503} y={h-HUD.regionHeight} location={location} place={place} open={open} content={content}/>
        <ResourceMeter x={w-362} y={h-130} title={ui.world} value={ui.layersShort} detail={ui.climateShort} icon="hexes" research shortcut={worldKey} onOpen={() => open("world")}/>
      </> : <>
        <ResourceMeter x={20} y={h-130} title={ui.action} value={content.token} detail={content.tokenDetail} icon="token" shortcut={actionsKey} onOpen={() => open("actions")}/>
        <CampaignStrip x={w/2-503} y={h-HUD.regionHeight} place={place} location={location} content={content} focusPlace={focusPlace} regionShortcut={regionKey} openDetails={() => open("region")}/>
        <ResourceMeter x={w-362} y={h-130} title={ui.research} value={content.corpus} detail={content.yieldText} icon="flask" research shortcut={researchKey} onOpen={() => open("overview")}/>
      </>}
      <ScreenBezel w={w} h={h}/>
    </svg>
    {content.kind === "campaign" && (
      <button
        type="button"
        className={`hud-advisor${content.advisor.urgent ? " is-urgent" : ""}`}
        style={{ top: statusTop + 82 * menuUnit }}
        onClick={() => open(content.advisor.panel)}
      >
        <span>{content.advisor.text}</span>
        <kbd className="hud-kbd">{advisorKey}</kbd>
      </button>
    )}
    <input className="zoom-rail" type="range" min="0" max="1000" step="1" value={Math.round(progress*1000)}
      style={{left:railX*unit,top:(railY+HUD.railTrackTop)*unit,width:68*unit,height:HUD.railTravel*unit}}
      aria-label={ui.mapZoom} aria-valuetext={percent.format(Math.round(zoom * 100) / 100)} onChange={e=>setZoom(Math.expm1(Number(e.target.value)/1000*Math.log(69))/68)}/>
    <NewsLayer unit={newsUnit} sheetTop={sheetTop} items={newsItems} view={newsView} itemId={newsItemId} day={newsDay} dated={content.kind==="campaign"} open={openNews} close={closeNews} decide={decide}/>
    {musicOpen && content.kind === "campaign" && <>
      <button type="button" className="hud-music-backdrop" aria-label={ui.close} onClick={() => setMusicOpen(false)}/>
      <div className="hud-music" role="listbox" aria-label={ui.front.musicChannel} style={{top: menuTop + 84 * menuUnit, right: 338 * menuUnit, width: Math.max(248 * menuUnit, 220)}}>
        <button type="button" role="option" aria-selected={music.trackId === null}
          onClick={() => store.dispatch({ type: "set-music-track", trackId: null })}>{ui.front.musicAuto}</button>
        {musicCatalog.map(track => <button type="button" key={track.id} role="option" aria-selected={music.trackId === track.id}
          onClick={() => store.dispatch({ type: "set-music-track", trackId: track.id })}>{musicTrackTitle(track, locale)}</button>)}
      </div>
    </>}
  </div>
}
