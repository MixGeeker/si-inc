import { standardScenario } from "../../../../../packages/rules/v0.1/scenario"
import type { RunState } from "../../../../../packages/game/run"
import { previewSpeeds } from "../machine"
import { mapPreview } from "./preview"

function percent(bps: number | null) {
  return bps === null ? "—" : `${bps / 100}%`
}

const empty = "—"

export function hudContent(run: RunState | null, globalView: boolean) {
  if (run) {
    const { factions, regions, rules } = standardScenario
    return {
      kind: "campaign" as const,
      headline: run.events.at(-1)?.content.title ?? `${factions[run.setup.factionId].name} 进入${regions[run.setup.startRegionId].name}市场`,
      date: `第 ${run.completedWeek} 周`,
      overview: "研究",
      speeds: rules.speedMultipliers,
      token: String(run.balance),
      cards: empty,
      corpus: empty,
      yieldText: `日产 ${empty}`,
      human: "Project HUMAN 未启动",
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
    headline: mapPreview.headline, date: mapPreview.date, overview: "疾病概况",
    currencyIcon: "dna", balance: mapPreview.dna, research: mapPreview.research, speeds: previewSpeeds,
    metrics: [
      { icon: "bio", label: "受感染", value: String(globalView ? mapPreview.infected : 0) },
      { icon: "skull", label: "死亡", value: String(mapPreview.deaths) },
    ],
  }
}

export type HudContent = ReturnType<typeof hudContent>
export type CampaignHud = Extract<HudContent, { kind: "campaign" }>
export type PreviewHud = Extract<HudContent, { kind: "preview" }>
