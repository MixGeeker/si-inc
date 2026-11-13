import { standardScenario } from "../../../../../packages/rules/v0.1/scenario"
import { previewSpeeds, type RunSetup } from "../machine"
import { mapPreview } from "./preview"

export function hudContent(run: RunSetup | null, globalView: boolean) {
  if (run) {
    const { factions, regions, rules } = standardScenario
    return {
      headline: `${factions[run.factionId].name} 进入${regions[run.startRegionId].name}市场`,
      date: "第 0 周", overview: "进化", currencyIcon: "token", balance: rules.initialBtoken,
      research: "0%", speeds: rules.speedMultipliers,
      metrics: [{ icon: "users", label: "普及率", value: "—" }, { icon: "link", label: "依赖率", value: "—" }],
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
