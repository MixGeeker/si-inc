import { factions, type FactionId } from "../rules/v0.1/factions/roster.ts"
import type { RegionId } from "../rules/v0.1/world/regions.ts"

export interface PopulationBucket {
  readonly total: number
  readonly factions: Readonly<Partial<Record<FactionId, {
    readonly immersed: number
    readonly synthetic: number
  }>>>
}

/** Continental population distribution used by both simulation and map projection. */
export type RegionPopulations = Readonly<Partial<Record<RegionId, PopulationBucket>>>

/** Map-contour population lookup keyed by SVG country ID (rendering layer only). */
export type ContourPopulations = Readonly<Record<string, PopulationBucket>>

export interface PopulationShare {
  readonly faction: FactionId
  readonly synthetic: boolean
  readonly people: number
}

export function populationShares(bucket: PopulationBucket | undefined) {
  if (!bucket || !Number.isSafeInteger(bucket.total) || bucket.total <= 0
    || !bucket.factions || typeof bucket.factions !== "object" || Array.isArray(bucket.factions)) return null
  const shares: PopulationShare[] = []
  let covered = 0
  for (const faction of Object.keys(bucket.factions)) {
    if (!Object.hasOwn(factions, faction)) return null
    const id = faction as FactionId
    const counts = bucket.factions[id]
    if (!counts || !Number.isSafeInteger(counts.immersed) || !Number.isSafeInteger(counts.synthetic)
      || counts.immersed < 0 || counts.synthetic < 0) return null
    if (counts.immersed) shares.push({ faction: id, synthetic: false, people: counts.immersed })
    if (counts.synthetic) shares.push({ faction: id, synthetic: true, people: counts.synthetic })
    covered += counts.immersed + counts.synthetic
    if (covered > bucket.total) return null
  }
  // Faction ownership on the map must not depend on the insertion order of a saved record.
  shares.sort((a, b) => a.faction.localeCompare(b.faction, "en") || Number(a.synthetic) - Number(b.synthetic))
  return covered ? { coverage: covered / bucket.total, covered, shares } : null
}
