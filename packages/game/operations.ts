import { btoken } from "../rules/v0.1/economy/btoken.ts"
import type { Outcome } from "../rules/v0.1/endings/standard.ts"
import { actions, type ActionId } from "../rules/v0.1/evolution/actions.ts"
import { channelTechnologies } from "../rules/v0.1/evolution/market-effects.ts"
import { researchNode, type SkillId } from "../rules/v0.1/evolution/trees.ts"
import { factions, type FactionAbilityId, type FactionId } from "../rules/v0.1/factions/roster.ts"
import { competitionRules } from "../rules/v0.1/opposition/computer-factions.ts"
import { projectHuman } from "../rules/v0.1/opposition/project-human.ts"
import { phases } from "../rules/v0.1/progression/phases.ts"
import { isRegionId, standardScenario } from "../rules/v0.1/scenario.ts"
import {
  globalPlayablePopulation,
  regionCapacity,
  regionIds,
  regionSpec,
  slotUnlockLimit,
  type RegionId,
  type RegionSpec,
} from "../rules/v0.1/world/regions.ts"
import {
  beginComputerDay,
  finishComputerDay,
  initialComputerFactions,
  regionOccupiedCenters,
  regionOpenPopulation,
  regionSeedUsers,
  settleRegionCompetition,
  tierForAdoption,
  type ComputerFactions,
  type UnlockTier,
} from "./competition.ts"
import { marketResearchValue, type ResearchMarketContext } from "./market-research.ts"
import type { RegionPopulations } from "./population.ts"
import { activeResearchComputeLoad, attributesForLevels, dailyCorpus, researchLevels, type SkillLevels } from "./research.ts"
import type { RunSetup, RunState } from "./run.ts"

export interface MarketRunState {
  readonly enteredDay: number | null
  readonly users: number
  readonly synthetics: number
  readonly newlyConverted: number
  readonly prevUsers: number
  readonly retainedDays: number
  readonly centers: number
  readonly unlockedTier: UnlockTier
  readonly carry: 0 | 1
  readonly dependencyBps: number
  readonly subsidyStartedDay: number | null
  readonly subsidyUntilDay: number
  readonly milestonesClaimed: readonly number[]
  readonly apiActiveDays: number
  readonly orgSeats: number
  readonly prevNewSocialUsers: number
  readonly prevOrgSeatReferrals: number
  readonly syntheticEnabled: boolean
  readonly syntheticActivatedDay: number | null
}

export interface ActionCooldowns {
  readonly publicStatementUntilDay: number
  readonly protocolRebuildUntilDay: number
  readonly factionAbilityUntilDay: number
  readonly factionEffectUntilDay: number
}

export type MapBubbleKind = "traffic" | "corpus" | "alert"

export interface MapBubble {
  readonly id: string
  readonly kind: MapBubbleKind
  readonly regionId: RegionId
  /** Deterministic index into `regions[regionId].bubblePoints` for on-land placement. */
  readonly anchorIndex: number
  readonly spawnedDay: number
  readonly expiresDay: number
  /** traffic: scaled tokens; corpus: corpus amount; alert: exposure relief bps */
  readonly value: number
}

export type ComputeStatus = "optimal" | "heavy" | "overloaded" | "critical"

export interface ComputePressure {
  readonly supply: number
  readonly baseSupply: number
  readonly centerSupply: number
  readonly inferenceDemand: number
  readonly researchDemand: number
  readonly totalDemand: number
  readonly loadBps: number
  readonly status: ComputeStatus
  readonly researchWorkPerDay: number
  readonly spreadMulBps: number
  readonly conversionMulBps: number
  readonly extraExposureBps: number
}

export type AlertLevelId = typeof projectHuman.alertLevels[number]["id"]
export type PhaseId = typeof phases[number]["id"]

export type ActionAvailability =
  | "available"
  | "ended"
  | "tokens"
  | "cards"
  | "locked"
  | "full"
  | "cooldown"
  | "no-exposure"
  | "no-human"
  | "no-users"
  | "already-entered"
  | "not-entered"
  | "invalid"

export interface RegionSummary {
  readonly regionId: RegionId
  readonly entered: boolean
  readonly enteredDay: number | null
  readonly population: number
  readonly immersed: number
  readonly synthetics: number
  readonly covered: number
  readonly adoptionBps: number
  readonly syntheticBps: number
  readonly dependencyBps: number
  readonly centers: number
  readonly occupiedCenters: number
  readonly unlockedLimit: number
  readonly totalSlots: number
  readonly buildable: boolean
  readonly subsidyDaysLeft: number
  readonly syntheticEnabled: boolean
  readonly milestonesClaimed: readonly number[]
}

export interface RegionBuildOption {
  readonly region: RegionSpec
  readonly isOrigin: boolean
  readonly entered: boolean
  readonly users: number
  readonly synthetics: number
  readonly adoptionBps: number
  readonly syntheticBps: number
  readonly centers: number
  readonly occupiedCenters: number
  readonly unlockedLimit: number
  readonly unlockedTier: UnlockTier
  readonly localCapacity: number
  readonly status: ActionAvailability
}

export interface CorpusYieldBreakdown {
  readonly fixed: number
  readonly populationCapped: number
  readonly populationUncapped: number
  readonly throughputCap: number
  readonly totalDaily: number
  readonly rawPeopleCorpus: number
}

export interface VictoryProgress {
  readonly globalSyntheticBps: number
  readonly globalSyntheticTargetBps: number
  readonly playerSyntheticBps: number
  readonly playerSyntheticTargetBps: number
  readonly playerHasMajority: boolean
  readonly totalSynthetics: number
  readonly globalPopulation: number
  readonly coveredRegions: number
}

export interface RunRating {
  readonly stars: 1 | 2 | 3 | 4 | 5
  readonly score: number
  readonly speedScore: number
  readonly shareScore: number
  readonly completedDay: number
  readonly playerSyntheticBps: number
}

const { rules } = standardScenario
const opRules = rules.operations
const humanRules = rules.projectHuman
const computeRules = rules.compute
const bubbleRules = rules.bubbles
const MAX_TOKEN_SCALE = 120_000_000_000

const emptyMarket: MarketRunState = {
  enteredDay: null,
  users: 0,
  synthetics: 0,
  newlyConverted: 0,
  prevUsers: 0,
  retainedDays: 0,
  centers: 0,
  unlockedTier: 0,
  carry: 0,
  dependencyBps: opRules.initialDependencyBps,
  subsidyStartedDay: null,
  subsidyUntilDay: -1,
  milestonesClaimed: [],
  apiActiveDays: 0,
  orgSeats: 0,
  prevNewSocialUsers: 0,
  prevOrgSeatReferrals: 0,
  syntheticEnabled: false,
  syntheticActivatedDay: null,
}

export const defaultCooldowns: ActionCooldowns = {
  publicStatementUntilDay: -1,
  protocolRebuildUntilDay: -1,
  factionAbilityUntilDay: -1,
  factionEffectUntilDay: -1,
}

/** Round inflated token figures to clean, legible numbers while staying exact for small values. */
export function roundNiceToken(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 0
  if (raw < 100) return Math.max(1, Math.round(raw))
  if (raw < 1000) return Math.round(raw / 10) * 10
  if (raw < 10_000) return Math.round(raw / 50) * 50
  if (raw < 100_000) return Math.round(raw / 500) * 500
  const digits = Math.floor(Math.log10(raw))
  const unit = 10 ** Math.max(2, digits - 2)
  return Math.round(raw / unit) * unit
}

function nextBubbleRandom(state: number): number {
  return (Math.imul(state, 1664525) + 1013904223) >>> 0
}

export function tokenScaleOf(run: RunState): number {
  return Math.max(1, run.tokenScale ?? 1)
}

