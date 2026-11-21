import { useEffect, useRef, useState } from "react"
import { researchStatus, type ResearchStatus } from "../../../../../packages/game/research"
import type { RunState } from "../../../../../packages/game/run"
import type { ResearchBuild } from "../../../../../packages/rules/v0.1/evolution/builds"
import { researchNode, type ResearchNode, type Skill, type SkillId } from "../../../../../packages/rules/v0.1/evolution/trees"
import { useLanguage } from "../../i18n/useLanguage"
import { TechnologyGlyph } from "./researchArt"
import { bridges, cellCenter, cellHeight, cells, hive, researchTier, tierNumerals } from "./researchLayout"

export const treeIcons = { transmission: "lab-branch", behavior: "lab-chat", capabilities: "lab-chip" }
export const attributeIcons = { spread: "lab-branch", appeal: "users", profit: "token", danger: "lab-danger" }
export function LabIcon({ name }: { name: string }) {
  return <svg className="lab-icon" aria-hidden="true"><use href={`#${name}`}/></svg>
}

const outline = "M-49 0-24.5-42.44H24.5L49 0 24.5 42.44H-24.5Z"
const lattice = "M0 43.301H25L50 0H100L125 43.301H150M25 43.301 50 86.603H100L125 43.301"
const viewBox = "-50 -43.3013 100 86.6026"

function SurfaceDefs() {
  return <defs>
    <linearGradient id="hive-glass" x2=".74" y2="1">
      <stop style={{ stopColor: "var(--hive-glass-0)" }} stopOpacity=".82"/><stop offset=".27" style={{ stopColor: "var(--hive-glass-1)" }} stopOpacity=".9"/>
      <stop offset=".68" style={{ stopColor: "var(--hive-glass-2)" }} stopOpacity=".92"/><stop offset="1" style={{ stopColor: "var(--hive-glass-3)" }} stopOpacity=".95"/>
    </linearGradient>
    <linearGradient id="hive-ready" x2=".58" y2="1">
      <stop style={{ stopColor: "var(--hive-ready-0)" }}/><stop offset=".24" style={{ stopColor: "var(--hive-ready-1)" }}/><stop offset=".73" style={{ stopColor: "var(--hive-ready-2)" }}/><stop offset="1" style={{ stopColor: "var(--hive-ready-3)" }}/>
    </linearGradient>
    <linearGradient id="hive-complete" x1=".15" y1="0" x2=".75" y2="1">
      <stop style={{ stopColor: "var(--hive-complete-0)" }}/><stop offset=".31" style={{ stopColor: "var(--hive-complete-1)" }}/><stop offset=".69" style={{ stopColor: "var(--hive-complete-2)" }}/><stop offset="1" style={{ stopColor: "var(--hive-complete-3)" }}/>
    </linearGradient>
    <linearGradient id="hive-working" x1=".15" y1="0" x2=".75" y2="1">
      <stop style={{ stopColor: "var(--hive-working-0)" }}/><stop offset=".32" style={{ stopColor: "var(--hive-working-1)" }}/><stop offset=".72" style={{ stopColor: "var(--hive-working-2)" }}/><stop offset="1" style={{ stopColor: "var(--hive-working-3)" }}/>
    </linearGradient>
    <linearGradient id="hive-closed" x2=".8" y2="1">
      <stop style={{ stopColor: "var(--hive-closed-0)" }}/><stop offset=".6" style={{ stopColor: "var(--hive-closed-1)" }}/><stop offset="1" style={{ stopColor: "var(--hive-closed-2)" }}/>
    </linearGradient>
    <radialGradient id="hive-bridge" cx=".47" cy=".5" r=".61">
      <stop style={{ stopColor: "var(--hive-bridge-0)" }} stopOpacity=".08"/><stop offset=".6" style={{ stopColor: "var(--hive-bridge-1)" }} stopOpacity=".24"/>
      <stop offset=".84" style={{ stopColor: "var(--hive-bridge-2)" }} stopOpacity=".5"/><stop offset="1" style={{ stopColor: "var(--hive-bridge-3)" }} stopOpacity=".85"/>
    </radialGradient>
    <linearGradient id="hive-facet" x1="0" y1="0" x2=".8" y2="1">
      <stop stopColor="#f1faff" stopOpacity=".42"/><stop offset=".42" stopColor="#f3faff" stopOpacity=".06"/>
      <stop offset="1" stopColor="#040814" stopOpacity=".48"/>
    </linearGradient>
    <linearGradient id="hive-texture-fade" x2=".25" y2="1">
      <stop stopColor="white"/><stop offset=".75" stopColor="#555"/><stop offset="1" stopColor="black"/>
    </linearGradient>
    <mask id="hive-texture-mask" maskUnits="userSpaceOnUse" x="-50" y="-44" width="100" height="88">
      <rect x="-50" y="-44" width="100" height="88" fill="url(#hive-texture-fade)"/>
    </mask>
    <pattern id="hive-mesh" x={hive.originX} y={hive.originY} width={3 * hive.radius} height={cellHeight}
      patternUnits="userSpaceOnUse" viewBox="0 0 150 86.603">
      <path d={lattice} fill="none" stroke="var(--hive-mesh)" strokeWidth="1.05" opacity=".17"/>
    </pattern>
    <pattern id="hive-microcells" width="15" height="8.6603" patternUnits="userSpaceOnUse" viewBox="0 0 150 86.603">
      <path d={lattice} fill="none" stroke="#f2faff" strokeWidth="4.5"/>
    </pattern>
    <filter id="hive-shadow" x="-5%" y="-10%" width="110%" height="125%"><feGaussianBlur stdDeviation="2.6"/></filter>
  </defs>
}

