import { btoken } from "../rules/v0.1/economy/btoken.ts"
import { actionById } from "../rules/v0.1/evolution/actions.ts"
import { channelTechnologies, type ResearchMarketContext } from "../rules/v0.1/evolution/market-effects.ts"
import { researchNode, type SkillId } from "../rules/v0.1/evolution/trees.ts"
import type { Outcome } from "../rules/v0.1/endings/standard.ts"
import { factions, type FactionAbilityId, type FactionId } from "../rules/v0.1/factions/roster.ts"
import { projectHuman } from "../rules/v0.1/opposition/project-human.ts"
import { phases } from "../rules/v0.1/progression/phases.ts"
import { isRegionId, standardScenario } from "../rules/v0.1/scenario.ts"
import {
  countries,
  countriesInRegion,
  countrySpec,
  globalPlayablePopulation,
  originCountries,
  regionPlayablePopulation,
  slotUnlockLimit,
  type CountrySpec,
} from "../rules/v0.1/world/countries.ts"
import { regionCapacity, regionIds, type RegionId } from "../rules/v0.1/world/regions.ts"
import { competitionRules } from "../rules/v0.1/opposition/computer-factions.ts"
import {
  beginComputerDay, countryOccupiedCenters, countryOpenPopulation, countrySeedUsers, finishComputerDay,
  initialComputerFactions, settleCountryCompetition, tierForAdoption, type ComputerFactions,
} from "./competition.ts"
import { marketResearchValue } from "./market-research.ts"
import type { CountryPopulations } from "./population.ts"
import { activeResearchComputeLoad, attributesForLevels, dailyCorpus, researchLevels, type SkillLevels } from "./research.ts"
import type { RunSetup, RunState } from "./run.ts"

export { countryOccupiedCenters, countrySeedUsers } from "./competition.ts"