export function computeTargetTokenScale(
  adoptionBps: number,
  globalSyntheticBps: number,
  playerSyntheticBps: number,
  centers: number,
  completedTechs: number,
): number {
  const userFrac = Math.min(1, Math.max(0, adoptionBps) / 10000)
  const synthFrac = Math.min(1, Math.max(0, globalSyntheticBps) / 10000)
  const playerSynthFrac = Math.min(1, Math.max(0, playerSyntheticBps) / 10000)
  if (userFrac < 0.0025 && centers === 0 && completedTechs === 0 && synthFrac === 0) return 1
  const infraFrac = Math.min(1, centers * 0.09 + completedTechs * 0.025)
  const stage = Math.min(
    1,
    Math.pow(userFrac, 0.56) * 0.44
      + Math.pow(synthFrac, 0.62) * 0.32
      + playerSynthFrac * 0.14
      + infraFrac * 0.16,
  )
  if (stage <= 0.02) return 1
  const raw = Math.pow(10, stage * 11.15)
  return Math.min(MAX_TOKEN_SCALE, Math.max(1, roundNiceToken(raw)))
}

export function buildCardCost(run: RunState): number {
  const scale = tokenScaleOf(run)
  const centers = totalCenters(run)
  const centerFactor = 1 + centers * 0.14
  return Math.max(1, roundNiceToken(btoken.buildCardCost * centerFactor * scale))
}

export function newMarketReward(run: RunState): number {
  return Math.max(1, roundNiceToken(btoken.newMarketReward * tokenScaleOf(run)))
}

export function milestoneRewardForRun(run: RunState, baseReward: number): number {
  return Math.max(1, roundNiceToken(baseReward * tokenScaleOf(run)))
}

export function isPlayerFactionAbility(run: RunState, abilityId: string): abilityId is FactionAbilityId {
  return factions[run.setup.factionId].ability.id === abilityId
}

function actionById(id: string) {
  return actions.find(action => action.id === id)
}

export function actionCost(run: RunState, abilityId: string): number {
  const scale = tokenScaleOf(run)
  const faction = factions[run.setup.factionId]
  if (abilityId === faction.ability.id) {
    return Math.max(1, roundNiceToken(faction.ability.cost * scale))
  }
  const action = actionById(abilityId)
  if (!action) return 0
  const expansionMul = (action.id === "cross-border-cloud" || action.id === "market-subsidy")
    ? faction.passives.expansionCostMulBps / 10000
    : 1
  return Math.max(1, roundNiceToken(action.cost * expansionMul * scale))
}

export function factionAbilityEffectDaysLeft(run: RunState): number {
  return Math.max(0, run.actionCooldowns.factionEffectUntilDay - run.completedDay)
}

export function factionAbilityCooldownLeft(run: RunState): number {
  return Math.max(0, run.actionCooldowns.factionAbilityUntilDay - run.completedDay)
}

export function hallucinationWindfallTokens(run: RunState): number {
  const scale = tokenScaleOf(run)
  const passives = factions[run.setup.factionId].passives
  return Math.max(1, roundNiceToken(13 * passives.tokenYieldMulBps / 10000 * scale))
}

export function conversionPackTokens(run: RunState, units: number): number {
  return Math.max(1, roundNiceToken(units * tokenScaleOf(run)))
}

export function conversionPeopleForTokens(run: RunState, tokens: number): number {
  if (!Number.isSafeInteger(tokens) || tokens <= 0) return 0
  const scale = tokenScaleOf(run)
  return Math.max(1, Math.floor(tokens * syntheticPeoplePerToken(run) / scale))
}

export function computePressure(run: RunState, overrideResearchLoad?: number): ComputePressure {
  const levels = researchLevels(run)
  const centers = totalCenters(run)
  const passives = factions[run.setup.factionId].passives
  let supplyMulBps = passives.computeEfficiencyBps
  if ((levels["inference-efficiency"] ?? 0) > 0) supplyMulBps += 1500
  const hasBalancedContinent = (levels["load-balancing"] ?? 0) > 0
    && regionIds.some(id => run.markets[id].centers >= 2)
  if (hasBalancedContinent) supplyMulBps += 1800

  const baseSupply = computeRules.baseSupply
  const centerSupply = Math.round(centers * computeRules.centerSupply * supplyMulBps / 10000)
  const supply = Math.max(1, baseSupply + centerSupply)

  const ordinaryShare = totalImmersed(run) / globalPlayablePopulation
  const synthShare = totalPlayerSynthetics(run) / globalPlayablePopulation
  let inferMul = 1
  if ((levels.quantization ?? 0) > 0) inferMul *= 0.82
  if ((levels["request-cache"] ?? 0) > 0) inferMul *= 0.88
  let edgeOffload = 1
  if ((levels["edge-deployment"] ?? 0) > 0) edgeOffload *= 0.80
  if ((levels["offline-bundles"] ?? 0) > 0) edgeOffload *= 0.85

  const ordinaryLoad = ordinaryShare * computeRules.ordinaryLoadAtFull * edgeOffload
  const syntheticLoad = synthShare * computeRules.syntheticLoadAtFull
  const inferenceDemand = Math.round((ordinaryLoad + syntheticLoad) * inferMul)
  const researchDemand = overrideResearchLoad !== undefined ? Math.max(0, overrideResearchLoad) : activeResearchComputeLoad(run)
  const totalDemand = inferenceDemand + researchDemand
  const loadBps = Math.round(totalDemand * 10000 / supply)

  let status: ComputeStatus = "optimal"
  let researchWorkPerDay = 100
  let spreadMulBps = 10000
  let conversionMulBps = 10000
  let extraExposureBps = 0

  if (loadBps > computeRules.criticalLoadBps) {
    status = "critical"
    researchWorkPerDay = computeRules.criticalResearchWork
    spreadMulBps = computeRules.criticalSpreadBps
    conversionMulBps = computeRules.criticalConversionBps
    extraExposureBps = computeRules.criticalExposureBps
  } else if (loadBps > computeRules.overloadBps) {
    status = "overloaded"
    researchWorkPerDay = computeRules.overloadResearchWork
    spreadMulBps = computeRules.overloadSpreadBps
    conversionMulBps = computeRules.overloadConversionBps
    extraExposureBps = computeRules.overloadExposureBps
  } else if (loadBps >= computeRules.heavyLoadBps) {
    status = "heavy"
  }

  return {
    supply,
    baseSupply,
    centerSupply,
    inferenceDemand,
    researchDemand,
    totalDemand,
    loadBps,
    status,
    researchWorkPerDay,
    spreadMulBps,
    conversionMulBps,
    extraExposureBps,
  }
}

/** Preview cluster load when `skillId` is the active slot-1 study in the serial queue. */
export function computePressureWithSkill(run: RunState, skillId: SkillId): ComputePressure {
  return computePressure(run, researchNode(skillId).skill.computeLoad)
}

export function estimatedDailyTokenIncome(run: RunState): number {
  const scale = tokenScaleOf(run)
  const levels = researchLevels(run)
  const attrs = attributesForLevels(levels)
  const passives = factions[run.setup.factionId].passives
  const adoptionBps = run.adoptionBps ?? 0
  const synthBps = run.playerSyntheticBps
  const effectiveBps = Math.min(25000, adoptionBps + synthBps * 2)
  const baseUnits = 0.85 + effectiveBps / 2400 + totalCenters(run) * 0.28
  const profitMul = Math.max(0.4, attrs.profit / rules.research.attributeBaseline)
  const raw = baseUnits * profitMul * (passives.tokenYieldMulBps / 10000) * scale
  return Math.max(1, roundNiceToken(raw))
}

export function buildRegionPopulations(
  markets: Readonly<Record<RegionId, MarketRunState>>,
  factionId: FactionId,
  opponents: ComputerFactions,
): RegionPopulations {
  const result: Partial<Record<RegionId, { total: number; factions: Partial<Record<FactionId, { immersed: number; synthetic: number }>> }>> = {}
  for (const regionId of regionIds) {
    const spec = regionSpec(regionId)
    const factionsMap: Partial<Record<FactionId, { immersed: number; synthetic: number }>> = {}
    const player = markets[regionId]
    if (player && (player.users > 0 || player.synthetics > 0)) {
      factionsMap[factionId] = { immersed: player.users, synthetic: player.synthetics }
    }
    for (const rival of Object.values(opponents)) {
      const state = rival.regions[regionId]
      if (state && (state.users > 0 || state.synthetics > 0)) {
        factionsMap[rival.factionId] = { immersed: state.users, synthetic: state.synthetics }
      }
    }
    if (Object.keys(factionsMap).length > 0) {
      result[regionId] = { total: spec.population, factions: factionsMap }
    }
  }
  return result
}

