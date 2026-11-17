import { dailyOutcome, type RunState } from "../../../../../packages/game/run.ts"
import { decisions, type DecisionEffect, type DecisionId } from "../../../../../packages/rules/v0.1/events/decisions.ts"
import { standardScenario } from "../../../../../packages/rules/v0.1/scenario.ts"
import { languages, type Language } from "../../i18n/languages.ts"

export type NewsItem = {
  id: string
  day: number
  title: string
  body: string
  kind: "bulletin" | "news" | "competition" | "decision"
  pending: boolean
  choiceLabel?: string
  decisionId?: DecisionId
  instanceId?: string
  image?: string
  source?: string
  scope?: string
  resultBody?: string
  effect?: DecisionEffect
  resolvedDay?: number
  followUpDay?: number
  relatedId?: string
  relatedTitle?: string
}

export function campaignNews(run: RunState, { ui, scenario }: Language = languages["zh-CN"]): NewsItem[] {
  const faction = standardScenario.factions[run.setup.factionId]
  const region = scenario.regions[run.setup.startRegionId]
  const opening: NewsItem = {
    id: "opening",
    day: 0,
    ...ui.opening(faction.name, region),
    kind: "bulletin",
    pending: false,
  }
  return [opening, ...run.events.map(entry => {
    const decisionId = entry.content.kind === "decision" ? entry.content.id : undefined
    const definition = decisionId ? decisions[decisionId] : undefined
    const chosen = definition?.choices.find(choice => choice.id === entry.choiceId)
    const parent = entry.sourceInstanceId ? run.events.find(source => source.instanceId === entry.sourceInstanceId) : undefined
    const parentDecisionId = parent?.content.kind === "decision" ? parent.content.id : undefined
    const contextId = decisionId ?? parentDecisionId
    const text = scenario.events[entry.content.id]
    const choiceText = decisionId && chosen ? scenario.choices[decisionId][chosen.id] : undefined
    const detail = contextId ? scenario.eventDetails[contextId] : undefined
    const hasFollowUp = run.events.some(child => child.sourceInstanceId === entry.instanceId)
    return {
      id: entry.instanceId,
      day: entry.day,
      ...text,
      kind: entry.content.kind,
      pending: decisionId !== undefined && entry.choiceId === undefined,
      choiceLabel: choiceText?.label,
      resultBody: choiceText?.result,
      decisionId,
      instanceId: entry.instanceId,
      image: definition?.image ?? (parentDecisionId ? decisions[parentDecisionId].image : undefined),
      source: detail?.source,
      scope: detail?.scope,
      effect: entry.effect,
      resolvedDay: entry.resolvedDay,
      followUpDay: !hasFollowUp && entry.followUpDay !== undefined
        && run.completedDay < entry.followUpDay && !dailyOutcome(run) ? entry.followUpDay : undefined,
      relatedId: parent?.instanceId,
      relatedTitle: parent ? scenario.events[parent.content.id].title : undefined,
    }
  })]
}

export function previewNews({ ui }: Language = languages["zh-CN"]): NewsItem[] {
  return [{
    id: "preview",
    day: 0,
    title: ui.previewHeadline,
    body: ui.previewReport,
    kind: "bulletin",
    pending: false,
  }]
}

export function dayNews(items: readonly NewsItem[], day: number) {
  return items.filter(item => item.day === day)
}

export function tickerText(item: NewsItem, dated: boolean, { ui }: Language = languages["zh-CN"]) {
  return dated ? `${ui.day(item.day)} · ${item.title}` : item.title
}
