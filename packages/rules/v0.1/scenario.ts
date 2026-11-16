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
  return typeof id === "string" && Object.hasOwn(regions, id)
}

// For former markets spanning continents, use the continent of their original starting camera point.
const previousStarts: Readonly<Record<string, RegionId>> = {
  we: "eu", nordic: "eu", ee: "as", ea: "as", sa: "as", sea: "as", ca: "as",
  mena: "as", ssa: "af", latam: "sam",
}

export function resolveStartRegionId(id: string): RegionId | undefined {
  if (isRegionId(id)) return id
  return typeof id === "string" && Object.hasOwn(previousStarts, id) ? previousStarts[id] : undefined
}
