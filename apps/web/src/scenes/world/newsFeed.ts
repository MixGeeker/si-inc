import type { RunState } from "../../../../../packages/game/run.ts"
import { decisions, type DecisionId } from "../../../../../packages/rules/v0.1/events/decisions.ts"
import { standardScenario } from "../../../../../packages/rules/v0.1/scenario.ts"
import { languages, type Language } from "../../i18n/languages.ts"

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

export function campaignNews(run: RunState, { ui, scenario }: Language = languages["zh-CN"]): NewsItem[] {
  const faction = standardScenario.factions[run.setup.factionId]
  const region = scenario.regions[run.setup.startRegionId]
  const opening: NewsItem = {
    id: "opening",
    week: 0,
    ...ui.opening(faction.name, region),
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
      ...scenario.events[entry.content.id],
      kind: entry.content.kind,
      pending: decision && entry.choiceId === undefined,
      choiceLabel: decision && chosen ? scenario.choices[entry.content.id][chosen.id].result : undefined,
      decisionId: decision ? entry.content.id : undefined,
      instanceId: entry.instanceId,
    }
  })]
}

export function previewNews({ ui }: Language = languages["zh-CN"]): NewsItem[] {
  return [{
    id: "preview",
    week: 0,
    title: ui.previewHeadline,
    body: ui.previewReport,
    kind: "bulletin",
    pending: false,
  }]
}

export function weekNews(items: readonly NewsItem[], week: number) {
  return items.filter(item => item.week === week)
}

export function tickerText(item: NewsItem, dated: boolean, { ui }: Language = languages["zh-CN"]) {
  return dated ? `${ui.week(item.week)} · ${item.title}` : item.title
}
