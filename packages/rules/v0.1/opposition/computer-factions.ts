import type { FactionId } from "../factions/roster.ts"
import type { RegionId } from "../world/regions.ts"

interface ComputerStrategy {
  readonly regions: readonly RegionId[]
  readonly expansionEveryDays: number
  readonly countriesPerDay: number
  readonly reachBps: number
  readonly appealBps: number
  readonly conversionStartDay: number
}

export const computerStrategies = {
  gpt: { regions: ["na", "eu", "as", "sam", "oc", "af"], expansionEveryDays: 12, countriesPerDay: 4,
    reachBps: 9200, appealBps: 10500, conversionStartDay: 42 },
  claude: { regions: ["eu", "na", "oc", "as", "af", "sam"], expansionEveryDays: 14, countriesPerDay: 3,
    reachBps: 8400, appealBps: 11100, conversionStartDay: 48 },
  grok: { regions: ["as", "sam", "na", "eu", "af", "oc"], expansionEveryDays: 10, countriesPerDay: 5,
    reachBps: 10200, appealBps: 10100, conversionStartDay: 36 },
} as const satisfies Record<FactionId, ComputerStrategy>

export const competitionRules = {
  researchCosts: [24, 40, 60, 90, 130],
  reachPerResearchBps: 450,
  appealPerResearchBps: 180,
  migrationBaseCapacityBps: 2200,
  migrationBps: 45,
  subsidizedMigrationBps: 120,
  siphonMigrationBps: 520,
  migrationAppealSpreadBps: 2200,
  migrationSubsidyAppealBps: 2500,
  minimumCoverageForConversionBps: 5500,
  conversionReservePeople: 160_000_000,
  activationExposureBps: 220,
  conversionExposureBps: 18,
  conversionExposurePerPctBps: 32,
} as const
