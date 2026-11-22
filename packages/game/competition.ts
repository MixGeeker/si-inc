import { btoken } from "../rules/v0.1/economy/btoken.ts"
import { actions } from "../rules/v0.1/evolution/actions.ts"
import { factions, type FactionId } from "../rules/v0.1/factions/roster.ts"
import { competitionRules, computerStrategies } from "../rules/v0.1/opposition/computer-factions.ts"
import { standardScenario } from "../rules/v0.1/scenario.ts"
import {
  countriesInRegion,
  countrySpec,
  globalPlayablePopulation,
  originCountries,
  slotUnlockLimit,
  type CountrySpec,
} from "../rules/v0.1/world/countries.ts"
import { regionIds, type RegionId } from "../rules/v0.1/world/regions.ts"
import type { RunSetup, RunState } from "./run.ts"

type UnlockTier = 0 | 1 | 2 | 3

export interface ComputerCountryState {
  readonly users: number
  readonly synthetics: number
  readonly centers: number
  readonly unlockedTier: UnlockTier
}

export interface ComputerFactionState {
  readonly factionId: FactionId
  readonly startRegionId: RegionId
  readonly balance: number
  readonly corpus: number
  readonly researchLevel: number
  readonly buildCards: number
  readonly markets: Readonly<Record<RegionId, number | null>>
  readonly countries: Readonly<Record<string, ComputerCountryState>>
  readonly syntheticActivatedDay: number | null
  readonly conversionBudgetPeople: number
}

export type ComputerFactions = Readonly<Partial<Record<FactionId, ComputerFactionState>>>

interface ComputerDayDraft {
  readonly previous: ComputerFactionState
  readonly countries: Record<string, ComputerCountryState>
  readonly markets: Record<RegionId, number | null>
  readonly seeds: Set<string>
  balance: number
  corpus: number
  researchLevel: number
  buildCards: number
  syntheticActivatedDay: number | null
  conversionBudgetPeople: number
  exposureGain: number
  converted: number
}

interface CountryContestant {
  readonly factionId: FactionId
  readonly users: number
  readonly synthetics: number
  readonly newUsers: number
  readonly migrationRoom: number
  readonly appealBps: number
  readonly retentionBps: number
  readonly subsidized: boolean
}

interface CountryContest {
  readonly contestant: CountryContestant
  added: number
  movedIn: number
  movedOut: number
}

const { rules } = standardScenario
const operations = rules.operations
const factionIds = Object.keys(factions) as FactionId[]
const expansionCost = actions.find(action => action.id === "cross-border-cloud")!.cost
const emptyCountry: ComputerCountryState = { users: 0, synthetics: 0, centers: 0, unlockedTier: 0 }

export function countrySeedUsers(country: CountrySpec, origin: boolean): number {
  const bps = origin ? operations.originSeedBps : operations.countryEntrySeedBps
  const min = origin ? operations.originSeedMin : operations.countryEntrySeedMin
  return Math.min(country.population, Math.max(min, Math.round(country.population * bps / 10000)))
}

export function countryOccupiedCenters(run: RunState, countryId: string): number {
  let centers = run.countries[countryId]?.centers ?? 0
  for (const faction of Object.values(run.opponents)) centers += faction.countries[countryId]?.centers ?? 0
  return centers
}

export function countryOpenPopulation(run: RunState, spec: CountrySpec): number {
  let open = spec.population
  const player = run.countries[spec.id]
  if (player) open -= player.users + player.synthetics
  for (const faction of Object.values(run.opponents)) {
    const country = faction.countries[spec.id]
    if (country) open -= country.users + country.synthetics
  }
  return Math.max(0, open)
}

export function tierForAdoption(adoptionBps: number): UnlockTier {
  const [first, second, third] = operations.unlockThresholdsBps
  if (adoptionBps >= third) return 3
  if (adoptionBps >= second) return 2
  if (adoptionBps >= first) return 1
  return 0
}

export function initialComputerFactions(setup: RunSetup): ComputerFactions {
  const opponents: Partial<Record<FactionId, ComputerFactionState>> = {}
  const occupied = new Set<RegionId>([setup.startRegionId])
  for (const factionId of factionIds) {
    if (factionId === setup.factionId) continue
    const startRegionId = computerStrategies[factionId].regions.find(region => !occupied.has(region))!
    occupied.add(startRegionId)
    const origin = countrySpec(originCountries[startRegionId])!
    opponents[factionId] = {
      factionId,
      startRegionId,
      balance: rules.initialBtoken,
      corpus: rules.research.initialCorpus,
      researchLevel: 0,
      buildCards: 0,
      markets: Object.fromEntries(regionIds.map(region => [region, region === startRegionId ? 0 : null])) as Record<RegionId, number | null>,
      countries: { [origin.id]: { ...emptyCountry, users: countrySeedUsers(origin, true), unlockedTier: 3 } },
      syntheticActivatedDay: null,
      conversionBudgetPeople: 0,
    }
  }
  return opponents
}