export interface MarketRunState {
  readonly enteredDay: number | null
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

export interface CountryRunState {
  readonly users: number
  readonly synthetics: number
  readonly newlyConverted: number
  readonly prevUsers: number
  readonly retainedDays: number
  readonly centers: number
  readonly unlockedTier: 0 | 1 | 2 | 3
  readonly carry: 0 | 1
  readonly dependencyBps: number
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
  readonly countryId: string
  readonly regionId: RegionId
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
  readonly totalSlots: number
  readonly buildableCount: number
  readonly subsidyDaysLeft: number
  readonly syntheticEnabled: boolean
  readonly milestonesClaimed: readonly number[]
}

export interface CountryBuildOption {
  readonly country: CountrySpec
  readonly isOrigin: boolean
  readonly users: number
  readonly synthetics: number
  readonly adoptionBps: number
  readonly syntheticBps: number
  readonly centers: number
  readonly occupiedCenters: number
  readonly unlockedLimit: number
  readonly unlockedTier: 0 | 1 | 2 | 3
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

export function computePressure(run: RunState, extraResearchLoad = 0): ComputePressure {
  const levels = researchLevels(run)
  const centers = totalCenters(run)
  const passives = factions[run.setup.factionId].passives
  let supplyMulBps = passives.computeEfficiencyBps
  if ((levels["inference-efficiency"] ?? 0) > 0) supplyMulBps += 1500
  const hasBalancedContinent = (levels["load-balancing"] ?? 0) > 0
    && regionIds.some(id => regionCenters(run, id) >= 2)
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
  const researchDemand = activeResearchComputeLoad(run) + Math.max(0, extraResearchLoad)
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

export function buildCountryPopulations(
  countryStates: Readonly<Record<string, CountryRunState>>,
  factionId: FactionId,
  opponents: ComputerFactions,
): CountryPopulations {
  const result: Record<string, { total: number; factions: Partial<Record<FactionId, { immersed: number; synthetic: number }>> }> = {}
  for (const faction of [{ factionId, countries: countryStates }, ...Object.values(opponents)]) {
    for (const [id, state] of Object.entries(faction.countries)) {
      if (state.users <= 0 && state.synthetics <= 0) continue
      const spec = countrySpec(id)
      if (!spec) continue
      const record = result[id] ??= { total: spec.population, factions: {} }
      record.factions[faction.factionId] = { immersed: state.users, synthetic: state.synthetics }
    }
  }
  return result
}

export function computeGlobalMetrics(countryStates: Readonly<Record<string, CountryRunState>>, opponents: ComputerFactions) {
  let totalUsers = 0
  let totalSynthetics = 0
  let weightedDep = 0
  for (const state of Object.values(countryStates)) {
    if (state.users <= 0 && state.synthetics <= 0) continue
    totalUsers += state.users
    totalSynthetics += state.synthetics
    weightedDep += state.users * state.dependencyBps + state.synthetics * 10000
  }
  const totalCovered = totalUsers + totalSynthetics
  const adoptionBps = Math.min(10000, Math.floor(totalCovered * 10000 / globalPlayablePopulation))
  let globalSynthetics = totalSynthetics
  for (const faction of Object.values(opponents)) {
    for (const country of Object.values(faction.countries)) globalSynthetics += country.synthetics
  }
  const syntheticBps = globalSynthetics >= globalPlayablePopulation
    ? 10000
    : Math.min(9999, Math.floor(globalSynthetics * 10000 / globalPlayablePopulation))
  const playerSyntheticBps = Math.min(10000, Math.floor(totalSynthetics * 10000 / globalPlayablePopulation))
  const dependencyBps = totalCovered > 0 ? Math.min(10000, Math.round(weightedDep / totalCovered)) : 0
  return { totalUsers, totalSynthetics, totalCovered, adoptionBps, syntheticBps, playerSyntheticBps, dependencyBps }
}

export function initialOperations(setup: RunSetup, seed = 0) {
  const markets = Object.fromEntries(
    regionIds.map(id => [id, id === setup.startRegionId ? { ...emptyMarket, enteredDay: 0 } : { ...emptyMarket }]),
  ) as Record<RegionId, MarketRunState>
  const originId = originCountries[setup.startRegionId]
  const origin = countrySpec(originId)!
  const countryStates: Record<string, CountryRunState> = {
    [originId]: {
      users: countrySeedUsers(origin, true),
      synthetics: 0,
      newlyConverted: 0,
      prevUsers: 0,
      retainedDays: 0,
      centers: 0,
      unlockedTier: 3,
      carry: 0,
      dependencyBps: opRules.initialDependencyBps,
    },
  }
  const opponents = initialComputerFactions(setup)
  const { adoptionBps, syntheticBps, playerSyntheticBps, dependencyBps } = computeGlobalMetrics(countryStates, opponents)
  return {
    exposureBps: 0,
    buildCards: 0,
    tokenScale: 1,
    lifetimeTokens: rules.initialBtoken,
    markets,
    countries: countryStates,
    opponents,
    countryPopulations: buildCountryPopulations(countryStates, setup.factionId, opponents),
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

export function isOriginCountry(run: RunState, countryId: string): boolean {
  return originCountries[run.setup.startRegionId] === countryId
}

export function countryUnlockLimit(run: RunState, countryId: string): number {
  const spec = countrySpec(countryId)
  if (!spec) return 0
  if (isOriginCountry(run, countryId)) return spec.slots
  const tier = run.countries[countryId]?.unlockedTier ?? 0
  return slotUnlockLimit(spec.slots, tier)
}

export function totalCenters(run: RunState): number {
  let sum = 0
  for (const state of Object.values(run.countries)) sum += state.centers
  return sum
}

export function totalImmersed(run: RunState): number {
  let sum = 0
  for (const state of Object.values(run.countries)) sum += state.users
  return sum
}

export function totalPlayerSynthetics(run: RunState): number {
  let sum = 0
  for (const state of Object.values(run.countries)) sum += state.synthetics
  return sum
}

export function hasPlayerSyntheticMajority(run: RunState): boolean {
  return totalPlayerSynthetics(run) * 10000 > globalPlayablePopulation * rules.standardVictory.minPlayerSyntheticShareBps
}

export function totalSynthetics(run: RunState): number {
  let sum = totalPlayerSynthetics(run)
  for (const faction of Object.values(run.opponents)) {
    for (const state of Object.values(faction.countries)) sum += state.synthetics
  }
  return sum
}

export function factionStandings(run: RunState, regionId?: RegionId) {
  const player = { factionId: run.setup.factionId, balance: run.balance, countries: run.countries }
  return [player, ...Object.values(run.opponents)].map(faction => {
    let immersed = 0
    let synthetics = 0
    let centers = 0
    for (const [id, country] of Object.entries(faction.countries)) {
      if (regionId && countrySpec(id)?.regionId !== regionId) continue
      immersed += country.users
      synthetics += country.synthetics
      centers += country.centers
    }
    return { factionId: faction.factionId, isPlayer: faction.factionId === player.factionId,
      immersed, synthetics, centers, balance: faction.balance }
  })
}

export function regionCenters(run: RunState, regionId: RegionId): number {
  let sum = 0
  for (const country of countriesInRegion(regionId)) sum += run.countries[country.id]?.centers ?? 0
  return sum
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

function localCountryCapacity(
  spec: CountrySpec,
  centers: number,
  continentalCenters: number,
  levels: SkillLevels,
): number {
  const hasEdge = (levels["edge-deployment"] ?? 0) > 0
  const centerCap = centers > 0
    ? marketResearchValue(levels, "centerCapacity", centers * spec.slotCapacity, {
      metrics: { localCenters: centers, continentalCenters },
    })
    : 0
  const edgeCap = hasEdge
    ? marketResearchValue(levels, "edgeCapacity", Math.round(spec.population * opRules.edgeBaseShareBps / 10000), {
      metrics: { localCenters: centers },
    })
    : 0
  return centerCap + edgeCap
}

export function countryRawCorpus(state: CountryRunState, levels: SkillLevels): number {
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

export function corpusYieldBreakdown(run: RunState): CorpusYieldBreakdown {
  const levels = researchLevels(run)
  const fixed = dailyCorpus(run)
  let rawPeopleCorpus = 0
  let totalCovered = 0
  for (const state of Object.values(run.countries)) {
    if (state.users <= 0 && state.synthetics <= 0) continue
    totalCovered += state.users + state.synthetics
    rawPeopleCorpus += countryRawCorpus(state, levels)
  }
  let enteredSumBps = 0
  let enteredCount = 0
  for (const id of regionIds) {
    if (run.markets[id].enteredDay === null) continue
    enteredCount++
    enteredSumBps += regionAdoptionBps(run, id)
  }
  const avgEnteredBps = enteredCount > 0 ? enteredSumBps / enteredCount : 0
  const globalBps = run.adoptionBps ?? 0
  const effectiveBps = avgEnteredBps * 0.4 + globalBps * 0.6
  // Synthetics produce 3x corpus per person, amplifying effective flywheel quality up to 3x+.
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

export function regionAdoptionBps(run: RunState, regionId: RegionId): number {
  const population = regionPlayablePopulation(regionId)
  if (population <= 0) return 0
  let covered = 0
  for (const country of countriesInRegion(regionId)) {
    const s = run.countries[country.id]
    if (s) covered += s.users + s.synthetics
  }
  return Math.min(10000, Math.floor(covered * 10000 / population))
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

/** 1–5 star rating for victories: faster completion and higher player synthetic share yield higher ratings. */
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

export function canBuildDataCenter(run: RunState, countryId: string): ActionAvailability {
  if (isRunEnded(run)) return "ended"
  const spec = countrySpec(countryId)
  if (!spec) return "invalid"
  if (run.markets[spec.regionId].enteredDay === null) return "not-entered"
  const currentCenters = run.countries[countryId]?.centers ?? 0
  if (countryOccupiedCenters(run, countryId) >= spec.slots) return "full"
  const limit = countryUnlockLimit(run, countryId)
  if (currentCenters >= limit) return "locked"
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
  if (enabled) {
    let immersed = 0
    for (const c of countriesInRegion(regionId)) immersed += run.countries[c.id]?.users ?? 0
    if (immersed <= 0) return "no-users"
  }
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
  const market = run.markets[regionId]
  const population = regionPlayablePopulation(regionId)
  let immersed = 0
  let synthetics = 0
  let weightedDep = 0
  let centers = 0
  let buildableCount = 0
  for (const country of countriesInRegion(regionId)) {
    const state = run.countries[country.id]
    if (state) {
      immersed += state.users
      synthetics += state.synthetics
      weightedDep += state.users * state.dependencyBps + state.synthetics * 10000
      centers += state.centers
    }
    const status = canBuildDataCenter(run, country.id)
    if (status === "available" || status === "cards") buildableCount++
  }
  const covered = immersed + synthetics
  return {
    regionId,
    entered: market.enteredDay !== null,
    enteredDay: market.enteredDay,
    population,
    immersed,
    synthetics,
    covered,
    adoptionBps: population > 0 ? Math.min(10000, Math.floor(covered * 10000 / population)) : 0,
    syntheticBps: population > 0
      ? (synthetics >= population ? 10000 : Math.min(9999, Math.floor(synthetics * 10000 / population)))
      : 0,
    dependencyBps: covered > 0 ? Math.min(10000, Math.round(weightedDep / covered)) : 0,
    centers,
    totalSlots: regionCapacity(regionId),
    buildableCount,
    subsidyDaysLeft: Math.max(0, market.subsidyUntilDay - run.completedDay),
    syntheticEnabled: market.syntheticEnabled,
    milestonesClaimed: market.milestonesClaimed,
  }
}

export function countryBuildOptions(run: RunState, regionId?: RegionId): CountryBuildOption[] {
  const levels = researchLevels(run)
  const list = regionId ? countriesInRegion(regionId) : Object.values(countries)
  const continentCenters = new Map<RegionId, number>()
  for (const id of regionIds) continentCenters.set(id, regionCenters(run, id))
  const options: CountryBuildOption[] = []
  for (const country of list) {
    if (run.markets[country.regionId].enteredDay === null) continue
    const state = run.countries[country.id]
    const origin = isOriginCountry(run, country.id)
    const users = state?.users ?? 0
    const synthetics = state?.synthetics ?? 0
    const covered = users + synthetics
    const centers = state?.centers ?? 0
    const unlockedTier = origin ? 3 : (state?.unlockedTier ?? 0)
    const unlockedLimit = countryUnlockLimit(run, country.id)
    const adoptionBps = Math.min(10000, Math.floor(covered * 10000 / country.population))
    const syntheticBps = synthetics >= country.population
      ? 10000 : Math.min(9999, Math.floor(synthetics * 10000 / country.population))
    if (!origin && covered === 0 && centers === 0 && unlockedLimit === 0) continue
    options.push({
      country,
      isOrigin: origin,
      users,
      synthetics,
      adoptionBps,
      syntheticBps,
      centers,
      occupiedCenters: countryOccupiedCenters(run, country.id),
      unlockedLimit,
      unlockedTier,
      localCapacity: localCountryCapacity(country, centers, continentCenters.get(country.regionId) ?? 0, levels),
      status: canBuildDataCenter(run, country.id),
    })
  }
  const rank = (status: ActionAvailability) => status === "available" ? 0 : status === "cards" ? 1 : status === "locked" ? 2 : 3
  options.sort((a, b) =>
    rank(a.status) - rank(b.status)
    || Number(b.isOrigin) - Number(a.isOrigin)
    || (b.unlockedLimit - b.centers) - (a.unlockedLimit - a.centers)
    || b.country.population - a.country.population
    || a.country.id.localeCompare(b.country.id, "en"))
  return options
}

export function enterMarketState(
  run: RunState,
  regionId: RegionId,
  day: number,
  markets: Record<RegionId, MarketRunState>,
  countryStates: Record<string, CountryRunState>,
): boolean {
  if (markets[regionId].enteredDay !== null) return false
  markets[regionId] = { ...markets[regionId], enteredDay: day }
  const originId = originCountries[regionId]
  const spec = countrySpec(originId)!
  const existing = countryStates[originId]
  if (!existing || (existing.users === 0 && existing.synthetics === 0)) {
    countryStates[originId] = {
      users: Math.min(countrySeedUsers(spec, true), countryOpenPopulation(run, spec)),
      synthetics: existing?.synthetics ?? 0,
      newlyConverted: 0,
      prevUsers: existing?.prevUsers ?? 0,
      retainedDays: existing?.retainedDays ?? 0,
      centers: existing?.centers ?? 0,
      unlockedTier: existing?.unlockedTier ?? 0,
      carry: existing?.carry ?? 0,
      dependencyBps: existing?.dependencyBps ?? opRules.initialDependencyBps,
    }
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
  readonly countries: Readonly<Record<string, CountryRunState>>
  readonly opponents: ComputerFactions
  readonly countryPopulations: CountryPopulations
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
  nextCountries: Readonly<Record<string, CountryRunState>>,
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
  const occupied = new Set(surviving.map(entry => entry.countryId))
  const candidates = Object.entries(nextCountries)
    .filter(([id, state]) => !occupied.has(id) && (state.users + state.synthetics > 0))
    .map(([id]) => countrySpec(id)!)
    .filter(Boolean)
    .sort((a, b) => b.population - a.population || a.id.localeCompare(b.id, "en"))
    .slice(0, 18)
  if (!candidates.length) {
    return { bubbles: surviving, bubbleRandomState: rng }
  }
  rng = nextBubbleRandom(rng)
  const spec = candidates[rng % candidates.length]
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
    id: `${run.runId}:b:${nextDay}:${spec.id}`,
    kind,
    countryId: spec.id,
    regionId: spec.regionId,
    spawnedDay: nextDay,
    expiresDay: nextDay + bubbleRules.lifetimeDays,
    value,
  }
  return { bubbles: [...surviving, bubble], bubbleRandomState: rng }
}

/** Deterministic daily settlement: compute pressure, faction passives/abilities, ordinary spread & synthetic conversion, inflated token economy, bubbles & Project HUMAN. */
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
  const nextCountries = { ...run.countries } as Record<string, CountryRunState>
  let tokenReward = 0

  // 1. Cross-continental organic spillover once cross-border/multilingual/open-source tech is active.
  let crossRegionProgress = run.crossRegionProgress
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
          regionPlayablePopulation(b) - regionPlayablePopulation(a) || a.localeCompare(b, "en"))[0]
        if (enterMarketState(run, nextRegion, nextDay, markets, nextCountries)) {
          tokenReward += newMarketReward(run)
        }
      }
    }
  }

  // 2. Snapshot continental center totals and expand into unseeded countries inside entered continents.
  const continentalCenterCounts = new Map<RegionId, number>()
  const continentalAdoption = new Map<RegionId, number>()
  for (const id of regionIds) {
    continentalCenterCounts.set(id, regionCenters(run, id))
    continentalAdoption.set(id, regionAdoptionBps(run, id))
  }

  const newlyEnteredCountries = new Set<string>()
  for (const regionId of regionIds) {
    const market = markets[regionId]
    if (market.enteredDay === null) continue
    const regionCountries = countriesInRegion(regionId)
    const unseeded = regionCountries.filter(c => !nextCountries[c.id])
    if (!unseeded.length) continue

    const subsidized = nextDay <= market.subsidyUntilDay
    const regAdoptBps = continentalAdoption.get(regionId) ?? 0
    let igniteCount = 0
    if (openChannels === 0) {
      const seededCount = regionCountries.length - unseeded.length
      if (seededCount < 5 && nextDay % 4 === 0) igniteCount = 1
    } else {
      const networkSurge = regAdoptBps >= 4500 ? 6 : regAdoptBps >= 2000 ? 3 : 0
      igniteCount = 2 + Math.floor(openChannels / 2) + Math.min(2, multilingualLevel) + (subsidized ? 3 : 0) + networkSurge
    }
    for (const country of unseeded.slice(0, igniteCount)) {
      const existing = nextCountries[country.id]
      nextCountries[country.id] = {
        users: countrySeedUsers(country, false),
        synthetics: existing?.synthetics ?? 0,
        newlyConverted: 0,
        prevUsers: existing?.prevUsers ?? 0,
        retainedDays: existing?.retainedDays ?? 0,
        centers: existing?.centers ?? 0,
        unlockedTier: existing?.unlockedTier ?? 0,
        carry: existing?.carry ?? 0,
        dependencyBps: existing?.dependencyBps ?? opRules.initialDependencyBps,
      }
      newlyEnteredCountries.add(country.id)
    }
  }

  // 3. Per-country daily spread + parallel synthetic conversion with compute pressure & faction traits.
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
    const oldMarket = markets[regionId]
    if (oldMarket.enteredDay === null) {
      for (const spec of countriesInRegion(regionId)) settleCountryCompetition(run, nextDay, spec, computerDay, null, rivalSlowdownBps)
      continue
    }
    const subsidized = nextDay <= oldMarket.subsidyUntilDay
    if (subsidized) activeSubsidizedMarkets++
    const marketDay = Math.max(1, nextDay - oldMarket.enteredDay)
    const subsidyDay = oldMarket.subsidyStartedDay !== null && nextDay > oldMarket.subsidyStartedDay
      ? nextDay - oldMarket.subsidyStartedDay : undefined
    const regionPop = regionPlayablePopulation(regionId)
    const contCenters = continentalCenterCounts.get(regionId) ?? 0
    const contAdoptBps = continentalAdoption.get(regionId) ?? 0
    const nextApiDays = hasApi ? oldMarket.apiActiveDays + 1 : 0

    let regionNewSocial = 0
    let regionNewApi = 0

    for (const spec of countriesInRegion(regionId)) {
      const prev = nextCountries[spec.id]
      if (!prev) {
        settleCountryCompetition(run, nextDay, spec, computerDay, null, rivalSlowdownBps)
        continue
      }
      const start = run.countries[spec.id]
      const startUsers = start?.users ?? 0
      const startSynthetics = start?.synthetics ?? 0
      const seededToday = newlyEnteredCountries.has(spec.id) || prev.users > startUsers

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
        // Global/continental network effect prevents long 80-day tail stalls on tiny low-internet countries.
        const networkFloor = (prevGlobalAdoptionBps >= 5500 || contAdoptBps >= 5000) ? 0.018 : 0.005
        const hostUsers = prev.users
        const logisticBase = hostUsers > 0
          ? Math.max(spec.population * networkFloor, hostUsers * 0.16 + prev.synthetics * 0.04) * (1 - share * 0.62) * netFactor
          : Math.max(spec.population * Math.max(networkFloor, 0.008), prev.synthetics * 0.065) * (1 - share * 0.55) * netFactor

        let weightSum = 0
        if (openChannels > 0 || share < 0.18) {
          weightSum += 0.20
        }

        let socialWeight = 0
        let apiWeight = 0
        const baseMetrics = {
          factionCoverage: coveragePct,
          marketDay,
          apiDays: oldMarket.apiActiveDays,
          localCenters: prev.centers,
          continentalCenters: contCenters,
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
        const countryPopShare = regionPop > 0 ? spec.population / regionPop : 0
        if (oldMarket.prevNewSocialUsers > 0 && hostUsers > 0) {
          const remix = marketResearchValue(levels, "remixContacts", Math.round(oldMarket.prevNewSocialUsers * countryPopShare), { channel: "social" })
          rawCandidate += remix
          socialWeight += remix > 0 ? 0.05 : 0
        }
        if (nextDay % btoken.income.everyDays === 1 && oldMarket.prevOrgSeatReferrals > 0 && hostUsers > 0) {
          rawCandidate += marketResearchValue(levels, "seatReferrals", Math.round(oldMarket.prevOrgSeatReferrals * countryPopShare), {
            channel: "api",
            facts: sharedFacts,
          })
        }
        if (subsidized) {
          rawCandidate = Math.round(rawCandidate * opRules.subsidyMultiplierBps / 10000)
        }
        if (openChannels > 0 && remaining <= Math.max(3000, Math.ceil(spec.population * 0.008)) && rawCandidate > 0) {
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

      const localCap = localCountryCapacity(spec, prev.centers, contCenters, levels)
      const freeCap = Math.max(0, localCap - prevCovered)
      const inCap = Math.min(candidate, freeCap)
      const overflow = candidate - inCap
      // Unbacked overflow runs at ~38% speed, while small remainders alternate via carry so the last 1 person never stalls.
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
      const migrationCap = oldMarket.syntheticEnabled
        ? spec.population
        : Math.max(localCap, Math.floor(spec.population * competitionRules.migrationBaseCapacityBps / 10000))
      const { added, movedIn, movedOut } = settleCountryCompetition(run, nextDay, spec, computerDay, {
        factionId: run.setup.factionId,
        users: startUsers,
        synthetics: startSynthetics,
        newUsers: requested,
        migrationRoom: Math.max(0, migrationCap - startUsers - startSynthetics),
        appealBps: baseMigrationAppeal + (subsidized ? competitionRules.migrationSubsidyAppealBps : 0),
        retentionBps: migrationRetention,
        subsidized,
        syntheticActive: oldMarket.syntheticEnabled,
      }, rivalSlowdownBps)

      // Parallel synthetic conversion: data centers dramatically accelerate conversion while compute overload slows it.
      let converted = 0
      const convertiblePool = startUsers - movedOut
      if (oldMarket.syntheticEnabled && convertiblePool > 0 && remainingBudget > 0) {
        const rateBps = Math.round(
          (opRules.syntheticBaseDailyRateBps + prev.centers * opRules.syntheticCenterDailyRateBps)
            * compute.conversionMulBps / 10000,
        )
        const baseDailyCap = Math.max(1, Math.ceil(spec.population * Math.max(60, rateBps) / 10000))
        const capWithTech = Math.max(1, marketResearchValue(levels, "conversionCapacity", baseDailyCap, {
          facts: ["activePlan", ...sharedFacts],
          metrics: { localCenters: prev.centers },
        }))
        const sweepTail = convertiblePool <= Math.max(5000, Math.ceil(spec.population * 0.012)) ? convertiblePool : capWithTech
        converted = Math.min(convertiblePool, Math.max(capWithTech, sweepTail), remainingBudget)
        remainingBudget -= converted
        totalConvertedToday += converted
      }

      const previousUsers = convertiblePool - converted
      const nextUsers = previousUsers + added + movedIn
      const nextSynthetics = startSynthetics + converted
      const nextCovered = nextUsers + nextSynthetics

      regionNewSocial += Math.round(added * socialShareOfCandidate)
      regionNewApi += Math.round(added * apiShareOfCandidate)

      const nextAdoptionBps = Math.min(10000, Math.floor(nextCovered * 10000 / spec.population))
      const computedTier = tierForAdoption(nextAdoptionBps)
      const unlockedTier = isOriginCountry(run, spec.id)
        ? 3
        : (Math.max(prev.unlockedTier, computedTier) as 0 | 1 | 2 | 3)

      const depDiff = targetDep - prev.dependencyBps
      const depStep = depDiff === 0 ? 0
        : depDiff > 0 ? Math.min(depDiff, Math.max(10, Math.round(depDiff * 0.12)))
          : Math.max(depDiff, Math.min(-10, Math.round(depDiff * 0.10)))

      nextCountries[spec.id] = {
        users: nextUsers,
        synthetics: nextSynthetics,
        newlyConverted: converted,
        prevUsers: previousUsers,
        retainedDays: previousUsers > 0 ? Math.min(9999, prev.retainedDays + 1) : 0,
        centers: prev.centers,
        unlockedTier,
        carry: nextCarry,
        dependencyBps: Math.max(0, Math.min(10000, prev.dependencyBps + depStep)),
      }
    }

    const nextOrgSeats = hasOrgSeats ? oldMarket.orgSeats + Math.round(regionNewApi * 0.45) : oldMarket.orgSeats
    const nextRegionAdoptionBps = (() => {
      let sum = 0
      for (const country of countriesInRegion(regionId)) {
        const s = nextCountries[country.id]
        if (s) sum += s.users + s.synthetics
      }
      return regionPop > 0 ? Math.min(10000, Math.floor(sum * 10000 / regionPop)) : 0
    })()

    const claimed = [...oldMarket.milestonesClaimed]
    for (const milestone of btoken.adoptionMilestones) {
      if (nextRegionAdoptionBps >= milestone.adoptionBps && !claimed.includes(milestone.adoptionBps)) {
        claimed.push(milestone.adoptionBps)
        tokenReward += milestoneRewardForRun(run, milestone.reward)
      }
    }

    markets[regionId] = {
      ...oldMarket,
      milestonesClaimed: claimed,
      apiActiveDays: nextApiDays,
      orgSeats: nextOrgSeats,
      prevNewSocialUsers: regionNewSocial,
      prevOrgSeatReferrals: nextDay % btoken.income.everyDays === 0 ? nextOrgSeats : 0,
    }
  }

  // 4. Recompute global metrics & population map snapshot (with both ordinary & synthetic counts).
  const computer = finishComputerDay(computerDay, nextDay, scale)
  const { totalCovered, adoptionBps, syntheticBps, playerSyntheticBps, dependencyBps } = computeGlobalMetrics(nextCountries, computer.opponents)
  const countryPopulations = buildCountryPopulations(nextCountries, run.setup.factionId, computer.opponents)

  let builtCenters = 0
  for (const state of Object.values(nextCountries)) builtCenters += state.centers
  let completedTechs = 0
  for (const count of Object.values(levels)) completedTechs += count ?? 0

  // 5. Inflated daily Token Economy: scales smoothly from single digits -> millions -> billions -> trillions.
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
      const anyRetained = Object.values(nextCountries).some(c => c.retainedDays >= 2)
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

  // 6. Normalized population corpus flywheel (active synthetics yield 3x corpus per person).
  let rawPeopleCorpus = 0
  for (const state of Object.values(nextCountries)) {
    if (state.users <= 0 && state.synthetics <= 0) continue
    rawPeopleCorpus += countryRawCorpus(state, levels)
  }
  let enteredSumBps = 0
  let enteredCount = 0
  for (const id of regionIds) {
    if (markets[id].enteredDay === null) continue
    enteredCount++
    const pop = regionPlayablePopulation(id)
    let covered = 0
    for (const country of countriesInRegion(id)) {
      const s = nextCountries[country.id]
      if (s) covered += s.users + s.synthetics
    }
    enteredSumBps += pop > 0 ? Math.min(10000, Math.floor(covered * 10000 / pop)) : 0
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

  // 7. Exposure accumulation (synthetic conversion + compute overload outages + faction passives) & Project HUMAN.
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

  // 8. Interactive map bubbles (deterministic stream independent of narrative events).
  const { bubbles, bubbleRandomState } = settleMapBubbles(run, nextDay, nextCountries, exposureBps, nextTokenScale)

  return {
    markets,
    countries: nextCountries,
    opponents: computer.opponents,
    countryPopulations,
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
