import type { FactionId } from "../factions/roster.ts"
import type { RegionId } from "../world/regions.ts"

interface ComputerStrategy {
  readonly regions: readonly RegionId[]
  readonly expansionEveryDays: number
  readonly reachBps: number
  readonly appealBps: number
  readonly conversionStartDay: number
}

export const computerStrategies = {
  gpt: { regions: ["na", "eu", "as", "sam", "oc", "af"], expansionEveryDays: 16,
    reachBps: 7600, appealBps: 10500, conversionStartDay: 50 },
  claude: { regions: ["eu", "na", "oc", "as", "af", "sam"], expansionEveryDays: 18,
    reachBps: 7000, appealBps: 11100, conversionStartDay: 56 },
  grok: { regions: ["as", "sam", "na", "eu", "af", "oc"], expansionEveryDays: 14,
    reachBps: 8400, appealBps: 10100, conversionStartDay: 44 },
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
