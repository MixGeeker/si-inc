import { standardScenario } from "../../../../../packages/rules/v0.1/scenario"
import type { RunState } from "../../../../../packages/game/run"
import { previewSpeeds } from "../machine"
import { mapPreview } from "./preview"

function percent(bps: number | null) {
  return bps === null ? "—" : `${bps / 100}%`
}

export function hudContent(run: RunState | null, globalView: boolean) {
  if (run) {
    const { factions, regions, rules } = standardScenario
    return {
      headline: run.events.at(-1)?.content.title ?? `${factions[run.setup.factionId].name} 进入${regions[run.setup.startRegionId].name}市场`,
      date: `第 ${run.completedWeek} 周`, overview: "进化", currencyIcon: "token", balance: run.balance,
      research: percent(run.researchBps), speeds: rules.speedMultipliers,
      metrics: [{ icon: "users", label: "普及率", value: percent(run.adoptionBps) }, { icon: "link", label: "依赖率", value: percent(run.dependencyBps) }],
    }
  }
  return {
    headline: mapPreview.headline, date: mapPreview.date, overview: "疾病概况",
    currencyIcon: "dna", balance: mapPreview.dna, research: mapPreview.research, speeds: previewSpeeds,
    metrics: [
      { icon: "bio", label: "受感染", value: String(globalView ? mapPreview.infected : 0) },
      { icon: "skull", label: "死亡", value: String(mapPreview.deaths) },
    ],
  }
}

export type HudContent = ReturnType<typeof hudContent>
