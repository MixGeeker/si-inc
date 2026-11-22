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
  gpt: { regions: ["na", "eu", "as", "sam", "oc", "af"], expansionEveryDays: 16, countriesPerDay: 3,
    reachBps: 8250, appealBps: 10400, conversionStartDay: 55 },
  claude: { regions: ["eu", "na", "oc", "as", "af", "sam"], expansionEveryDays: 19, countriesPerDay: 2,
    reachBps: 7450, appealBps: 10900, conversionStartDay: 61 },
  grok: { regions: ["as", "sam", "na", "eu", "af", "oc"], expansionEveryDays: 14, countriesPerDay: 4,
    reachBps: 9200, appealBps: 10000, conversionStartDay: 49 },
} as const satisfies Record<FactionId, ComputerStrategy>

export const competitionRules = {
  researchCosts: [24, 40, 60, 90],
  reachPerResearchBps: 350,
  appealPerResearchBps: 150,
  migrationBaseCapacityBps: 1800,
  migrationBps: 30,
  subsidizedMigrationBps: 90,
  migrationAppealSpreadBps: 2500,
  migrationSubsidyAppealBps: 2500,
  minimumCoverageForConversionBps: 7000,
  conversionReservePeople: 100_000_000,
  activationExposureBps: 160,
  conversionExposureBps: 8,
} as const
