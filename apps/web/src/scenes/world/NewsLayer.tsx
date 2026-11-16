import { useEffect, useRef, useState, type ReactNode } from "react"
import type { DecisionId } from "../../../../../packages/rules/v0.1/events/decisions"
import type { Language } from "../../i18n/languages"
import { useLanguage } from "../../i18n/useLanguage"
import { SceneDialog } from "../Dialog"
import type { NewsView } from "../machine"
import { tickerText, type NewsItem } from "./newsFeed"

type Props = {
  unit: number
  sheetTop: number
  items: readonly NewsItem[]
  view: NewsView | null
  itemId?: string
  week: number | null
  dated: boolean
  open: (view: NewsView, itemId?: string) => void
  close: () => void
  decide: (id: DecisionId, instanceId: string) => void
}

export function NewsLayer({ unit, sheetTop, items, view, itemId, week, dated, open, close, decide }: Props) {
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
    if (view !== "current" && view !== "week") return
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
  const docked = view === "current" || view === "week"
  const story = items.find(item => item.id === itemId) ?? items[latest]
  const listed = view === "week" && week !== null ? items.filter(item => item.week === week) : items
  const title = view === "week" ? (week === null ? ui.thisWeek : ui.newsWeek(week)) : ui.currentNews

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
    {docked && story && <section ref={sheet} data-news="" className="news-sheet" tabIndex={-1} role="region" aria-label={title}
      style={{ left: 16 * unit, top: sheetTop, width: 980 * unit, fontSize: Math.max(14, 18 * unit) }}>
      <header>
        <h2>{title}</h2>
        <button type="button" aria-label={ui.closeNews} onClick={close}>×</button>
      </header>
      {view === "current" ? <article>
        <p className="news-meta">{storyMeta(story, dated, language)}</p>
        <StoryBody item={story} decide={decide}/>
      </article> : listed.length === 0 ? <p className="news-empty">{ui.noWeekNews}</p> : <ul>
        {listed.map(item => <li key={item.id}>
          <button type="button" onClick={() => open("current", item.id)}>
            <span>{storyMeta(item, dated, language)}</span>
            <strong>{item.title}</strong>
            <small>{item.body}</small>
          </button>
        </li>)}
      </ul>}
    </section>}
  </>
}

function storyMeta(item: NewsItem, dated: boolean, { ui }: Language) {
  return dated ? `${ui.week(item.week)} · ${ui.kinds[item.kind]}` : ui.kinds[item.kind]
}

function StoryBody({ item, decide }: { item: NewsItem; decide: (id: DecisionId, instanceId: string) => void }) {
  const { ui } = useLanguage()
  return <>
    <h3>{item.title}</h3>
    <p>{item.body}</p>
    {item.choiceLabel && <p className="news-meta">{ui.selectedChoice(item.choiceLabel)}</p>}
    {item.pending && item.decisionId && item.instanceId &&
      <button type="button" onClick={() => decide(item.decisionId!, item.instanceId!)}>{ui.handleMutation}</button>}
  </>
}

export function NewsOverview({ items, itemId, dated, open, close, decide }: Omit<Props, "unit" | "sheetTop" | "view" | "week">) {
  const language = useLanguage()
  const { ui } = language
  const story = itemId ? items.find(item => item.id === itemId) : undefined
  const ordered = [...items].reverse()
  let body: ReactNode
  if (story) body = <article className="news-read">
    <button type="button" className="back" onClick={() => open("archive")}>{ui.backArchive}</button>
    <p className="news-meta">{storyMeta(story, dated, language)}</p>
    <StoryBody item={story} decide={decide}/>
  </article>
  else if (ordered.length === 0) body = <p className="news-empty">{ui.noNews}</p>
  else body = <ul className="news-roll">{ordered.map(item => <li key={item.id}>
    <button type="button" onClick={() => open("archive", item.id)}>
      <span>{storyMeta(item, dated, language)}</span>
      <strong>{item.title}</strong>
      <small>{item.body}</small>
    </button>
  </li>)}</ul>
  return <SceneDialog title={ui.archive} className="news-overview" onBack={close}>{body}</SceneDialog>
}
