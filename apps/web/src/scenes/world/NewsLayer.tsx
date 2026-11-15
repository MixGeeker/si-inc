import { useEffect, useRef, useState, type ReactNode } from "react"
import type { DecisionId } from "../../../../../packages/rules/v0.1/events/decisions"
import { SceneDialog } from "../Dialog"
import type { NewsView } from "../machine"
import { kindName, tickerText, type NewsItem } from "./newsFeed"

type Props = {
  unit: number
  items: readonly NewsItem[]
  view: NewsView | null
  itemId?: string
  week: number | null
  dated: boolean
  open: (view: NewsView, itemId?: string) => void
  close: () => void
  decide: (id: DecisionId, instanceId: string) => void
}

export function NewsLayer({ unit, items, view, itemId, week, dated, open, close, decide }: Props) {
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
  const label = tickerText(current, dated)
  const docked = view === "current" || view === "week"
  const story = items.find(item => item.id === itemId) ?? items[latest]
  const listed = view === "week" && week !== null ? items.filter(item => item.week === week) : items
  const title = view === "week" ? (week === null ? "本周新闻" : `第 ${week} 周新闻`) : "当前新闻"

  return <>
    <button type="button" data-news="" className={fresh ? "news-ticker fresh" : "news-ticker"}
      style={{ left: 128 * unit, top: 30 * unit, width: 770 * unit, height: 46 * unit, fontSize: 32 * unit }}
      aria-label={`当前新闻，${label}`} aria-expanded={view === "current"}
      onClick={() => open("current", current.id)}>
      <span key={`${current.id}:${pass}`} className={reduced ? "news-ticker-line still" : "news-ticker-line"}
        onAnimationEnd={() => setCursor(index => {
          const next = (index + 1) % items.length
          if (next === index) setPass(n => n + 1)
          return next
        })}>{label}</span>
    </button>
    {docked && story && <section ref={sheet} data-news="" className="news-sheet" tabIndex={-1} role="region" aria-label={title}
      style={{ left: 16 * unit, top: 118 * unit, width: 980 * unit, fontSize: Math.max(14, 18 * unit) }}>
      <header>
        <h2>{title}</h2>
        <button type="button" aria-label="关闭新闻" onClick={close}>×</button>
      </header>
      {view === "current" ? <article>
        <p className="news-meta">{dated ? `第 ${story.week} 周 · ${kindName(story.kind)}` : kindName(story.kind)}</p>
        <h3>{story.title}</h3>
        <p>{story.body}</p>
        {story.choiceLabel && <p className="news-meta">已选择 · {story.choiceLabel}</p>}
        {story.pending && story.decisionId && story.instanceId &&
          <button type="button" onClick={() => decide(story.decisionId!, story.instanceId!)}>处理突变</button>}
      </article> : listed.length === 0 ? <p className="news-empty">本周还没有新闻</p> : <ul>
        {listed.map(item => <li key={item.id}>
          <button type="button" onClick={() => open("current", item.id)}>
            <span>{dated ? `第 ${item.week} 周` : kindName(item.kind)}{dated ? ` · ${kindName(item.kind)}` : ""}</span>
            <strong>{item.title}</strong>
            <small>{item.body}</small>
          </button>
        </li>)}
      </ul>}
    </section>}
  </>
}

function storyMeta(item: NewsItem, dated: boolean) {
  return dated ? `第 ${item.week} 周 · ${kindName(item.kind)}` : kindName(item.kind)
}

function StoryBody({ item, decide }: { item: NewsItem; decide: (id: DecisionId, instanceId: string) => void }) {
  return <>
    <h3>{item.title}</h3>
    <p>{item.body}</p>
    {item.choiceLabel && <p className="news-meta">已选择 · {item.choiceLabel}</p>}
    {item.pending && item.decisionId && item.instanceId &&
      <button type="button" onClick={() => decide(item.decisionId!, item.instanceId!)}>处理突变</button>}
  </>
}

export function NewsOverview({ items, itemId, dated, open, close, decide }: Omit<Props, "unit" | "view" | "week">) {
  const story = itemId ? items.find(item => item.id === itemId) : undefined
  const ordered = [...items].reverse()
  let body: ReactNode
  if (story) body = <article className="news-read">
    <button type="button" className="back" onClick={() => open("archive")}>返回总览</button>
    <p className="news-meta">{storyMeta(story, dated)}</p>
    <StoryBody item={story} decide={decide}/>
  </article>
  else if (ordered.length === 0) body = <p className="news-empty">还没有新闻</p>
  else body = <ul className="news-roll">{ordered.map(item => <li key={item.id}>
    <button type="button" onClick={() => open("archive", item.id)}>
      <span>{storyMeta(item, dated)}</span>
      <strong>{item.title}</strong>
      <small>{item.body}</small>
    </button>
  </li>)}</ul>
  return <SceneDialog title="新闻总览" className="news-overview" onBack={close}>{body}</SceneDialog>
}