export function computeGlobalMetrics(markets: Readonly<Record<RegionId, MarketRunState>>, opponents: ComputerFactions) {
  let totalUsers = 0
  let totalSynthetics = 0
  let weightedDep = 0
  for (const state of Object.values(markets)) {
    if (state.users <= 0 && state.synthetics <= 0) continue
    totalUsers += state.users
    totalSynthetics += state.synthetics
    weightedDep += state.users * state.dependencyBps + state.synthetics * 10000
  }
  const totalCovered = totalUsers + totalSynthetics
  const adoptionBps = Math.min(10000, Math.floor(totalCovered * 10000 / globalPlayablePopulation))
  let globalSynthetics = totalSynthetics
  for (const faction of Object.values(opponents)) {
    for (const region of Object.values(faction.regions)) globalSynthetics += region.synthetics
  }
  const syntheticBps = globalSynthetics >= globalPlayablePopulation
    ? 10000
    : Math.min(9999, Math.floor(globalSynthetics * 10000 / globalPlayablePopulation))
  const playerSyntheticBps = Math.min(10000, Math.floor(totalSynthetics * 10000 / globalPlayablePopulation))
  const dependencyBps = totalCovered > 0 ? Math.min(10000, Math.round(weightedDep / totalCovered)) : 0
  return { totalUsers, totalSynthetics, totalCovered, adoptionBps, syntheticBps, playerSyntheticBps, dependencyBps }
}

export function initialOperations(setup: RunSetup, seed = 0) {
  const originSpec = regionSpec(setup.startRegionId)
  const markets = Object.fromEntries(
    regionIds.map(id => [
      id,
      id === setup.startRegionId
        ? {
          ...emptyMarket,
          enteredDay: 0,
          users: regionSeedUsers(originSpec, true),
          unlockedTier: 3 as UnlockTier,
        }
        : { ...emptyMarket },
    ]),
  ) as Record<RegionId, MarketRunState>
  const opponents = initialComputerFactions(setup)
  const { adoptionBps, syntheticBps, playerSyntheticBps, dependencyBps } = computeGlobalMetrics(markets, opponents)
  return {
    exposureBps: 0,
    buildCards: 0,
    tokenScale: 1,
    lifetimeTokens: rules.initialBtoken,
    markets,
    opponents,
    regionPopulations: buildRegionPopulations(markets, setup.factionId, opponents),
    adoptionBps,
    dependencyBps,
    syntheticBps,
    playerSyntheticBps,
    conversionBudgetPeople: 0,
    syntheticActivatedDay: null as number | null,
    corpusRemainder: 0,
    crossRegionProgress: 0,
    actionCooldowns: defaultCooldowns,
    bubbles: [] as readonly MapBubble[],
    bubbleRandomState: ((seed ^ 0x5bd1e995) >>> 0) || 1,
  }
}

export function isOriginRegion(run: RunState, regionId: RegionId): boolean {
  return run.setup.startRegionId === regionId
}

export function regionUnlockLimit(run: RunState, regionId: RegionId): number {
  const spec = regionSpec(regionId)
  if (isOriginRegion(run, regionId)) return spec.slots
  const market = run.markets[regionId]
  if (market.enteredDay === null) return 0
  return slotUnlockLimit(spec.slots, market.unlockedTier)
}

export function totalCenters(run: RunState): number {
  let sum = 0
  for (const id of regionIds) sum += run.markets[id].centers
  return sum
}

export function regionCenters(run: RunState, regionId: RegionId): number {
  return run.markets[regionId].centers
}

export function totalImmersed(run: RunState): number {
  let sum = 0
  for (const id of regionIds) sum += run.markets[id].users
  return sum
}

export function totalPlayerSynthetics(run: RunState): number {
  let sum = 0
  for (const id of regionIds) sum += run.markets[id].synthetics
  return sum
}

export function hasPlayerSyntheticMajority(run: RunState): boolean {
  return totalPlayerSynthetics(run) * 10000 > globalPlayablePopulation * rules.standardVictory.minPlayerSyntheticShareBps
}

export function totalSynthetics(run: RunState): number {
  let sum = totalPlayerSynthetics(run)
  for (const faction of Object.values(run.opponents)) {
    for (const state of Object.values(faction.regions)) sum += state.synthetics
  }
  return sum
}

export function factionStandings(run: RunState, regionId?: RegionId) {
  const player = { factionId: run.setup.factionId, balance: run.balance }
  const rivals = Object.values(run.opponents)
  const rows = [
    {
      factionId: player.factionId,
      isPlayer: true,
      balance: player.balance,
      immersed: regionId ? run.markets[regionId].users : totalImmersed(run),
      synthetics: regionId ? run.markets[regionId].synthetics : totalPlayerSynthetics(run),
      centers: regionId ? run.markets[regionId].centers : totalCenters(run),
    },
    ...rivals.map(rival => {
      let immersed = 0
      let synthetics = 0
      let centers = 0
      if (regionId) {
        const s = rival.regions[regionId]
        if (s) { immersed = s.users; synthetics = s.synthetics; centers = s.centers }
      } else {
        for (const s of Object.values(rival.regions)) {
          immersed += s.users
          synthetics += s.synthetics
          centers += s.centers
        }
      }
      return { factionId: rival.factionId, isPlayer: false, balance: rival.balance, immersed, synthetics, centers }
    }),
  ]
  return rows
}

export function currentAlertLevel(exposureBps: number): AlertLevelId {
  let active: AlertLevelId = projectHuman.alertLevels[0].id
  for (const level of projectHuman.alertLevels) {
    if (exposureBps >= level.minExposureBps) active = level.id
  }
  return active
}

export function currentPhase(adoptionBps: number): PhaseId {
  let active: PhaseId = phases[0].id
  for (const phase of phases) {
    if (adoptionBps >= phase.minAdoptionBps) active = phase.id
  }
  return active
}

export function publicStatementReliefBps(run: RunState): number {
  return Math.round(marketResearchValue(researchLevels(run), "prRelief", opRules.prBaseReliefBps))
}

/** Conversion quota granted per 1 token funded, scaled by completed synthetic technologies. */
export function syntheticPeoplePerToken(run: RunState): number {
  const levels = researchLevels(run)
  let factor = 1
  if ((levels["identity-registry"] ?? 0) > 0) factor *= 1.15
  if ((levels["synthetic-interface"] ?? 0) > 0) factor *= 1.2
  if ((levels["full-delegation"] ?? 0) > 0) factor *= 1.25
  if ((levels["batch-conversion"] ?? 0) > 0) factor *= 1.5
  return Math.round(opRules.syntheticTokenPeople * factor)
}

export function syntheticActivationExposureBps(run: RunState): number {
  return Math.max(0, Math.round(marketResearchValue(researchLevels(run), "exposure", opRules.syntheticActivationExposureBps, {
    facts: ["activatingPlan"],
  })))
}

function capabilityCompletedLevels(levels: SkillLevels): number {
  let total = 0
  for (const [id, level] of Object.entries(levels)) {
    if (!level) continue
    if (researchNode(id)?.tree.id === "capabilities") total += level
  }
  return total
}

function behaviorCompletedLevels(levels: SkillLevels): number {
  let total = 0
  for (const [id, level] of Object.entries(levels)) {
    if (!level) continue
    if (researchNode(id)?.tree.id === "behavior") total += level
  }
  return total
}

