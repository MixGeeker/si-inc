import { useEffect, useRef, useState, type ReactNode } from "react"
import type { DecisionId } from "../../../../../packages/rules/v0.1/events/decisions"
import type { Language } from "../../i18n/languages"
import { useLanguage } from "../../i18n/useLanguage"
import { SceneDialog } from "../Dialog"
import type { NewsView } from "../machine"
import { tickerText, type NewsItem } from "./newsFeed"
import { EventEffects } from "./EventEffects"
import "./narrative-events.css"

type Props = {
  unit: number
  sheetTop: number
  items: readonly NewsItem[]
  view: NewsView | null
  itemId?: string
  day: number | null
  dated: boolean
  open: (view: NewsView, itemId?: string) => void
  close: () => void
  decide: (id: DecisionId, instanceId: string) => void
}

export function NewsLayer({ unit, sheetTop, items, view, itemId, day, dated, open, close, decide }: Props) {
  const language = useLanguage()
  const { ui } = language
  const latest = Math.max(0, items.length - 1)
  const newestId = items[latest]?.id
  const [cursor, setCursor] = useState(latest)
  const [pass, setPass] = useState(0)
  const [fresh, setFresh] = useState(false)
  const [reduced, setReduced] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches)
  const seen = useRef<string | undefined>(undefined)
  const sheet = useRef<HTMLElement>(null)

  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)")
    const update = () => setReduced(media.matches)
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])

  useEffect(() => {
    setCursor(items.length - 1)
    const first = seen.current === undefined
    seen.current = newestId
    if (first || newestId === undefined) return
    setPass(n => n + 1)
    setFresh(true)
    const timer = setTimeout(() => setFresh(false), 1600)
    return () => clearTimeout(timer)
  }, [newestId, items.length])

  useEffect(() => {
    if (!reduced || items.length < 2) return
    const timer = setInterval(() => setCursor(index => (index + 1) % items.length), 4000)
    return () => clearInterval(timer)
  }, [reduced, items.length])

  useEffect(() => {
    if (view !== "current" && view !== "day") return
    const onPointer = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Element && target.closest("[data-news]")) return
      close()
    }
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close() }
    document.addEventListener("pointerdown", onPointer)
    document.addEventListener("keydown", onKey)
    sheet.current?.focus()
    return () => {
      document.removeEventListener("pointerdown", onPointer)
      document.removeEventListener("keydown", onKey)
    }
  }, [view, itemId, close])

  const current = items[cursor] ?? items[latest]
  if (!current) return null
  const label = tickerText(current, dated, language)
  const docked = view === "current" || view === "day"
  const story = items.find(item => item.id === itemId) ?? items[latest]
  const listed = view === "day" && day !== null ? items.filter(item => item.day === day) : items
  const title = view === "day" ? (day === null ? ui.thisDay : ui.newsDay(day)) : ui.currentNews
  const pending = items.filter(item => item.pending)

  return <>
    <button type="button" data-news="" className={fresh ? "news-ticker fresh" : "news-ticker"}
      style={{ left: 128 * unit, top: 30 * unit, width: 770 * unit, height: 46 * unit, fontSize: Math.max(13, 32 * unit) }}
      aria-label={`${ui.currentNews} · ${label}`} aria-expanded={view === "current"}
      onClick={() => open("current", current.id)}>
      <span key={`${current.id}:${pass}`} className={reduced ? "news-ticker-line still" : "news-ticker-line"}
        onAnimationEnd={() => setCursor(index => {
          const next = (index + 1) % items.length
          if (next === index) setPass(n => n + 1)
          return next
        })}><span>{label}</span></span>
    </button>
    {pending.length > 0 && <button type="button" data-news="" className="news-pending-shortcut"
      style={{ left: 134 * unit, top: 83 * unit, fontSize: Math.max(12, 19 * unit) }}
      onClick={() => open("current", pending[pending.length - 1].id)}>{ui.narrative.pendingCount(pending.length)} <span aria-hidden="true">↗</span></button>}
    {docked && story && <section ref={sheet} data-news="" className="news-sheet" tabIndex={-1} role="region" aria-label={title}
      style={{ left: 16 * unit, top: sheetTop, width: 980 * unit, fontSize: Math.max(14, 18 * unit) }}>
      <header>
        <h2>{title}</h2>
        <button type="button" aria-label={ui.closeNews} onClick={close}>×</button>
      </header>
      {view === "current" ? <article>
        <p className="news-meta">{storyMeta(story, dated, language)}</p>
        <StoryBody item={story} decide={decide} related={id => open("current", id)}/>
      </article> : listed.length === 0 ? <p className="news-empty">{ui.noDayNews}</p> : <ul>
        {listed.map(item => <li key={item.id}>
          <button type="button" onClick={() => open("current", item.id)}>
            <span>{storyMeta(item, dated, language)}</span>
            {item.pending && <span className="narrative-status">{ui.narrative.pending}</span>}
            <strong>{item.title}</strong>
            <small>{item.body}</small>
          </button>
        </li>)}
      </ul>}
    </section>}
  </>
}

