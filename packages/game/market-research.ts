import { marketEffects, type MarketEffect, type MarketMeasure, type ResearchMarketContext } from "../rules/v0.1/evolution/market-effects.ts"
import { researchNode, type AttributeId, type SkillId } from "../rules/v0.1/evolution/trees.ts"
import { attributesForLevels, type SkillLevels } from "./research.ts"

const attributeForMeasure: Partial<Record<MarketMeasure, AttributeId>> = {
  reach: "spread", adoptionWeight: "appeal", revenue: "profit", exposure: "danger",
}

function applies(effect: MarketEffect, context: ResearchMarketContext) {
  if (effect.channels && (!context.channel || !effect.channels.includes(context.channel))) return false
  if (effect.facts && !effect.facts.every(fact => context.facts?.includes(fact))) return false
  const bound = effect.threshold
  if (!bound) return true
  const value = context.metrics?.[bound.metric]
  return value !== undefined && value >= (bound.min ?? 0) && value <= (bound.max ?? Infinity)
    && value < (bound.below ?? Infinity)
}

/** Evaluate one observed cohort. Callers apply population, service and spending caps after all multipliers. */
export function marketResearchValue(levels: SkillLevels, measure: MarketMeasure, base: number, context: ResearchMarketContext = {}): number {
  if (measure === "conversionCapacity" && !context.facts?.includes("activePlan")) return 0
  const referral = measure === "remixContacts" || measure === "seatReferrals"
  let factor = referral ? 0 : 1
  for (const [id, level] of Object.entries(levels)) {
    const effect = marketEffects[id as SkillId]
    if (!level || !effect || (effect.measure !== measure && effect.also !== measure) || !applies(effect, context)) continue
    const part = effect.percent / 100
    if (referral) factor += part
    else factor *= effect.perLevel === "compound" ? (1 + part) ** level : 1 + part * (effect.perLevel === "additive" ? level : 1)
  }
  const attribute = attributeForMeasure[measure]
  if (attribute) factor *= attributesForLevels(levels)[attribute] / 100
  const value = base * factor
  if (["adoptionWeight","revenue","exposure","prRelief","ordinaryCorpus","syntheticCorpus"].includes(measure)) return value
  return Math.floor(value + Number.EPSILON * Math.max(1,value) * 4)
}

/** The inspector evaluates the same rules as settlement using conditions explicitly labelled as a preview. */
export function researchExample(levels: SkillLevels, skill: SkillId) {
  const effect = marketEffects[skill]
  if (!effect) return null
  const bound = effect.threshold
  const context: ResearchMarketContext = { channel: effect.channels?.[0], facts: effect.facts,
    metrics: bound ? { [bound.metric]: bound.min ?? 0 } : {} }
  const base = effect.measure === "reviewFee" ? 1 : effect.measure === "preserved" ? 50 : 100
  const current = marketResearchValue(levels, effect.measure, base, context)
  const upgraded = levels[skill] && !researchNode(skill).skill.repeatCostStep ? levels : { ...levels, [skill]: (levels[skill] ?? 0) + 1 }
  return { measure: effect.measure, base, current, next: marketResearchValue(upgraded, effect.measure, base, context) }
}