function Substrate() {
  return <g aria-hidden="true" pointerEvents="none">
    <g fill="none" stroke="var(--hive-substrate)" strokeWidth="1" opacity=".18">
      <path d="M-160 97H-14l35-61H159l23-38h71M-160 103H-10l35-61h137l23-38h64"/>
      <path d="M610 490v-30l34-51h139l40-68h162M620 490v-29l30-46h138l40-68h159"/>
      <circle cx="253" cy="-2" r="2"/><circle cx="249" cy="4" r="2"/>
    </g>
    <rect x="-2000" y="-1200" width="4880" height="2782" fill="url(#hive-mesh)"/>
  </g>
}

export function TechHex({ skill, status }: { skill: Skill; status: ResearchStatus }) {
  return <svg className={`tech-hex is-${status}`} viewBox={viewBox} aria-hidden="true">
    <path className="hex-surface" d={outline}/>
    <path className="hex-texture" d={outline} fill="url(#hive-microcells)" mask="url(#hive-texture-mask)"/>
    <path className="hex-facet" fill="url(#hive-facet)" fillRule="evenodd"
      d={outline + "M-43.6 0-21.8-37.76H21.8L43.6 0 21.8 37.76H-21.8Z"}/>
    <path className="hex-reflection" d="m-47.6-.8 23.9-40.7H24"/>
    <path className="hex-bottom-edge" d="m47.7 1-23.8 40.4H-23.7"/>
    <TechnologyGlyph id={skill.id}/>
    <text className="hex-numeral" x="20.5" y="32.8" textAnchor="middle">{tierNumerals[researchTier(skill)]}</text>
    {skill.repeatCostStep && <use className="hex-loop" href="#lab-cycle" x="-25.5" y="-32.5" width="12" height="12"/>}
    {skill.dangerBps && <use className="hex-risk" href="#lab-danger" x="15" y="-33" width="12" height="12"/>}
    {status === "active" && <path className="hex-running" d="m-21 33 3-4h4l-3 4zm7 0 3-4h4l-3 4zm7 0 3-4h4l-3 4Z"/>}
    {status === "excluded" && <path className="hex-forbidden" d="m-22 33 7-7"/>}
    <path className="hex-relation" d="m-46 0 5-8.7m82 17.4L46 0"/>
    <path className="hex-selection" d="M-47 0-23.5-40.7H23.5L47 0 23.5 40.7H-23.5Z"/>
    <path className="hex-selection-inset" d="m-42 0 6-10.4m11.5-20 3.5-6h42l3.5 6M42 0l-6 10.4m-11.5 20-3.5 6h-42l-3.5-6"/>
  </svg>
}