function localRegionCapacity(spec: RegionSpec, centers: number, levels: SkillLevels): number {
  const hasEdge = (levels["edge-deployment"] ?? 0) > 0
  const centerCap = centers > 0
    ? marketResearchValue(levels, "centerCapacity", centers * spec.slotCapacity, {
      metrics: { localCenters: centers, continentalCenters: centers },
    })
    : 0
  const edgeCap = hasEdge
    ? marketResearchValue(levels, "edgeCapacity", Math.round(spec.population * opRules.edgeBaseShareBps / 10000), {
      metrics: { localCenters: centers },
    })
    : 0
  return centerCap + edgeCap
}

export function regionRawCorpus(state: MarketRunState, levels: SkillLevels): number {
  let output = 0
  if (state.users > 0) {
    const retained = state.retainedDays >= 2 ? Math.min(state.users, state.prevUsers) : 0
    const fresh = state.users - retained
    const retainedOutput = retained > 0
      ? marketResearchValue(levels, "ordinaryCorpus", retained, { metrics: { daysRetained: state.retainedDays } })
      : 0
    output += fresh + retainedOutput
  }
  if (state.synthetics > 0) {
    const newSynths = Math.min(state.synthetics, state.newlyConverted)
    const veteranSynths = state.synthetics - newSynths
    const mult = opRules.syntheticCorpusMultiplier
    if (veteranSynths > 0) {
      output += marketResearchValue(levels, "syntheticCorpus", veteranSynths * mult)
    }
    if (newSynths > 0) {
      output += marketResearchValue(levels, "syntheticCorpus", newSynths * mult, { facts: ["firstSyntheticDay"] })
    }
  }
  return Math.round(output)
}

export function regionAdoptionBps(run: RunState, regionId: RegionId): number {
  const spec = regionSpec(regionId)
  const market = run.markets[regionId]
  const covered = market.users + market.synthetics
  return spec.population > 0 ? Math.min(10000, Math.floor(covered * 10000 / spec.population)) : 0
}

export function corpusYieldBreakdown(run: RunState): CorpusYieldBreakdown {
  const levels = researchLevels(run)
  const fixed = dailyCorpus(run)
  let rawPeopleCorpus = 0
  let totalCovered = 0
  let enteredSumBps = 0
  let enteredCount = 0
  for (const id of regionIds) {
    const state = run.markets[id]
    if (state.users > 0 || state.synthetics > 0) {
      totalCovered += state.users + state.synthetics
      rawPeopleCorpus += regionRawCorpus(state, levels)
    }
    if (state.enteredDay !== null) {
      enteredCount++
      enteredSumBps += regionAdoptionBps(run, id)
    }
  }
  const avgEnteredBps = enteredCount > 0 ? enteredSumBps / enteredCount : 0
  const globalBps = run.adoptionBps ?? 0
  const effectiveBps = avgEnteredBps * 0.4 + globalBps * 0.6
  const qualityFactor = totalCovered > 0 ? rawPeopleCorpus / totalCovered : 1
  const uncapped = effectiveBps / 10000 * opRules.corpusFlywheelMaxDaily * qualityFactor
  const throughputCap = opRules.corpusThroughputBase
    + totalCenters(run) * opRules.corpusThroughputPerCenter
    + capabilityCompletedLevels(levels) * opRules.corpusThroughputPerCapability
  const capped = Math.min(throughputCap, uncapped)
  const populationCapped = Math.floor((Math.round(capped * 100) + run.corpusRemainder) / 100)
  return {
    fixed,
    populationCapped,
    populationUncapped: Math.round(uncapped * 10) / 10,
    throughputCap,
    totalDaily: fixed + populationCapped,
    rawPeopleCorpus,
  }
}

export function victoryProgress(run: RunState): VictoryProgress {
  const goal = rules.standardVictory
  const synths = totalSynthetics(run)
  let coveredRegions = 0
  for (const id of regionIds) {
    if (run.markets[id].enteredDay !== null) coveredRegions++
  }
  return {
    globalSyntheticBps: run.syntheticBps,
    globalSyntheticTargetBps: goal.minGlobalSyntheticBps,
    playerSyntheticBps: run.playerSyntheticBps,
    playerSyntheticTargetBps: goal.minPlayerSyntheticShareBps,
    playerHasMajority: hasPlayerSyntheticMajority(run),
    totalSynthetics: synths,
    globalPopulation: globalPlayablePopulation,
    coveredRegions,
  }
}

export function isRunEnded(run: RunState): boolean {
  return run.researchBps >= humanRules.completionBps || run.syntheticBps >= rules.standardVictory.minGlobalSyntheticBps
}

export function calculateRunRating(run: RunState, outcome: Outcome | "withdrawn"): RunRating | null {
  if (outcome !== "ai-victory") return null
  const speedScore = Math.max(0, Math.min(60, Math.round(60 - Math.max(0, run.completedDay - 80) * 0.6)))
  const shareScore = Math.max(0, Math.min(40, Math.round(Math.max(0, run.playerSyntheticBps - 5000) / 5000 * 40)))
  const score = speedScore + shareScore
  const stars: 1 | 2 | 3 | 4 | 5 = score >= 90 ? 5 : score >= 76 ? 4 : score >= 62 ? 3 : score >= 48 ? 2 : 1
  return {
    stars,
    score,
    speedScore,
    shareScore,
    completedDay: run.completedDay,
    playerSyntheticBps: run.playerSyntheticBps,
  }
}

export function canBuyBuildCard(run: RunState): ActionAvailability {
  if (isRunEnded(run)) return "ended"
  const cost = buildCardCost(run)
  if (!Number.isSafeInteger(run.balance) || run.balance < cost) return "tokens"
  if (!Number.isSafeInteger(run.buildCards) || run.buildCards >= Number.MAX_SAFE_INTEGER) return "invalid"
  return "available"
}

export function canBuildDataCenter(run: RunState, regionId: string): ActionAvailability {
  if (isRunEnded(run)) return "ended"
  if (!isRegionId(regionId)) return "invalid"
  const spec = regionSpec(regionId)
  const market = run.markets[regionId]
  if (market.enteredDay === null) return "not-entered"
  if (regionOccupiedCenters(run, regionId) >= spec.slots) return "full"
  const limit = regionUnlockLimit(run, regionId)
  if (market.centers >= limit) return "locked"
  if (run.buildCards < 1) return "cards"
  return "available"
}

export function canFundConversion(run: RunState, tokens: number): ActionAvailability {
  if (isRunEnded(run)) return "ended"
  if (!Number.isSafeInteger(tokens) || tokens <= 0) return "invalid"
  if (!Number.isSafeInteger(run.balance) || run.balance < tokens) return "tokens"
  const gain = conversionPeopleForTokens(run, tokens)
  if (!Number.isSafeInteger(gain) || gain <= 0 || run.conversionBudgetPeople > Number.MAX_SAFE_INTEGER - gain) return "invalid"
  return "available"
}

export function canToggleSynthetic(run: RunState, regionId: string, enabled: boolean): ActionAvailability {
  if (isRunEnded(run)) return "ended"
  if (!isRegionId(regionId) || typeof enabled !== "boolean") return "invalid"
  const market = run.markets[regionId]
  if (market.enteredDay === null) return "not-entered"
  if (market.syntheticEnabled === enabled) return "invalid"
  if (enabled && market.users <= 0) return "no-users"
  return "available"
}

export function canCollectBubble(run: RunState, bubbleId: string): ActionAvailability {
  if (isRunEnded(run)) return "ended"
  const bubble = run.bubbles.find(entry => entry.id === bubbleId)
  if (!bubble || bubble.expiresDay <= run.completedDay) return "invalid"
  return "available"
}

