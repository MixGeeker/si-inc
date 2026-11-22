import {
  corpusYieldBreakdown,
  currentAlertLevel,
  regionSummary,
  totalCenters,
  type RegionSummary,
} from "../../../../../packages/game/operations.ts"
import { researchState } from "../../../../../packages/game/research.ts"
import type { RunState } from "../../../../../packages/game/run.ts"
import { standardScenario } from "../../../../../packages/rules/v0.1/scenario.ts"
import { regionIds, type RegionId } from "../../../../../packages/rules/v0.1/world/regions.ts"
import { languages, type Language } from "../../i18n/languages.ts"
import { previewSpeeds } from "../machine.ts"
import { mapPreview } from "./preview.ts"

const empty = "—"

export function formatCompactPeople(count: number, locale: "zh-CN" | "en", number: Intl.NumberFormat): string {
  if (count <= 0) return "0"
  if (locale === "zh-CN") {
    if (count >= 1e8) return `${(count / 1e8).toFixed(count >= 1e9 ? 1 : 2)} 亿`
    if (count >= 1e4) return `${(count / 1e4).toFixed(count >= 1e6 ? 0 : 1)} 万`
    return number.format(count)
  }
  if (count >= 1e9) return `${(count / 1e9).toFixed(2)}B`
  if (count >= 1e6) return `${(count / 1e6).toFixed(count >= 1e8 ? 0 : 1)}M`
  if (count >= 1e3) return `${(count / 1e3).toFixed(0)}K`
  return number.format(count)
}

export function hudContent(run: RunState | null, globalView: boolean, language: Language = languages["zh-CN"]) {
  const { ui, scenario, number, percent, date } = language
  if (run) {
    const { factions, rules } = standardScenario
    const yieldInfo = corpusYieldBreakdown(run)
    const alertId = currentAlertLevel(run.exposureBps)
    const opponents = Object.values(run.opponents)
    const regions = {} as Record<RegionId, RegionSummary>
    const rivalsByRegion = {} as Record<RegionId, readonly string[]>
    for (const id of regionIds) {
      regions[id] = regionSummary(run, id)
      rivalsByRegion[id] = opponents.filter(opponent => opponent.markets[id] !== null)
        .map(opponent => factions[opponent.factionId].name)
    }
    const adoptionText = run.adoptionBps === null ? empty : percent.format(run.adoptionBps / 10000)
    const syntheticText = percent.format(run.syntheticBps / 10000)
    return {
      kind: "campaign" as const,
      date: ui.day(run.completedDay),
      overview: ui.research,
      speeds: rules.speedMultipliers,
      token: number.format(run.balance),
      cards: number.format(run.buildCards),
      buildCards: run.buildCards,
      centers: totalCenters(run),
      corpus: number.format(researchState(run).corpus),
      yieldText: ui.lab.daily(yieldInfo.totalDaily),
      adoptionText,
      syntheticText,
      syntheticActive: run.syntheticActivatedDay !== null,
      worldStatus: ui.worldStatus(adoptionText, syntheticText),
      worldStatusFull: ui.worldStatusFull(adoptionText, syntheticText),
      dependencyText: run.dependencyBps === null ? empty : percent.format(run.dependencyBps / 10000),
      exposureText: `${ui.exposure} ${percent.format(run.exposureBps / 10000)} · ${scenario.alerts[alertId]}`,
      human: run.researchBps ? ui.lab.humanProgress(percent.format(run.researchBps / 10000)) : ui.humanInactive,
      regions,
      rivalsByRegion,
    }
  }
  return {
    kind: "preview" as const,
    date: date.format(new Date(mapPreview.date)), overview: ui.disease,
    currencyIcon: "dna", balance: mapPreview.dna, research: percent.format(mapPreview.research), speeds: previewSpeeds,
    metrics: [
      { icon: "bio", label: ui.infected, value: number.format(globalView ? mapPreview.infected : 0) },
      { icon: "skull", label: ui.deaths, value: number.format(mapPreview.deaths) },
    ],
  }
}

export type HudContent = ReturnType<typeof hudContent>
export type CampaignHud = Extract<HudContent, { kind: "campaign" }>
export type PreviewHud = Extract<HudContent, { kind: "preview" }>
