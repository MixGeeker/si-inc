import rules from "./standard.json" with { type: "json" }
import { factions, type FactionId } from "./factions/roster.ts"
import { regions, type RegionId } from "./world/regions.ts"

// Only the standard preset has authored parameters in this rules version.
export const standardScenario = {
  difficulty: { id: "standard", name: "标准" },
  factions,
  regions,
  rules,
} as const

export function isFactionId(id: string): id is FactionId {
  return Object.hasOwn(factions, id) && rules.factionIds.includes(id)
}

export function isRegionId(id: string): id is RegionId {
  return Object.hasOwn(regions, id)
}