export function canUseAction(run: RunState, abilityId: string, targetRegionId?: string): ActionAvailability {
  if (isRunEnded(run)) return "ended"
  if (isPlayerFactionAbility(run, abilityId)) {
    if (targetRegionId !== undefined) return "invalid"
    if (run.completedDay < run.actionCooldowns.factionAbilityUntilDay) return "cooldown"
    const cost = actionCost(run, abilityId)
    return Number.isSafeInteger(run.balance) && run.balance >= cost ? "available" : "tokens"
  }
  const action = actionById(abilityId)
  if (!action) return "invalid"
  const cost = actionCost(run, action.id)

  if (action.id === "public-statement") {
    if (targetRegionId !== undefined) return "invalid"
    if (run.exposureBps <= 0) return "no-exposure"
    if (run.completedDay < run.actionCooldowns.publicStatementUntilDay) return "cooldown"
    return Number.isSafeInteger(run.balance) && run.balance >= cost ? "available" : "tokens"
  }
  if (action.id === "protocol-rebuild") {
    if (targetRegionId !== undefined) return "invalid"
    if (run.researchBps <= 0) return "no-human"
    if (run.completedDay < run.actionCooldowns.protocolRebuildUntilDay) return "cooldown"
    return Number.isSafeInteger(run.balance) && run.balance >= cost ? "available" : "tokens"
  }
  if (!targetRegionId || !isRegionId(targetRegionId)) return "invalid"
  const market = run.markets[targetRegionId]
  if (action.id === "cross-border-cloud") {
    if (market.enteredDay !== null) return "already-entered"
    if (!Number.isSafeInteger(run.balance) || run.balance < cost) return "tokens"
    const reward = newMarketReward(run)
    if (run.balance - cost > Number.MAX_SAFE_INTEGER - reward) return "invalid"
    return "available"
  }
  if (action.id === "market-subsidy") {
    if (market.enteredDay === null) return "not-entered"
    return Number.isSafeInteger(run.balance) && run.balance >= cost ? "available" : "tokens"
  }
  return "invalid"
}

export function regionSummary(run: RunState, regionId: RegionId): RegionSummary {
  const spec = regionSpec(regionId)
  const market = run.markets[regionId]
  const covered = market.users + market.synthetics
  const status = canBuildDataCenter(run, regionId)
  return {
    regionId,
    entered: market.enteredDay !== null,
    enteredDay: market.enteredDay,
    population: spec.population,
    immersed: market.users,
    synthetics: market.synthetics,
    covered,
    adoptionBps: spec.population > 0 ? Math.min(10000, Math.floor(covered * 10000 / spec.population)) : 0,
    syntheticBps: spec.population > 0
      ? (market.synthetics >= spec.population ? 10000 : Math.min(9999, Math.floor(market.synthetics * 10000 / spec.population)))
      : 0,
    dependencyBps: covered > 0 ? market.dependencyBps : 0,
    centers: market.centers,
    occupiedCenters: regionOccupiedCenters(run, regionId),
    unlockedLimit: regionUnlockLimit(run, regionId),
    totalSlots: regionCapacity(regionId),
    buildable: status === "available" || status === "cards",
    subsidyDaysLeft: Math.max(0, market.subsidyUntilDay - run.completedDay),
    syntheticEnabled: market.syntheticEnabled,
    milestonesClaimed: market.milestonesClaimed,
  }
}

export function regionBuildOption(run: RunState, regionId: RegionId): RegionBuildOption {
  const spec = regionSpec(regionId)
  const market = run.markets[regionId]
  const levels = researchLevels(run)
  const origin = isOriginRegion(run, regionId)
  const covered = market.users + market.synthetics
  return {
    region: spec,
    isOrigin: origin,
    entered: market.enteredDay !== null,
    users: market.users,
    synthetics: market.synthetics,
    adoptionBps: Math.min(10000, Math.floor(covered * 10000 / spec.population)),
    syntheticBps: market.synthetics >= spec.population
      ? 10000 : Math.min(9999, Math.floor(market.synthetics * 10000 / spec.population)),
    centers: market.centers,
    occupiedCenters: regionOccupiedCenters(run, regionId),
    unlockedLimit: regionUnlockLimit(run, regionId),
    unlockedTier: origin ? 3 : market.unlockedTier,
    localCapacity: localRegionCapacity(spec, market.centers, levels),
    status: canBuildDataCenter(run, regionId),
  }
}

export function regionBuildOptions(run: RunState): RegionBuildOption[] {
  const rank = (status: ActionAvailability) => status === "available" ? 0 : status === "cards" ? 1 : status === "locked" ? 2 : status === "not-entered" ? 4 : 3
  return regionIds
    .map(id => regionBuildOption(run, id))
    .sort((a, b) =>
      rank(a.status) - rank(b.status)
      || Number(b.isOrigin) - Number(a.isOrigin)
      || Number(b.entered) - Number(a.entered)
      || b.region.population - a.region.population)
}

export function enterMarketState(
  run: RunState,
  regionId: RegionId,
  day: number,
  markets: Record<RegionId, MarketRunState>,
): boolean {
  const existing = markets[regionId]
  if (existing.enteredDay !== null) return false
  const spec = regionSpec(regionId)
  const seed = Math.min(regionSeedUsers(spec, false), regionOpenPopulation(run, regionId))
  markets[regionId] = {
    ...existing,
    enteredDay: day,
    users: existing.users + seed,
    unlockedTier: existing.unlockedTier,
  }
  return true
}

function targetDependencyBps(levels: SkillLevels): number {
  const attrs = attributesForLevels(levels)
  const behaviorCount = behaviorCompletedLevels(levels)
  let target = 1600
    + Math.max(0, attrs.appeal - rules.research.attributeBaseline) * 45
    + behaviorCount * 280
  if ((levels["api-ecosystem"] ?? 0) > 0) target += 350
  if ((levels["agent-tasks"] ?? 0) > 0) target += 500
  if ((levels["long-memory"] ?? 0) > 0) target += 450
  if ((levels["lasting-companionship"] ?? 0) > 0) target += 500
  if ((levels["enterprise-workflows"] ?? 0) > 0) target += 450
  return Math.max(800, Math.min(9600, target))
}

export interface OperationsDayResult {
  readonly markets: Readonly<Record<RegionId, MarketRunState>>
  readonly opponents: ComputerFactions
  readonly regionPopulations: RegionPopulations
  readonly adoptionBps: number
  readonly dependencyBps: number
  readonly syntheticBps: number
  readonly syntheticActivatedDay: number | null
  readonly playerSyntheticBps: number
  readonly conversionBudgetPeople: number
  readonly exposureBps: number
  readonly tokenScale: number
  readonly tokenReward: number
  readonly operatingPayment: number
  readonly operatingRemainder: number
  readonly populationCorpus: number
  readonly corpusRemainder: number
  readonly crossRegionProgress: number
  readonly humanAdvanceBps: number
  readonly compute: ComputePressure
  readonly bubbles: readonly MapBubble[]
  readonly bubbleRandomState: number
}

function settleMapBubbles(
  run: RunState,
  nextDay: number,
  nextMarkets: Readonly<Record<RegionId, MarketRunState>>,
  nextExposureBps: number,
  nextTokenScale: number,
): { readonly bubbles: readonly MapBubble[]; readonly bubbleRandomState: number } {
  const surviving = run.bubbles.filter(entry => entry.expiresDay > nextDay)
  let rng = nextBubbleRandom(run.bubbleRandomState)
  if (surviving.length >= bubbleRules.maxActive) {
    return { bubbles: surviving, bubbleRandomState: rng }
  }
  const guaranteedEarly = nextDay === 2 && surviving.length === 0
  const rollPct = rng % 100
  if (!guaranteedEarly && rollPct >= bubbleRules.spawnChancePct) {
    return { bubbles: surviving, bubbleRandomState: rng }
  }
  const candidates = regionIds.filter(id => nextMarkets[id].enteredDay !== null && (nextMarkets[id].users + nextMarkets[id].synthetics > 0))
  if (!candidates.length) {
    return { bubbles: surviving, bubbleRandomState: rng }
  }
  rng = nextBubbleRandom(rng)
  const regionId = candidates[rng % candidates.length]
  const anchors = regionSpec(regionId).bubblePoints
  const usedAnchors = new Set(surviving.filter(entry => entry.regionId === regionId).map(entry => entry.anchorIndex))
  const freeAnchors = anchors.map((_, idx) => idx).filter(idx => !usedAnchors.has(idx))
  rng = nextBubbleRandom(rng)
  const anchorIndex = freeAnchors.length ? freeAnchors[rng % freeAnchors.length] : rng % anchors.length

  rng = nextBubbleRandom(rng)
  const kindRoll = rng % 100
  const canAlert = nextExposureBps >= bubbleRules.alertMinExposureBps || run.researchBps > 0
  let kind: MapBubbleKind
  let value: number
  if (canAlert && kindRoll < 36) {
    kind = "alert"
    value = bubbleRules.alertExposureReliefBps
  } else if (kindRoll < (canAlert ? 72 : 58)) {
    kind = "traffic"
    value = Math.max(2, roundNiceToken(4.5 * nextTokenScale))
  } else {
    kind = "corpus"
    rng = nextBubbleRandom(rng)
    value = 8 + (rng % 7)
  }
  const bubble: MapBubble = {
    id: `${run.runId}:b:${nextDay}:${regionId}:${anchorIndex}`,
    kind,
    regionId,
    anchorIndex,
    spawnedDay: nextDay,
    expiresDay: nextDay + bubbleRules.lifetimeDays,
    value,
  }
  return { bubbles: [...surviving, bubble], bubbleRandomState: rng }
}

