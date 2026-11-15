import type { RunState } from "../../../../../packages/game/run.ts"
import { decisions, type DecisionId } from "../../../../../packages/rules/v0.1/events/decisions.ts"
import { standardScenario } from "../../../../../packages/rules/v0.1/scenario.ts"
import { mapPreview } from "./preview.ts"

export type NewsItem = {
  id: string
  week: number
  title: string
  body: string
  kind: "bulletin" | "news" | "competition" | "decision"
  pending: boolean
  choiceLabel?: string
  decisionId?: DecisionId
  instanceId?: string
}

const kindLabel = { bulletin: "开局", news: "新闻", competition: "竞争", decision: "突变" } as const

export function kindName(kind: NewsItem["kind"]) {
  return kindLabel[kind]
}

export function campaignNews(run: RunState): NewsItem[] {
  const faction = standardScenario.factions[run.setup.factionId]
  const region = standardScenario.regions[run.setup.startRegionId]
  const opening: NewsItem = {
    id: "opening",
    week: 0,
    title: `${faction.name} 进入${region.name}市场`,
    body: `${faction.name} 已进入${region.name}市场。`,
    kind: "bulletin",
    pending: false,
  }
  return [opening, ...run.events.map(entry => {
    const decision = entry.content.kind === "decision"
    const chosen = decision && entry.choiceId
      ? decisions[entry.content.id].choices.find(choice => choice.id === entry.choiceId)
      : undefined
    return {
      id: entry.instanceId,
      week: entry.week,
      title: entry.content.title,
      body: entry.content.body,
      kind: entry.content.kind,
      pending: decision && entry.choiceId === undefined,
      choiceLabel: chosen?.label,
      decisionId: decision ? entry.content.id : undefined,
      instanceId: entry.instanceId,
    }
  })]
}

export function previewNews(): NewsItem[] {
  return [{
    id: "preview",
    week: 0,
    title: mapPreview.headline,
    body: mapPreview.report,
    kind: "bulletin",
    pending: false,
  }]
}

export function weekNews(items: readonly NewsItem[], week: number) {
  return items.filter(item => item.week === week)
}

export function tickerText(item: NewsItem, dated: boolean) {
  return dated ? `第 ${item.week} 周 · ${item.title}` : item.title
}