export function TechMap({ run, node, build, select }: {
  run: RunState; node: ResearchNode; build?: ResearchBuild; select: (id: SkillId) => void
}) {
  const { scenario, ui: { lab } } = useLanguage()
  const scroll = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState<SkillId | null>(null)
  const route = build && new Set<SkillId>(build.path)
  const hint = hovered && researchNode(hovered).tree.id === node.tree.id ? hovered : null
  const tip = hint && cellCenter(cells[hint])
  useEffect(() => {
    const area = scroll.current
    const svg = area?.querySelector("svg")
    if (!area || !svg) return
    function reveal() {
      if (!area || !svg) return
      const scale = Math.min(svg.clientWidth / hive.width, svg.clientHeight / hive.height)
      const { x, y } = cellCenter(cells[node.skill.id])
      const px = (svg.clientWidth - hive.width * scale) / 2 + x * scale
      const py = (svg.clientHeight - hive.height * scale) / 2 + y * scale
      if (px - hive.radius * scale < area.scrollLeft || px + hive.radius * scale > area.scrollLeft + area.clientWidth)
        area.scrollLeft = px - area.clientWidth / 2
      if (py - cellHeight * scale / 2 < area.scrollTop || py + cellHeight * scale / 2 > area.scrollTop + area.clientHeight)
        area.scrollTop = py - area.clientHeight / 2
      area.classList.toggle("can-pan", area.scrollWidth > area.clientWidth + 1 || area.scrollHeight > area.clientHeight + 1)
    }
    reveal()
    const observer = new ResizeObserver(reveal)
    observer.observe(area)
    return () => observer.disconnect()
  }, [node.skill.id])
  return <div className="lab-graph-scroll" ref={scroll}>
    <svg className="lab-graph" viewBox={`0 0 ${hive.width} ${hive.height}`} role="group" aria-label={scenario.trees[node.tree.id] + " · " + lab.tree}>
      <SurfaceDefs/><Substrate/>
      <g aria-hidden="true" pointerEvents="none" fill="#051510" opacity=".64" filter="url(#hive-shadow)">
        {node.tree.skills.map(skill => {
          const { x, y } = cellCenter(cells[skill.id])
          return <path key={skill.id} d={outline} transform={`translate(${x} ${y + 3}) scale(${hive.radius / 50})`}
            opacity={route && !route.has(skill.id) ? .35 : 1}/>
        })}
      </g>
      <g aria-hidden="true" pointerEvents="none">{bridges[node.tree.id].map(({ from, to, via }) => {
        const inspected = from === node.skill.id || to === node.skill.id
        const dim = route && !(route.has(from) && route.has(to))
        return <g key={from + to} className={`hive-bridge${inspected ? " inspected" : ""}${dim ? " off-route" : ""}`}>
          {via.map(cell => {
            const { x, y } = cellCenter(cell)
            return <g key={cell.join(",")} transform={`translate(${x} ${y}) scale(${hive.radius / 50})`}>
              <path className="bridge-lens" d={outline}/>
              <path className="bridge-glint" d="m-47.5 0 23.8-41H24m23.5 41L23.7 41H-24"/>
            </g>
          })}
        </g>
      })}</g>
      {node.tree.skills.map(skill => {
        const { x, y } = cellCenter(cells[skill.id]), status = researchStatus(run, researchNode(skill.id))
        const related = skill.requires.some(group => group.includes(node.skill.id)) || node.skill.requires.some(group => group.includes(skill.id))
        const label = [scenario.skills[skill.id], lab.tier(researchTier(skill)), lab.status[status],
          skill.repeatCostStep && lab.repeatable, skill.dangerBps && lab.dangerous].filter(Boolean).join(" · ")
        return <foreignObject key={skill.id} x={x - hive.radius} y={y - cellHeight / 2}
          width={2 * hive.radius} height={cellHeight} className="lab-station">
          <button type="button" className={`lab-node is-${status}${related ? " related" : ""}${route && !route.has(skill.id) ? " off-route" : ""}`}
            data-skill={skill.id} aria-label={label} aria-pressed={node.skill.id === skill.id}
            onPointerEnter={e => { if (e.pointerType === "mouse") setHovered(skill.id) }} onPointerLeave={() => setHovered(null)}
            onFocus={e => { if (e.currentTarget.matches(":focus-visible")) setHovered(skill.id) }} onBlur={() => setHovered(null)}
            onClick={() => { setHovered(null); select(skill.id) }}>
            <TechHex skill={skill} status={status}/>
          </button>
        </foreignObject>
      })}
      {hint && tip && <foreignObject aria-hidden="true" className="hive-tooltip" x={tip.x - 155}
        y={tip.y > cellHeight ? tip.y - cellHeight / 2 - 27 : tip.y + cellHeight / 2 + 2} width="310" height="26">
        <span>{scenario.skills[hint]}<small>{lab.status[researchStatus(run, researchNode(hint))]}</small></span>
      </foreignObject>}
    </svg>
  </div>
}
