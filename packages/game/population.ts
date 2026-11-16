import { factions, type FactionId } from "../rules/v0.1/factions/roster.ts"

export interface CountryPopulation {
  readonly total: number
  readonly factions: Readonly<Partial<Record<FactionId, {
    readonly immersed: number
    readonly synthetic: number
  }>>>
}

/** Countries without a census are absent. Counts are mutually exclusive. */
export type CountryPopulations = Readonly<Record<string, CountryPopulation>>

export interface PopulationShare {
  readonly faction: FactionId
  readonly synthetic: boolean
  readonly people: number
}

export function populationShares(country: CountryPopulation) {
  if (!country || !Number.isSafeInteger(country.total) || country.total <= 0
    || !country.factions || typeof country.factions !== "object" || Array.isArray(country.factions)) return null
  const shares: PopulationShare[] = []
  let covered = 0
  for (const faction of Object.keys(country.factions)) {
    if (!Object.hasOwn(factions, faction)) return null
    const id = faction as FactionId
    const counts = country.factions[id]
    if (!counts || !Number.isSafeInteger(counts.immersed) || !Number.isSafeInteger(counts.synthetic)
      || counts.immersed < 0 || counts.synthetic < 0) return null
    if (counts.immersed) shares.push({ faction: id, synthetic: false, people: counts.immersed })
    if (counts.synthetic) shares.push({ faction: id, synthetic: true, people: counts.synthetic })
    covered += counts.immersed + counts.synthetic
    if (covered > country.total) return null
  }
  // Faction ownership on the map must not depend on the insertion order of a saved record.
  shares.sort((a, b) => a.faction.localeCompare(b.faction, "en") || Number(a.synthetic) - Number(b.synthetic))
  return covered ? { coverage: covered / country.total, covered, shares } : null
}
