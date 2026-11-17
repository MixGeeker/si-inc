import { languages, type Language } from "../../i18n/languages"
import { standardScenario } from "../../../../../packages/rules/v0.1/scenario"
import type { RunState } from "../../../../../packages/game/run"
import { researchState, dailyCorpus } from "../../../../../packages/game/research"
import { previewSpeeds } from "../machine"
import { mapPreview } from "./preview"

const empty = "—"

export function hudContent(run: RunState | null, globalView: boolean, language: Language = languages["zh-CN"]) {
  const { ui, number, percent, date } = language
  if (run) {
    const { factions, rules } = standardScenario
    return {
      kind: "campaign" as const,
      date: ui.day(run.completedDay),
      overview: ui.research,
      speeds: rules.speedMultipliers,
      token: number.format(run.balance),
      cards: empty,
      corpus: number.format(researchState(run).corpus),
      yieldText: ui.lab.daily(dailyCorpus(run)),
      human: run.researchBps ? ui.lab.humanProgress(percent.format(run.researchBps / 10000)) : ui.humanInactive,
      factions: Object.entries(factions).map(([id, faction]) => ({
        name: faction.name,
        player: id === run.setup.factionId,
        immersed: empty,
        synths: empty,
      })),
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
