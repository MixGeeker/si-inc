import { weeklyOutcome, type RunState } from "../../../../../packages/game/run.ts"
import { decisions, type DecisionEffect, type DecisionId } from "../../../../../packages/rules/v0.1/events/decisions.ts"
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
  image?: string
  source?: string
  scope?: string
  resultBody?: string
  effect?: DecisionEffect
  resolvedWeek?: number
  followUpWeek?: number
  relatedId?: string
  relatedTitle?: string
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
    const decisionId = entry.content.kind === "decision" ? entry.content.id : undefined
    const definition = decisionId ? decisions[decisionId] : undefined
    const chosen = definition?.choices.find(choice => choice.id === entry.choiceId)
    const parent = entry.sourceInstanceId ? run.events.find(source => source.instanceId === entry.sourceInstanceId) : undefined
    const parentDecisionId = parent?.content.kind === "decision" ? parent.content.id : undefined
    const contextId = decisionId ?? parentDecisionId
    const legacy = run.eventVersion !== 1 && decisionId === "unexpected-coding"
    const text = scenario.events[entry.content.id]
    const choiceText = decisionId && chosen ? scenario.choices[decisionId][chosen.id] : undefined
    const detail = contextId ? scenario.eventDetails[contextId] : undefined
    const hasFollowUp = run.events.some(child => child.sourceInstanceId === entry.instanceId)
    return {
      id: entry.instanceId,
      week: entry.week,
      ...text,
      body: legacy ? ui.narrative.legacyBody : text.body,
      kind: entry.content.kind,
      pending: decisionId !== undefined && entry.choiceId === undefined,
      choiceLabel: legacy && chosen ? (chosen.id === "keep" ? ui.narrative.legacyKeep : ui.narrative.legacyRollback) : choiceText?.label,
      resultBody: !legacy ? choiceText?.result : undefined,
      decisionId,
      instanceId: entry.instanceId,
      image: definition?.image ?? (parentDecisionId ? decisions[parentDecisionId].image : undefined),
      source: legacy ? ui.narrative.legacySource : detail?.source,
      scope: legacy ? ui.narrative.legacyScope : detail?.scope,
      effect: entry.effect,
      resolvedWeek: entry.resolvedWeek,
      followUpWeek: !hasFollowUp && entry.followUpWeek !== undefined && entry.followUpWeek < standardScenario.rules.maxWeeks
        && run.completedWeek < entry.followUpWeek && !weeklyOutcome(run) ? entry.followUpWeek : undefined,
      relatedId: parent?.instanceId,
      relatedTitle: parent ? scenario.events[parent.content.id].title : undefined,
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