/** A separate deterministic stream for contested claims keeps narrative draws unchanged. */
function initiative(seed: number, day: number, key: string, faction: FactionId): number {
  let hash = (seed ^ Math.imul(day, 0x9e3779b9)) >>> 0
  for (const char of `${key}:${faction}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
  hash ^= hash >>> 16
  hash = Math.imul(hash, 0x85ebca6b)
  return (hash ^ (hash >>> 13)) >>> 0
}

function constructionTarget(run: RunState, draft: ComputerDayDraft) {
  const originId = originCountries[draft.previous.startRegionId]
  let target: CountrySpec | undefined
  let bestScore = 0
  for (const [countryId, state] of Object.entries(draft.previous.countries)) {
    const spec = countrySpec(countryId)!
    if (state.centers >= slotUnlockLimit(spec.slots, state.unlockedTier) || countryOccupiedCenters(run, countryId) >= spec.slots) continue
    const uncoveredDemand = state.users + state.synthetics - state.centers * spec.slotCapacity
    const originBonus = countryId === originId && state.centers === 0 ? spec.slotCapacity : 0
    const score = uncoveredDemand + originBonus
    if (score > bestScore || (score === bestScore && target && countryId < target.id)) {
      bestScore = score
      target = spec
    }
  }
  return target
}

export function beginComputerDay(run: RunState, day: number): ComputerDayDraft[] {
  const opponents = factionIds.flatMap(id => run.opponents[id] ? [run.opponents[id]] : [])
  const drafts = opponents.map(previous => ({
    previous,
    countries: { ...previous.countries },
    markets: { ...previous.markets },
    seeds: new Set<string>(),
    balance: previous.balance,
    corpus: previous.corpus,
    researchLevel: previous.researchLevel,
    buildCards: previous.buildCards,
    syntheticActivatedDay: previous.syntheticActivatedDay,
    conversionBudgetPeople: previous.conversionBudgetPeople,
    exposureGain: 0,
    converted: 0,
  }))
  const construction: { draft: ComputerDayDraft; spec: CountrySpec }[] = []
  for (const draft of drafts) {
    const { previous } = draft
    const strategy = computerStrategies[previous.factionId]
    const researchCost = (competitionRules.researchCosts as readonly number[])[draft.researchLevel]
    if (researchCost !== undefined && draft.corpus >= researchCost) {
      draft.corpus -= researchCost
      draft.researchLevel++
    }
    if (day % strategy.expansionEveryDays === 0 && draft.balance >= expansionCost) {
      const market = strategy.regions.find(region => draft.markets[region] === null)
      if (market) {
        draft.markets[market] = day
        draft.balance += btoken.newMarketReward - expansionCost
      }
    }
    for (const region of regionIds) {
      if (draft.markets[region] === null) continue
      let toSeed: number = strategy.countriesPerDay
      for (const spec of countriesInRegion(region)) {
        if (toSeed === 0) break
        if (previous.countries[spec.id]) continue
        draft.seeds.add(spec.id)
        toSeed--
      }
    }

    if (draft.syntheticActivatedDay === null && day >= strategy.conversionStartDay
      && Object.entries(previous.countries).some(([countryId, state]) => state.users > 0 && canComputerConvert(run, countrySpec(countryId)!))) {
      draft.syntheticActivatedDay = day
      draft.exposureGain += competitionRules.activationExposureBps
    }
    if (draft.syntheticActivatedDay !== null && draft.conversionBudgetPeople < competitionRules.conversionReservePeople && draft.balance >= 1) {
      draft.balance--
      draft.conversionBudgetPeople += operations.syntheticTokenPeople
    }

    const spec = constructionTarget(run, draft)
    if (spec && (draft.buildCards > 0 || draft.balance >= btoken.buildCardCost)) {
      if (draft.buildCards === 0) {
        draft.balance -= btoken.buildCardCost
        draft.buildCards++
      }
      construction.push({ draft, spec })
    }
  }

  const occupied = new Map<string, number>()
  construction.sort((a, b) => initiative(run.seed, day, a.spec.id, a.draft.previous.factionId)
    - initiative(run.seed, day, b.spec.id, b.draft.previous.factionId))
  for (const { draft, spec } of construction) {
    const alreadyOccupied = occupied.get(spec.id) ?? countryOccupiedCenters(run, spec.id)
    if (alreadyOccupied >= spec.slots) continue
    draft.buildCards--
    draft.countries[spec.id] = { ...draft.countries[spec.id], centers: draft.countries[spec.id].centers + 1 }
    occupied.set(spec.id, alreadyOccupied + 1)
  }
  return drafts
}

function canComputerConvert(run: RunState, spec: CountrySpec) {
  return conversionCoverageReached(spec, countryOpenPopulation(run, spec))
}

function conversionCoverageReached(spec: CountrySpec, open: number) {
  return (spec.population - open) * 10000 >= spec.population * competitionRules.minimumCoverageForConversionBps
}

function computerContestant(draft: ComputerDayDraft, spec: CountrySpec): CountryContestant | null {
  if (draft.markets[spec.regionId] === null) return null
  const previous = draft.previous.countries[spec.id]
  if (!previous && !draft.seeds.has(spec.id)) return null
  const state = previous ?? emptyCountry
  const strategy = computerStrategies[draft.previous.factionId]
  const covered = state.users + state.synthetics
  const share = covered / spec.population
  const netFactor = 0.45 + 0.55 * spec.internetBps / 10000
  const reachBps = strategy.reachBps + draft.researchLevel * competitionRules.reachPerResearchBps
  const demand = previous
    ? Math.round(Math.max(spec.population * 0.003, state.users * 0.14 + state.synthetics * 0.03) * (1 - share * 0.68) * netFactor * reachBps / 10000)
    : countrySeedUsers(spec, false)
  const capacity = state.centers * spec.slotCapacity
  const fullSpeed = Math.min(demand, Math.max(0, capacity - covered))
  return {
    factionId: draft.previous.factionId,
    users: state.users,
    synthetics: state.synthetics,
    newUsers: previous ? Math.max(1, fullSpeed + Math.ceil((demand - fullSpeed) / 2)) : demand,
    migrationRoom: Math.max(0, Math.max(capacity, Math.round(spec.population * competitionRules.migrationBaseCapacityBps / 10000)) - covered),
    appealBps: strategy.appealBps + draft.researchLevel * competitionRules.appealPerResearchBps,
    retentionBps: 10000,
    subsidized: false,
  }
}

function allocate(demands: readonly number[], available: number, rank: (index: number) => number): number[] {
  const total = demands.reduce((sum, demand) => sum + demand, 0)
  if (total <= available) return [...demands]
  if (available <= 0) return demands.map(() => 0)
  const demandsByShare = demands.map(demand => demand / total * available)
  const allocated = demandsByShare.map(Math.floor)
  const remainder = available - allocated.reduce((sum, amount) => sum + amount, 0)
  const order = demandsByShare.map((amount, index) => ({ index, fraction: amount - allocated[index], rank: rank(index) }))
    .sort((a, b) => b.fraction - a.fraction || a.rank - b.rank)
  for (const { index } of order.slice(0, remainder)) allocated[index]++
  return allocated
}

/** Both arrivals and transfers are apportioned using start-of-day owners. */
function settlePopulation(run: RunState, day: number, spec: CountrySpec, open: number, contestants: readonly CountryContestant[]) {
  const added = allocate(contestants.map(contestant => contestant.newUsers), open,
    index => initiative(run.seed, day, spec.id, contestants[index].factionId))
  const settled: CountryContest[] = contestants.map((contestant, index) => ({ contestant, added: added[index], movedIn: 0, movedOut: 0 }))
  if (settled.length <= 1 || !settled.some(({ contestant, added }) => contestant.migrationRoom > added)) return settled

  // Build all source offers before any destination applies them. If an inheriting provider has
  // fewer seats than offers, users it cannot take remain at their original provider.
  const offers = settled.map(({ contestant: donor }) => {
    const bids = settled.map(({ contestant: recipient, added }) => {
      if (recipient.factionId === donor.factionId || recipient.migrationRoom <= added) return 0
      const difference = recipient.appealBps - donor.appealBps
      const appeal = Math.min(1, Math.max(0, difference / competitionRules.migrationAppealSpreadBps))
      const rate = recipient.subsidized ? competitionRules.subsidizedMigrationBps : competitionRules.migrationBps
      return Math.floor(donor.users * rate / 10000 * appeal * donor.retentionBps / 10000)
    })
    return allocate(bids, Math.max(...bids), index => initiative(run.seed, day, `${spec.id}:${donor.factionId}`, contestants[index].factionId))
  })
  for (const [destinationIndex, destination] of settled.entries()) {
    const available = Math.max(0, destination.contestant.migrationRoom - destination.added)
    const transfers = allocate(offers.map(offer => offer[destinationIndex]), available,
      index => initiative(run.seed, day, `${spec.id}:${destination.contestant.factionId}`, contestants[index].factionId))
    for (const [sourceIndex, amount] of transfers.entries()) {
      settled[sourceIndex].movedOut += amount
      destination.movedIn += amount
    }
  }
  return settled
}

export function settleCountryCompetition(
  run: RunState,
  day: number,
  spec: CountrySpec,
  drafts: readonly ComputerDayDraft[],
  player: CountryContestant | null,
) {
  const contestants = player ? [player] : []
  for (const draft of drafts) {
    const contestant = computerContestant(draft, spec)
    if (contestant) contestants.push(contestant)
  }
  if (contestants.length === 0) return { added: 0, movedIn: 0, movedOut: 0 }
  const open = countryOpenPopulation(run, spec)
  const settled = settlePopulation(run, day, spec, open, contestants)
  for (const draft of drafts) {
    const result = settled.find(entry => entry.contestant.factionId === draft.previous.factionId)
    if (!result) continue
    const current = draft.countries[spec.id] ?? emptyCountry
    const { contestant, added, movedIn, movedOut } = result
    const convertible = contestant.users - movedOut
    let converted = 0
    if (convertible > 0 && draft.syntheticActivatedDay !== null && conversionCoverageReached(spec, open)) {
      const centers = draft.previous.countries[spec.id]?.centers ?? 0
      const cap = Math.ceil(spec.population * (operations.syntheticBaseDailyRateBps + centers * operations.syntheticCenterDailyRateBps) / 10000)
      converted = Math.min(convertible, cap, draft.conversionBudgetPeople)
      draft.conversionBudgetPeople -= converted
      draft.converted += converted
    }
    const users = convertible - converted + added + movedIn
    const observedTier = tierForAdoption(Math.floor((users + converted) * 10000 / spec.population))
    draft.countries[spec.id] = {
      users,
      synthetics: contestant.synthetics + converted,
      centers: current.centers,
      unlockedTier: Math.max(current.unlockedTier, observedTier) as UnlockTier,
    }
  }
  return player ? settled[0] : { added: 0, movedIn: 0, movedOut: 0 }
}

export function finishComputerDay(drafts: readonly ComputerDayDraft[], day: number) {
  const opponents: Partial<Record<FactionId, ComputerFactionState>> = {}
  let exposureGain = 0
  let firstActivationDay: number | null = null
  for (const draft of drafts) {
    let users = 0
    let synthetics = 0
    for (const country of Object.values(draft.countries)) {
      users += country.users
      synthetics += country.synthetics
    }
    const adoption = (users + synthetics) * 10000 / globalPlayablePopulation
    const { income } = btoken
    const tokenIncome = day % income.everyDays === 0
      ? Math.min(income.maximum, income.base + Math.floor(adoption / income.adoptionStepBps)) : 0
    const corpus = rules.research.dailyCorpus + Math.floor((users + synthetics * operations.syntheticCorpusMultiplier)
      / globalPlayablePopulation * operations.corpusFlywheelMaxDaily)
    const { factionId, startRegionId } = draft.previous
    opponents[factionId] = {
      factionId,
      startRegionId,
      balance: draft.balance + Math.min(tokenIncome, Number.MAX_SAFE_INTEGER - draft.balance),
      corpus: draft.corpus + Math.min(corpus, Number.MAX_SAFE_INTEGER - draft.corpus),
      researchLevel: draft.researchLevel,
      buildCards: draft.buildCards,
      markets: draft.markets,
      countries: draft.countries,
      syntheticActivatedDay: draft.syntheticActivatedDay,
      conversionBudgetPeople: draft.conversionBudgetPeople,
    }
    exposureGain += draft.exposureGain
    if (draft.converted > 0) exposureGain += competitionRules.conversionExposureBps
    if (draft.syntheticActivatedDay !== null) {
      firstActivationDay = Math.min(firstActivationDay ?? draft.syntheticActivatedDay, draft.syntheticActivatedDay)
    }
  }
  return { opponents, exposureGain, firstActivationDay }
}