function storyMeta(item: NewsItem, dated: boolean, { ui }: Language) {
  return dated ? `${ui.day(item.day)} · ${ui.kinds[item.kind]}` : ui.kinds[item.kind]
}

function StoryBody({ item, decide, related }: {
  item: NewsItem; decide: (id: DecisionId, instanceId: string) => void; related: (id: string) => void
}) {
  const { ui } = useLanguage()
  return <>
    {item.image && <img className="narrative-art news-story-art" src={item.image} alt={item.title} loading="lazy"/>}
    {item.relatedId && <span className="narrative-status follow-up">{ui.narrative.followUp}</span>}
    <h3>{item.title}</h3>
    {(item.source || item.scope) && <div className="narrative-context">
      {item.source && <span>{ui.narrative.source} · {item.source}</span>}
      {item.scope && <span>{ui.narrative.scope} · {item.scope}</span>}
    </div>}
    <p className="narrative-body">{item.body}</p>
    {item.choiceLabel && <section className="narrative-result">
      <p className="news-meta">{ui.selectedChoice(item.choiceLabel)}{item.resolvedDay !== undefined && ` · ${ui.narrative.resolvedAt(ui.day(item.resolvedDay))}`}</p>
      {item.resultBody && <p>{item.resultBody}</p>}
      {item.effect && <div><span className="narrative-result-label">{ui.narrative.result}</span><EventEffects effect={item.effect}/></div>}
    </section>}
    {item.followUpDay !== undefined && <p className="news-meta">{ui.narrative.followUpAt(ui.day(item.followUpDay))}</p>}
    {item.relatedId && <button type="button" className="narrative-related" onClick={() => related(item.relatedId!)}>
      {ui.narrative.related} · {item.relatedTitle}
    </button>}
    {item.pending && item.decisionId && item.instanceId &&
      <button type="button" onClick={() => decide(item.decisionId!, item.instanceId!)}>{ui.resolveDecision}</button>}
  </>
}

export function NewsOverview({ items, itemId, dated, open, close, decide }: Omit<Props, "unit" | "sheetTop" | "view" | "day">) {
  const language = useLanguage()
  const { ui } = language
  const story = itemId ? items.find(item => item.id === itemId) : undefined
  const ordered = [...items].reverse()
  const pending = items.filter(item => item.pending)
  let body: ReactNode
  if (story) body = <article className="news-read">
    <button type="button" className="back" onClick={() => open("archive")}>{ui.backArchive}</button>
    <p className="news-meta">{storyMeta(story, dated, language)}</p>
    <StoryBody item={story} decide={decide} related={id => open("archive", id)}/>
  </article>
  else if (ordered.length === 0) body = <p className="news-empty">{ui.noNews}</p>
  else body = <ul className="news-roll">{ordered.map(item => <li key={item.id}>
    <button type="button" className={item.image ? "news-row with-art" : "news-row"} onClick={() => open("archive", item.id)}>
      {item.image && <img className="news-row-art" src={item.image} alt="" loading="lazy"/>}
      <span className="news-row-copy">
        <span className="news-row-meta">{storyMeta(item, dated, language)}
          {item.pending && <span className="narrative-status">{ui.narrative.pending}</span>}
          {item.choiceLabel && <span className="narrative-status resolved">{ui.narrative.resolved}</span>}
          {item.relatedId && <span className="narrative-status follow-up">{ui.narrative.followUp}</span>}
        </span>
        <strong>{item.title}</strong>
        <small>{item.body}</small>
      </span>
    </button>
  </li>)}</ul>
  return <SceneDialog title={ui.archive} className="news-overview" onBack={close}
    headerDetail={pending.length > 0 ? <span className="narrative-status">{ui.narrative.pendingCount(pending.length)}</span> : undefined}>
    {!story && pending.length > 0 && <div className="narrative-archive-summary">
      <span>{ui.narrative.laterHint}</span>
      <button type="button" onClick={() => open("archive", pending[pending.length - 1].id)}>{ui.narrative.pendingCount(pending.length)} ↗</button>
    </div>}
    {body}
  </SceneDialog>
}