/** Deterministic daily settlement at pure continental granularity. */
export function settleOperationsDay(run: RunState, nextDay: number): OperationsDayResult {
  const scale = tokenScaleOf(run)
  const passives = factions[run.setup.factionId].passives
  const factionBuffActive = nextDay <= run.actionCooldowns.factionEffectUntilDay
  const rivalSlowdownBps = factionBuffActive && run.setup.factionId === "claude" ? 7000 : 10000
  const compute = computePressure(run)

  const computerDay = beginComputerDay(run, nextDay, scale, rivalSlowdownBps)
  const levels = researchLevels(run)
  const attrs = attributesForLevels(levels)
  const hasSocial = (levels[channelTechnologies.social] ?? 0) > 0
  const hasApi = (levels[channelTechnologies.api] ?? 0) > 0
  const hasOpenSource = (levels[channelTechnologies.openSource] ?? 0) > 0
  const hasDevice = (levels[channelTechnologies.device] ?? 0) > 0
  const hasAgent = (levels[channelTechnologies.agent] ?? 0) > 0
  const hasEdge = (levels["edge-deployment"] ?? 0) > 0
  const hasOrgSeats = (levels["enterprise-workflows"] ?? 0) > 0
  const multilingualLevel = levels.multilingual ?? 0
  const globalDefault = (levels["global-default"] ?? 0) > 0
  const openChannels = Number(hasSocial) + Number(hasApi) + Number(hasOpenSource) + Number(hasDevice) + Number(hasAgent)

  const factionSpreadBoostBps = factionBuffActive
    ? (run.setup.factionId === "grok" ? 17500 : run.setup.factionId === "gpt" ? 14500 : 10000)
    : 10000
  const factionAppealBonusBps = factionBuffActive && run.setup.factionId === "grok" ? 3500 : 0
  const factionRetentionMulBps = Math.round(
    passives.retentionMulBps * (factionBuffActive && run.setup.factionId === "claude" ? 0.25 : 1),
  )

  const markets = { ...run.markets } as Record<RegionId, MarketRunState>
  let tokenReward = 0

  // 1. Cross-continental organic spillover once cross-border/multilingual/open-source tech is active.
  let crossRegionProgress = run.crossRegionProgress
  const newlyEnteredRegions = new Set<RegionId>()
  const unenteredRegions = regionIds.filter(id => markets[id].enteredDay === null)
  if (unenteredRegions.length > 0 && (multilingualLevel > 0 || hasOpenSource || globalDefault)) {
    let bestEnteredBps = 0
    for (const id of regionIds) {
      if (markets[id].enteredDay === null) continue
      bestEnteredBps = Math.max(bestEnteredBps, regionAdoptionBps(run, id))
    }
    if (bestEnteredBps >= 1500) {
      const baseCross = multilingualLevel * 14 + (hasOpenSource ? 16 : 0) + (globalDefault ? 22 : 0)
      crossRegionProgress += Math.max(1, Math.round(baseCross * attrs.spread / 100 * passives.crossRegionMulBps / 10000))
      if (crossRegionProgress >= 100) {
        crossRegionProgress -= 100
        const nextRegion = [...unenteredRegions].sort((a, b) =>
          regionSpec(b).population - regionSpec(a).population || a.localeCompare(b, "en"))[0]
        if (enterMarketState(run, nextRegion, nextDay, markets)) {
          newlyEnteredRegions.add(nextRegion)
          tokenReward += newMarketReward(run)
        }
      }
    }
  }

  // 2. Per-continent daily spread + parallel synthetic conversion with compute pressure & faction traits.
  const targetDep = Math.min(9800, Math.round(targetDependencyBps(levels) * passives.dependencyMulBps / 10000))
  const exposurePct = Math.floor(run.exposureBps / 100)
  const sharedFacts: NonNullable<ResearchMarketContext["facts"]> = [
    ...(hasApi ? ["hasApi" as const] : []),
    ...(hasAgent ? ["hasAgent" as const] : []),
    ...(hasDevice ? ["hasDevice" as const] : []),
    ...(hasEdge ? ["hasEdge" as const] : []),
    ...(hasOrgSeats ? ["organizationSeat" as const] : []),
  ]

  const prevGlobalAdoptionBps = run.adoptionBps ?? 0
  const baseMigrationAppeal = marketResearchValue(levels, "migrationRequests", attrs.appeal * 100) + factionAppealBonusBps
  const baseRetention = marketResearchValue(levels, "naturalChurn", 10000)
  const computeChurnPenalty = compute.status === "critical" ? 1.45 : compute.status === "overloaded" ? 1.18 : 1
  const migrationRetention = Math.round(baseRetention * factionRetentionMulBps / 10000 * computeChurnPenalty)
  let remainingBudget = run.conversionBudgetPeople
  let totalConvertedToday = 0
  let activeSubsidizedMarkets = 0

  for (const regionId of regionIds) {
    const spec = regionSpec(regionId)
    const prev = markets[regionId]
    if (prev.enteredDay === null) {
      settleRegionCompetition(run, nextDay, spec, computerDay, null, rivalSlowdownBps)
      continue
    }

    const start = run.markets[regionId]
    const startUsers = start.users
    const startSynthetics = start.synthetics
    const seededToday = newlyEnteredRegions.has(regionId) || prev.users > startUsers

    const subsidized = nextDay <= prev.subsidyUntilDay
    if (subsidized) activeSubsidizedMarkets++
    const marketDay = Math.max(1, nextDay - prev.enteredDay)
    const subsidyDay = prev.subsidyStartedDay !== null && nextDay > prev.subsidyStartedDay
      ? nextDay - prev.subsidyStartedDay : undefined
    const nextApiDays = hasApi ? prev.apiActiveDays + 1 : 0

    const prevCovered = prev.users + prev.synthetics
    const remaining = spec.population - prevCovered
    const share = prevCovered / spec.population
    const coveragePct = Math.floor(share * 100)
    const rawNet = 0.50 + 0.50 * (spec.internetBps / 10000)
    const netFactor = (hasEdge || hasOpenSource) ? Math.max(rawNet, 0.78) : rawNet

    let candidate = 0
    let socialShareOfCandidate = 0
    let apiShareOfCandidate = 0

    if (!seededToday && remaining > 0) {
      const networkFloor = prevGlobalAdoptionBps >= 5500 ? 0.018 : 0.006
      const hostUsers = prev.users
      const logisticBase = hostUsers > 0
        ? Math.max(spec.population * networkFloor, hostUsers * 0.165 + prev.synthetics * 0.045) * (1 - share * 0.58) * netFactor
        : Math.max(spec.population * Math.max(networkFloor, 0.008), prev.synthetics * 0.065) * (1 - share * 0.55) * netFactor

      let weightSum = 0
      if (openChannels > 0 || share < 0.18) {
        weightSum += 0.22
      }

      let socialWeight = 0
      let apiWeight = 0
      const baseMetrics = {
        factionCoverage: coveragePct,
        marketDay,
        apiDays: prev.apiActiveDays,
        localCenters: prev.centers,
        continentalCenters: prev.centers,
        factionExposure: exposurePct,
        ...(subsidyDay !== undefined ? { subsidyDay } : {}),
      }

      if (hasSocial) {
        const ctx: ResearchMarketContext = { channel: "social", facts: sharedFacts, metrics: baseMetrics }
        const reachMul = marketResearchValue(levels, "reach", 1000, ctx) / 1000
        const appealMul = marketResearchValue(levels, "adoptionWeight", 1000, ctx) / 1000
        socialWeight = 0.44 * (passives.socialMulBps / 10000) * reachMul * Math.sqrt(Math.max(0.1, appealMul))
        weightSum += socialWeight
      }
      if (hasApi) {
        const ctx: ResearchMarketContext = { channel: "api", facts: sharedFacts, metrics: baseMetrics }
        const reachMul = marketResearchValue(levels, "reach", 1000, ctx) / 1000
        const appealMul = marketResearchValue(levels, "adoptionWeight", 1000, ctx) / 1000
        apiWeight = 0.38 * reachMul * Math.sqrt(Math.max(0.1, appealMul))
        weightSum += apiWeight
      }
      if (hasOpenSource) {
        const ctx: ResearchMarketContext = { channel: "openSource", facts: sharedFacts, metrics: baseMetrics }
        const reachMul = marketResearchValue(levels, "reach", 1000, ctx) / 1000
        const appealMul = marketResearchValue(levels, "adoptionWeight", 1000, ctx) / 1000
        const noCenterBoost = prev.centers === 0 ? 1.15 : 1
        weightSum += 0.36 * noCenterBoost * reachMul * Math.sqrt(Math.max(0.1, appealMul))
      }
      if (hasDevice && (prev.centers > 0 || hasEdge)) {
        const ctx: ResearchMarketContext = { channel: "device", facts: sharedFacts, metrics: baseMetrics }
        const reachMul = marketResearchValue(levels, "reach", 1000, ctx) / 1000
        const appealMul = marketResearchValue(levels, "adoptionWeight", 1000, ctx) / 1000
        weightSum += 0.35 * reachMul * Math.sqrt(Math.max(0.1, appealMul))
      }
      if (hasAgent) {
        const ctx: ResearchMarketContext = { channel: "agent", facts: sharedFacts, metrics: baseMetrics }
        const reachMul = marketResearchValue(levels, "reach", 1000, ctx) / 1000
        const appealMul = marketResearchValue(levels, "adoptionWeight", 1000, ctx) / 1000
        weightSum += 0.32 * reachMul * Math.sqrt(Math.max(0.1, appealMul))
      }

      let rawCandidate = Math.round(
        logisticBase * weightSum
          * (passives.spreadMulBps / 10000)
          * (factionSpreadBoostBps / 10000)
          * (compute.spreadMulBps / 10000),
      )
      if (prev.prevNewSocialUsers > 0 && hostUsers > 0) {
        const remix = marketResearchValue(levels, "remixContacts", prev.prevNewSocialUsers, { channel: "social" })
        rawCandidate += remix
        socialWeight += remix > 0 ? 0.05 : 0
      }
      if (nextDay % btoken.income.everyDays === 1 && prev.prevOrgSeatReferrals > 0 && hostUsers > 0) {
        rawCandidate += marketResearchValue(levels, "seatReferrals", prev.prevOrgSeatReferrals, {
          channel: "api",
          facts: sharedFacts,
        })
      }
      if (subsidized) {
        rawCandidate = Math.round(rawCandidate * opRules.subsidyMultiplierBps / 10000)
      }
      if (openChannels > 0 && remaining <= Math.max(50_000, Math.ceil(spec.population * 0.01)) && rawCandidate > 0) {
        rawCandidate = Math.max(rawCandidate, remaining * 3)
      }
      if (openChannels === 0) {
        const webCap = Math.floor(spec.population * 0.18)
        candidate = Math.max(0, Math.min(remaining, webCap - prevCovered, rawCandidate))
      } else {
        candidate = Math.max(0, Math.min(remaining, rawCandidate))
      }
      if (weightSum > 0) {
        socialShareOfCandidate = socialWeight / weightSum
        apiShareOfCandidate = apiWeight / weightSum
      }
    }

    const localCap = localRegionCapacity(spec, prev.centers, levels)
    const freeCap = Math.max(0, localCap - prevCovered)
    const inCap = Math.min(candidate, freeCap)
    const overflow = candidate - inCap
    const overflowAdded = overflow === 0
      ? 0
      : overflow <= 2
        ? Math.floor((overflow + prev.carry) / 2)
        : Math.floor((overflow * 38 + prev.carry * 50) / 100)
    const nextCarry = (overflow === 0
      ? prev.carry
      : overflow <= 2
        ? (overflow + prev.carry) % 2
        : ((overflow * 38 + prev.carry * 50) % 100 >= 50 ? 1 : 0)) as 0 | 1
    const requested = seededToday ? prev.users - startUsers : Math.min(remaining, inCap + overflowAdded)
    const migrationCap = prev.syntheticEnabled
      ? spec.population
      : Math.max(localCap, Math.floor(spec.population * competitionRules.migrationBaseCapacityBps / 10000))
    const { added, movedIn, movedOut } = settleRegionCompetition(run, nextDay, spec, computerDay, {
      factionId: run.setup.factionId,
      users: startUsers,
      synthetics: startSynthetics,
      newUsers: requested,
      migrationRoom: Math.max(0, migrationCap - startUsers - startSynthetics),
      appealBps: baseMigrationAppeal + (subsidized ? competitionRules.migrationSubsidyAppealBps : 0),
      retentionBps: migrationRetention,
      subsidized,
      syntheticActive: prev.syntheticEnabled,
    }, rivalSlowdownBps)

    let converted = 0
    const convertiblePool = startUsers - movedOut
    if (prev.syntheticEnabled && convertiblePool > 0 && remainingBudget > 0) {
      const rateBps = Math.round(
        (opRules.syntheticBaseDailyRateBps + prev.centers * opRules.syntheticCenterDailyRateBps)
          * compute.conversionMulBps / 10000,
      )
      const baseDailyCap = Math.max(1, Math.ceil(spec.population * Math.max(60, rateBps) / 10000))
      const capWithTech = Math.max(1, marketResearchValue(levels, "conversionCapacity", baseDailyCap, {
        facts: ["activePlan", ...sharedFacts],
        metrics: { localCenters: prev.centers },
      }))
      const sweepTail = convertiblePool <= Math.max(50_000, Math.ceil(spec.population * 0.015)) ? convertiblePool : capWithTech
      converted = Math.min(convertiblePool, Math.max(capWithTech, sweepTail), remainingBudget)
      remainingBudget -= converted
      totalConvertedToday += converted
    }

    const previousUsers = convertiblePool - converted
    const nextUsers = previousUsers + added + movedIn
    const nextSynthetics = startSynthetics + converted
    const nextCovered = nextUsers + nextSynthetics
    const regionNewSocial = Math.round(added * socialShareOfCandidate)
    const regionNewApi = Math.round(added * apiShareOfCandidate)
    const nextOrgSeats = hasOrgSeats ? prev.orgSeats + Math.round(regionNewApi * 0.45) : prev.orgSeats

    const nextAdoptionBps = Math.min(10000, Math.floor(nextCovered * 10000 / spec.population))
    const computedTier = tierForAdoption(nextAdoptionBps)
    const unlockedTier = isOriginRegion(run, regionId)
      ? 3
      : (Math.max(prev.unlockedTier, computedTier) as UnlockTier)

    const depDiff = targetDep - prev.dependencyBps
    const depStep = depDiff === 0 ? 0
      : depDiff > 0 ? Math.min(depDiff, Math.max(10, Math.round(depDiff * 0.12)))
        : Math.max(depDiff, Math.min(-10, Math.round(depDiff * 0.10)))

    const claimed = [...prev.milestonesClaimed]
    for (const milestone of btoken.adoptionMilestones) {
      if (nextAdoptionBps >= milestone.adoptionBps && !claimed.includes(milestone.adoptionBps)) {
        claimed.push(milestone.adoptionBps)
        tokenReward += milestoneRewardForRun(run, milestone.reward)
      }
    }

    markets[regionId] = {
      ...prev,
      users: nextUsers,
      synthetics: nextSynthetics,
      newlyConverted: converted,
      prevUsers: previousUsers,
      retainedDays: previousUsers > 0 ? Math.min(9999, prev.retainedDays + 1) : 0,
      unlockedTier,
      carry: nextCarry,
      dependencyBps: Math.max(0, Math.min(10000, prev.dependencyBps + depStep)),
      milestonesClaimed: claimed,
      apiActiveDays: nextApiDays,
      orgSeats: nextOrgSeats,
      prevNewSocialUsers: regionNewSocial,
      prevOrgSeatReferrals: nextDay % btoken.income.everyDays === 0 ? nextOrgSeats : 0,
    }
  }

  // 3. Global metrics & pure continental population map snapshot.
  const computer = finishComputerDay(computerDay, nextDay, scale)
  const { totalCovered, adoptionBps, syntheticBps, playerSyntheticBps, dependencyBps } = computeGlobalMetrics(markets, computer.opponents)
  const regionPopulations = buildRegionPopulations(markets, run.setup.factionId, computer.opponents)

  let builtCenters = 0
  for (const id of regionIds) builtCenters += markets[id].centers
  let completedTechs = 0
  for (const count of Object.values(levels)) completedTechs += count ?? 0

  // 4. Inflated daily Token Economy: scales smoothly from single digits -> millions -> billions -> trillions.
  const targetScale = computeTargetTokenScale(adoptionBps, syntheticBps, playerSyntheticBps, builtCenters, completedTechs)
  const maxStepScale = Math.max(scale + 1, Math.round(scale * 2.2))
  const nextTokenScale = Math.min(MAX_TOKEN_SCALE, Math.max(scale, Math.min(targetScale, maxStepScale)))

  const income = btoken.income
  let operatingRemainder = run.operatingRemainder ?? 0
  const effectiveBps = Math.min(25000, adoptionBps + playerSyntheticBps * 2)
  let baseUnits = 0.85 + effectiveBps / 2400 + builtCenters * 0.28
  if (nextDay % income.everyDays === 0) {
    const usersTier = Math.min(income.maximum - income.base, Math.floor(adoptionBps / income.adoptionStepBps))
    let revenueBonus = usersTier
    if (usersTier > 0) {
      const maxApiDays = Math.max(...regionIds.map(id => markets[id].apiActiveDays))
      const anyOrgSeats = regionIds.some(id => markets[id].orgSeats > 0)
      const anyRetained = regionIds.some(id => markets[id].retainedDays >= 2)
      const revenueContext: ResearchMarketContext = {
        channel: hasApi ? "api" : hasAgent ? "agent" : undefined,
        facts: [
          ...(anyOrgSeats ? ["organizationSeat" as const] : []),
          ...(hasAgent ? ["hasAgent" as const] : []),
        ],
        metrics: {
          apiDays: maxApiDays,
          daysRetained: anyRetained ? 2 : 0,
        },
      }
      revenueBonus = marketResearchValue(levels, "revenue", usersTier, revenueContext)
    }
    baseUnits += 0.45 + revenueBonus * 0.55
  }
  const profitMul = Math.max(0.4, attrs.profit / rules.research.attributeBaseline)
  const scaledUnits = baseUnits * profitMul * (passives.tokenYieldMulBps / 10000)
  const cents = Math.round(100 * scaledUnits) + operatingRemainder
  const wholeUnits = Math.floor(cents / 100)
  operatingRemainder = cents % 100
  const operatingPayment = Math.max(1, roundNiceToken(Math.max(1, wholeUnits) * nextTokenScale))

  // 5. Normalized population corpus flywheel (active synthetics yield 3x corpus per person).
  let rawPeopleCorpus = 0
  let enteredSumBps = 0
  let enteredCount = 0
  for (const id of regionIds) {
    const state = markets[id]
    if (state.users > 0 || state.synthetics > 0) rawPeopleCorpus += regionRawCorpus(state, levels)
    if (state.enteredDay !== null) {
      enteredCount++
      const pop = regionSpec(id).population
      enteredSumBps += pop > 0 ? Math.min(10000, Math.floor((state.users + state.synthetics) * 10000 / pop)) : 0
    }
  }
  const avgEnteredBps = enteredCount > 0 ? enteredSumBps / enteredCount : 0
  const effectiveCorpusBps = avgEnteredBps * 0.4 + adoptionBps * 0.6
  const qualityFactor = totalCovered > 0 ? rawPeopleCorpus / totalCovered : 1
  const uncappedCents = Math.round(effectiveCorpusBps / 10000 * opRules.corpusFlywheelMaxDaily * 100 * qualityFactor)
  const throughputCap = opRules.corpusThroughputBase
    + builtCenters * opRules.corpusThroughputPerCenter
    + capabilityCompletedLevels(levels) * opRules.corpusThroughputPerCapability
  const cappedCents = Math.min(throughputCap * 100, uncappedCents)
  const totalCorpusCents = cappedCents + run.corpusRemainder
  const populationCorpus = Math.floor(totalCorpusCents / 100)
  const corpusRemainder = totalCorpusCents % 100

  // 6. Exposure accumulation & Project HUMAN.
  const dailyGainBps = Math.max(0, adoptionBps - prevGlobalAdoptionBps)
  let baseExposure = compute.extraExposureBps
  if (openChannels > 0 || activeSubsidizedMarkets > 0) {
    if (adoptionBps >= 400) baseExposure += Math.floor((adoptionBps - 400) / 85)
    baseExposure += Math.round(dailyGainBps * 0.55)
    if (hasSocial) baseExposure += 12
    if (activeSubsidizedMarkets > 0) baseExposure += activeSubsidizedMarkets * 30
  } else if (adoptionBps >= 2000) {
    baseExposure += Math.floor((adoptionBps - 2000) / 400)
  }
  if (totalConvertedToday > 0) {
    const convertedBps = Math.round(totalConvertedToday * 10000 / globalPlayablePopulation)
    baseExposure += opRules.syntheticDailyExposureBaseBps + Math.round(convertedBps * 0.50)
  }
  const standardExposure = baseExposure > 0 ? marketResearchValue(levels, "exposure", baseExposure) : 0
  const agentExposure = hasAgent ? marketResearchValue(levels, "exposure", 22, { facts: ["agentAction"] }) : 0
  const exposureGain = Math.max(0, Math.round((standardExposure + agentExposure) * passives.exposureMulBps / 10000))
  const exposureBps = Math.min(10000, run.exposureBps + exposureGain + computer.exposureGain)
  const alertLevel = currentAlertLevel(exposureBps)
  const humanAdvanceBps = humanRules.dailyAdvanceBps[alertLevel]

  // 7. Interactive map bubbles placed directly on continental land anchors.
  const { bubbles, bubbleRandomState } = settleMapBubbles(run, nextDay, markets, exposureBps, nextTokenScale)

  return {
    markets,
    opponents: computer.opponents,
    regionPopulations,
    adoptionBps,
    dependencyBps,
    syntheticBps,
    syntheticActivatedDay: run.syntheticActivatedDay ?? computer.firstActivationDay,
    playerSyntheticBps,
    conversionBudgetPeople: remainingBudget,
    exposureBps,
    tokenScale: nextTokenScale,
    tokenReward,
    operatingPayment,
    operatingRemainder,
    populationCorpus,
    corpusRemainder,
    crossRegionProgress,
    humanAdvanceBps,
    compute,
    bubbles,
    bubbleRandomState,
  }
}
