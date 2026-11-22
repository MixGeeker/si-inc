import type { ContourPopulations, PopulationBucket } from "../../../../../packages/game/population.ts"

export interface PopulationPreview {
  readonly peninsulaCoverage: number
  readonly japanSyntheticShare: number
}

export const initialPopulationPreview: PopulationPreview = { peninsulaCoverage: 53, japanSyntheticShare: 100 }

/** Relative counts for the map preview. Each country has 10,000 sample units. */
export function previewPopulations({ peninsulaCoverage, japanSyntheticShare }: PopulationPreview): ContourPopulations {
  const peninsula: PopulationBucket = { total: 10_000, factions: {
    gpt: { immersed: 20 * peninsulaCoverage, synthetic: 0 },
    claude: { immersed: 30 * peninsulaCoverage, synthetic: 0 },
    grok: { immersed: 50 * peninsulaCoverage, synthetic: 0 },
  } }
  const japanCohort = (share: number) => ({
    immersed: share * (100 - japanSyntheticShare), synthetic: share * japanSyntheticShare,
  })
  return { PRK: peninsula, KOR: peninsula, JPN: { total: 10_000, factions: {
    gpt: japanCohort(50), claude: japanCohort(30), grok: japanCohort(20),
  } } }
}
