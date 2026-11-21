import { btoken } from "../rules/v0.1/economy/btoken.ts"
import { decisions, type DecisionChoice, type DecisionDefinition, type DecisionEffect, type DecisionId } from "../rules/v0.1/events/decisions.ts"
import { eventPool, type EventContent } from "../rules/v0.1/events/pool.ts"
import { news } from "../rules/v0.1/events/news.ts"
import { actionById } from "../rules/v0.1/evolution/actions.ts"
import { researchNode, type SkillId } from "../rules/v0.1/evolution/trees.ts"
import type { Outcome } from "../rules/v0.1/endings/standard.ts"
import type { FactionId } from "../rules/v0.1/factions/roster.ts"
import { isFactionId, resolveStartRegionId, standardScenario } from "../rules/v0.1/scenario.ts"
import { countrySpec, globalPlayablePopulation } from "../rules/v0.1/world/countries.ts"
import type { RegionId } from "../rules/v0.1/world/regions.ts"
import type { GameCommand, RunCommand, TokenGrant } from "./types.ts"
import type { CountryPopulations } from "./population.ts"
import { marketResearchValue } from "./market-research.ts"
import {
  buildCountryPopulations,
  canBuildDataCenter,
  canBuyBuildCard,
  canFundConversion,
  canToggleSynthetic,
  canUseAction,
  computeGlobalMetrics,
  enterMarketState,
  initialOperations,
  publicStatementReliefBps,
  settleOperationsDay,
  syntheticActivationExposureBps,
  syntheticPeoplePerToken,
  totalSynthetics,
  type ActionCooldowns,
  type CountryRunState,
  type MarketRunState,
} from "./operations.ts"
import { completedLevel, completionDay, firstIdleSlot, initialResearch, parallelCompletionCorpus, projectsCompleting, researchCost, researchLevels, researchState, researchStatus,
  dailyCorpus, type ResearchState } from "./research.ts"

export interface RunSetup {
  readonly factionId: FactionId
  readonly startRegionId: RegionId
  readonly difficultyId: typeof standardScenario.difficulty.id
}

export interface RunEvent {
  readonly instanceId: string
  readonly day: number
  readonly content: EventContent
  readonly choiceId?: string
  readonly sourceSkillId?: SkillId
  readonly resolvedDay?: number
  /** Actual changes after payment and HUMAN clamping. */
  readonly effect?: DecisionEffect
  readonly followUpDay?: number
  readonly sourceInstanceId?: string
  readonly sourceChoiceId?: string
}

export interface RunState {
  readonly runId: string
  readonly rulesVersion: string
  readonly setup: RunSetup
  readonly seed: number
  /** Fully settled days. Commands at N affect the settlement of day N + 1 onward. */
  readonly completedDay: number
  readonly balance: number
  /** Hundredths of an operating token carried into the next income settlement. */
  readonly operatingRemainder?: number
  readonly adoptionBps: number | null
  readonly dependencyBps: number | null
  readonly countryPopulations?: CountryPopulations
  readonly syntheticBps: number
  readonly playerSyntheticBps: number
  readonly conversionBudgetPeople: number
  readonly syntheticActivatedDay: number | null
  readonly exposureBps: number
  readonly buildCards: number
  readonly markets: Readonly<Record<RegionId, MarketRunState>>
  readonly countries: Readonly<Record<string, CountryRunState>>
  readonly corpusRemainder: number
  readonly crossRegionProgress: number
  readonly actionCooldowns: ActionCooldowns
  readonly researchBps: number
  readonly research: ResearchState
  readonly events: readonly RunEvent[]
  readonly commands: readonly RunCommand[]
  readonly schedule: {
    readonly nextDay: number
    readonly randomState: number
    readonly remaining: readonly EventContent[]
  }
}

const { rules } = standardScenario
const uint32Range = 0x100000000

// Versioned deterministic draws. The same setup, seed and inputs reproduce the same timeline.
function nextRandom(state: number): number {
  return (Math.imul(state, 1664525) + 1013904223) >>> 0
}

function scheduleAfter(day: number, previousRandom: number, remaining: readonly EventContent[]) {
  const randomState = nextRandom(previousRandom)
  const { min, max } = rules.eventIntervalDays
  const interval = min + Math.floor(randomState / uint32Range * (max - min + 1))
  return { nextDay: day + interval, randomState, remaining }
}

export function createRun(input: { [K in keyof RunSetup]: string }, seed: number, runId = "standalone"): RunState | null {
  const { factionId, difficultyId } = input
  const startRegionId = resolveStartRegionId(input.startRegionId)
  if (!Number.isInteger(seed) || seed < 0 || seed >= uint32Range || !isFactionId(factionId)
    || !startRegionId || difficultyId !== standardScenario.difficulty.id
    || typeof runId !== "string" || !runId.trim()) return null
  const setup: RunSetup = { factionId, startRegionId, difficultyId }
  const ops = initialOperations(setup)
  return {
    runId, rulesVersion: rules.rulesVersion, setup, seed,
    completedDay: 0, balance: rules.initialBtoken, operatingRemainder: 0,
    ...ops, researchBps: 0, research: initialResearch(),
    events: [], commands: [], schedule: scheduleAfter(0, seed, eventPool),
  }
}

export function dailyOutcome(run: RunState): Outcome | null {
  if (run.researchBps >= rules.projectHuman.completionBps) return "human-victory"
  if (totalSynthetics(run) >= globalPlayablePopulation) {
    return run.playerSyntheticBps > rules.standardVictory.minPlayerSyntheticShareBps ? "ai-victory" : "human-victory"
  }
  return null
}

function eventInstance(run: RunState, content: EventContent): RunEvent {
  return { instanceId: `${run.runId}:${run.completedDay}:${content.id}`, day: run.completedDay, content }
}

function decisionEligible(run: RunState, id: DecisionId): boolean {
  const definition: DecisionDefinition = decisions[id]
  return run.completedDay >= definition.minDay && (!definition.requiresHuman || run.researchBps > 0)
    && (!definition.requiresSkill || completedLevel(run, definition.requiresSkill) > 0)
}

function followUpContent(id: string): EventContent | undefined {
  const item = news.find(entry => entry.id === id)
  return item ? { kind: "news", id: item.id } : undefined
}

function pendingFollowUps(run: RunState) {
  const pending: { parent: RunEvent; content: EventContent; day: number }[] = []
  for (const parent of run.events) {
    if (parent.followUpDay === undefined || parent.content.kind !== "decision" || !parent.choiceId
      || run.events.some(entry => entry.sourceInstanceId === parent.instanceId)) continue
    const followUp = decisionChoiceForRun(run, parent.content.id, parent.choiceId)?.followUp
    const content = followUp && followUpContent(followUp.id)
    if (content) pending.push({ parent, content, day: parent.followUpDay })
  }
  return pending
}

/** Its own seed stream makes this date independent of unrelated news draws. */
function codingMilestoneDay(run: RunState): number | undefined {
  const id = "unexpected-coding"
  const definition: DecisionDefinition = decisions[id]
  if (!definition.requiresSkill || !definition.delayDays
    || run.events.some(entry => entry.content.id === id)) return undefined
  const completions = researchState(run).projects.filter(project => project.skillId === definition.requiresSkill)
    .map(completionDay)
  if (!completions.length) return undefined
  const completed = Math.min(...completions)
  const draw = nextRandom((run.seed ^ completed ^ 0x9e3779b9) >>> 0)
  const { min, max } = definition.delayDays
  return completed + min + Math.floor(draw / uint32Range * (max - min + 1))
}

function codingMilestone(run: RunState): RunEvent | undefined {
  const id = "unexpected-coding"
  return codingMilestoneDay(run) === run.completedDay && decisionEligible(run, id)
    ? { ...eventInstance(run, { kind: "decision", id }), sourceSkillId: decisions[id].requiresSkill } : undefined
}

/** Read the next authored arrival without advancing time or consuming the random stream. */
export function nextEventDay(run: RunState): number | null {
  if (dailyOutcome(run)) return null
  const candidates = [run.schedule.nextDay]
  const milestoneDay = codingMilestoneDay(run)
  if (milestoneDay !== undefined) candidates.push(milestoneDay)
  for (const followUp of pendingFollowUps(run)) candidates.push(followUp.day)
  const future = candidates.filter(day => day > run.completedDay)
  return future.length ? Math.min(...future) : null
}

function advanceNarrativeEvents(run: RunState): RunState {
  const additions: RunEvent[] = []
  for (const { parent, content, day } of pendingFollowUps(run)) {
    if (day !== run.completedDay) continue
    additions.push({ ...eventInstance(run, content),
      instanceId: `${run.runId}:${run.completedDay}:${content.id}:${parent.instanceId}`,
      sourceInstanceId: parent.instanceId, sourceChoiceId: parent.choiceId })
  }

  let decision = codingMilestone(run)
  let schedule = run.schedule
  if (run.completedDay === schedule.nextDay) {
    const reports = eventPool.filter(content => content.kind !== "decision")
    let remaining = schedule.remaining.filter(content => content.kind !== "decision")
    if (!remaining.length) remaining = reports
    const candidates = [...remaining, ...eventPool.filter(content => content.kind === "decision" && !decision
      && !run.events.some(entry => entry.content.kind === "decision" && entry.content.id === content.id)
      && decisionEligible(run, content.id))]
    if (candidates.length) {
      const draw = nextRandom(schedule.randomState)
      const content = candidates[Math.floor(draw / uint32Range * candidates.length)]
      const entry = eventInstance(run, content)
      if (content.kind === "decision") decision = { ...entry,
        ...(decisions[content.id].requiresSkill ? { sourceSkillId: decisions[content.id].requiresSkill } : {}) }
      else additions.push(entry)
      schedule = scheduleAfter(run.completedDay, draw,
        remaining.filter(report => report.kind !== content.kind || report.id !== content.id))
    } else schedule = scheduleAfter(run.completedDay, schedule.randomState, remaining)
  }
  // Scene entry points open the final decision while all reports remain in the archive.
  if (decision) additions.push(decision)
  return { ...run, schedule, events: additions.length ? [...run.events, ...additions] : run.events }
}

export function advanceDay(run: RunState): RunState {
  if (dailyOutcome(run) || !Number.isSafeInteger(run.completedDay) || run.completedDay < 0
    || run.completedDay === Number.MAX_SAFE_INTEGER) return run
  const day = run.completedDay + 1
  const research = researchState(run)
  const op = settleOperationsDay(run, day)
  const payment = op.operatingPayment + op.tokenReward
  const finishing = projectsCompleting(run, day)
  const danger = finishing.reduce((sum, p) => sum + (researchNode(p.skillId).skill.dangerBps ?? 0), 0)
  const corpusIncome = dailyCorpus(run) + parallelCompletionCorpus(run, finishing.length) + op.populationCorpus
  if (!Number.isSafeInteger(run.balance) || run.balance < 0 || !Number.isSafeInteger(research.corpus) || research.corpus < 0
    || !Number.isSafeInteger(payment) || payment < 0 || !Number.isSafeInteger(corpusIncome) || corpusIncome < 0) return run
  // Natural income saturates at the representable limit without stopping the day clock.
  const balance = run.balance + Math.min(payment, Number.MAX_SAFE_INTEGER - run.balance)
  const corpus = research.corpus + Math.min(corpusIncome, Number.MAX_SAFE_INTEGER - research.corpus)
  const next: RunState = {
    ...run,
    completedDay: day,
    balance,
    operatingRemainder: op.operatingRemainder,
    adoptionBps: op.adoptionBps,
    dependencyBps: op.dependencyBps,
    countryPopulations: op.countryPopulations,
    syntheticBps: op.syntheticBps,
    playerSyntheticBps: op.playerSyntheticBps,
    conversionBudgetPeople: op.conversionBudgetPeople,
    exposureBps: op.exposureBps,
    markets: op.markets,
    countries: op.countries,
    corpusRemainder: op.corpusRemainder,
    crossRegionProgress: op.crossRegionProgress,
    researchBps: Math.min(rules.projectHuman.completionBps, run.researchBps + op.humanAdvanceBps + danger),
    research: { ...research, corpus },
  }
  if (dailyOutcome(next)) return next
  return advanceNarrativeEvents(next)
}

export function pendingDecision(run: RunState, instanceId: string, id: DecisionId) {
  return run.events.find(entry => entry.instanceId === instanceId && entry.content.kind === "decision"
    && entry.content.id === id && entry.choiceId === undefined)
}

export function nextCommandSeq(run: RunState) {
  return (run.commands.at(-1)?.seq ?? 0) + 1
}

function isNextCommandSeq(run: RunState, seq: number) {
  return Number.isSafeInteger(seq) && seq > 0 && seq === nextCommandSeq(run)
}

export function canUnlockSlot(run: RunState, slot: number): boolean {
  const { unlockedSlots, corpus } = researchState(run)
  return !dailyOutcome(run) && slot === unlockedSlots + 1 && slot <= rules.research.slotCosts.length
    && corpus >= rules.research.slotCosts[slot - 1]
}

export function unlockResearchSlot(run: RunState, slot: number, seq: number): RunState {
  if (!isNextCommandSeq(run, seq) || !canUnlockSlot(run, slot)) return run
  const research = researchState(run)
  const command: GameCommand = { kind: "unlockResearchSlot", slot, day: run.completedDay, seq }
  return { ...run, commands: [...run.commands, command],
    research: { ...research, unlockedSlots: slot, corpus: research.corpus - rules.research.slotCosts[slot - 1] } }
}

export function startResearch(run: RunState, skillId: string, seq: number): RunState {
  if (dailyOutcome(run) || !isNextCommandSeq(run, seq)) return run
  const node = researchNode(skillId)
  if (!node) return run
  const research = researchState(run)
  const status = researchStatus(run, node)
  const cost = researchCost(run, node)
  if ((status !== "available" && status !== "upgradable") || research.corpus < cost) return run
  const slot = firstIdleSlot(run)
  if (slot === null) return run
  const project = { skillId: node.skill.id, slot, startedDay: run.completedDay }
  const command: GameCommand = { kind: "buySkill", skillId, day: run.completedDay, seq }
  return { ...run, commands: [...run.commands, command],
    research: { ...research, corpus: research.corpus - cost, projects: [...research.projects, project] } }
}

export function canGrantTokens(run: RunState, amount: number) {
  return !dailyOutcome(run) && Number.isSafeInteger(run.balance) && run.balance >= 0
    && Number.isSafeInteger(amount) && amount > 0
    && amount <= Number.MAX_SAFE_INTEGER - run.balance
}

export function grantDeveloperTokens(run: RunState, amount: number, seq: number): RunState {
  if (!canGrantTokens(run, amount) || !isNextCommandSeq(run, seq)) return run
  const command: TokenGrant = { kind: "devGrantTokens", day: run.completedDay, seq, amount }
  return { ...run, balance: run.balance + amount, commands: [...run.commands, command] }
}

export function buyBuildCard(run: RunState, seq: number): RunState {
  if (!isNextCommandSeq(run, seq) || canBuyBuildCard(run) !== "available") return run
  const command: GameCommand = { kind: "buyBuildCard", day: run.completedDay, seq }
  return {
    ...run,
    balance: run.balance - btoken.buildCardCost,
    buildCards: run.buildCards + 1,
    commands: [...run.commands, command],
  }
}

export function buildDataCenter(run: RunState, countryId: string, seq: number): RunState {
  if (!isNextCommandSeq(run, seq) || canBuildDataCenter(run, countryId) !== "available") return run
  const spec = countrySpec(countryId)
  if (!spec) return run
  const existing = run.countries[countryId]
  const nextCountry: CountryRunState = existing
    ? { ...existing, centers: existing.centers + 1 }
    : {
      users: 0,
      synthetics: 0,
      newlyConverted: 0,
      prevUsers: 0,
      retainedDays: 0,
      centers: 1,
      unlockedTier: 3,
      carry: 0,
      dependencyBps: rules.operations.initialDependencyBps,
    }
  const command: GameCommand = { kind: "buildDataCenter", countryId, day: run.completedDay, seq }
  return {
    ...run,
    buildCards: run.buildCards - 1,
    countries: { ...run.countries, [countryId]: nextCountry },
    commands: [...run.commands, command],
  }
}

export function fundConversion(run: RunState, tokens: number, seq: number): RunState {
  if (!isNextCommandSeq(run, seq) || canFundConversion(run, tokens) !== "available") return run
  const quota = syntheticPeoplePerToken(run) * tokens
  const command: GameCommand = { kind: "fundConversion", tokens, day: run.completedDay, seq }
  return {
    ...run,
    balance: run.balance - tokens,
    conversionBudgetPeople: run.conversionBudgetPeople + quota,
    commands: [...run.commands, command],
  }
}

export function toggleSyntheticProgram(run: RunState, regionId: RegionId, enabled: boolean, seq: number): RunState {
  if (!isNextCommandSeq(run, seq) || canToggleSynthetic(run, regionId, enabled) !== "available") return run
  const market = run.markets[regionId]
  const firstInMarket = enabled && market.syntheticActivatedDay === null
  const exposureDelta = firstInMarket ? syntheticActivationExposureBps(run) : 0
  const command: GameCommand = { kind: "toggleSynthetic", regionId, enabled, day: run.completedDay, seq }
  return {
    ...run,
    exposureBps: Math.min(10000, run.exposureBps + exposureDelta),
    syntheticActivatedDay: enabled && run.syntheticActivatedDay === null ? run.completedDay : run.syntheticActivatedDay,
    markets: {
      ...run.markets,
      [regionId]: {
        ...market,
        syntheticEnabled: enabled,
        syntheticActivatedDay: firstInMarket ? run.completedDay : market.syntheticActivatedDay,
      },
    },
    commands: [...run.commands, command],
  }
}

export function useAction(run: RunState, abilityId: string, seq: number, targetRegionId?: RegionId): RunState {
  if (!isNextCommandSeq(run, seq) || canUseAction(run, abilityId, targetRegionId) !== "available") return run
  const action = actionById(abilityId)
  if (!action) return run
  const op = rules.operations
  const command: GameCommand = targetRegionId !== undefined
    ? { kind: "useAbility", abilityId: action.id, targetRegionId, day: run.completedDay, seq }
    : { kind: "useAbility", abilityId: action.id, day: run.completedDay, seq }

  if (action.id === "public-statement") {
    const relief = publicStatementReliefBps(run)
    return {
      ...run,
      balance: run.balance - action.cost,
      exposureBps: Math.max(0, run.exposureBps - relief),
      actionCooldowns: { ...run.actionCooldowns, publicStatementUntilDay: run.completedDay + op.prCooldownDays },
      commands: [...run.commands, command],
    }
  }

  if (action.id === "protocol-rebuild") {
    return {
      ...run,
      balance: run.balance - action.cost,
      researchBps: Math.max(0, run.researchBps - op.protocolRebuildHumanBps),
      exposureBps: Math.max(0, run.exposureBps - op.protocolRebuildExposureBps),
      actionCooldowns: { ...run.actionCooldowns, protocolRebuildUntilDay: run.completedDay + op.protocolRebuildCooldownDays },
      commands: [...run.commands, command],
    }
  }

  if (action.id === "cross-border-cloud" && targetRegionId) {
    const markets = { ...run.markets } as Record<RegionId, MarketRunState>
    const countries = { ...run.countries } as Record<string, CountryRunState>
    if (!enterMarketState(run, targetRegionId, run.completedDay, markets, countries)) return run
    const { adoptionBps, syntheticBps, playerSyntheticBps, dependencyBps } = computeGlobalMetrics(countries)
    return {
      ...run,
      balance: run.balance - action.cost + btoken.newMarketReward,
      markets,
      countries,
      countryPopulations: buildCountryPopulations(countries, run.setup.factionId),
      adoptionBps,
      syntheticBps,
      playerSyntheticBps,
      dependencyBps,
      commands: [...run.commands, command],
    }
  }

  if (action.id === "market-subsidy" && targetRegionId) {
    const market = run.markets[targetRegionId]
    const exposureDelta = Math.max(0, Math.round(marketResearchValue(researchLevels(run), "exposure", op.subsidyExposureBps)))
    return {
      ...run,
      balance: run.balance - action.cost,
      exposureBps: Math.min(10000, run.exposureBps + exposureDelta),
      markets: {
        ...run.markets,
        [targetRegionId]: {
          ...market,
          subsidyStartedDay: run.completedDay,
          subsidyUntilDay: run.completedDay + op.subsidyDurationDays,
        },
      },
      commands: [...run.commands, command],
    }
  }

  return run
}

/** The UI and reducer read the same authored choice. */
export function decisionChoiceForRun(run: RunState, id: DecisionId, choiceId: string): DecisionChoice | undefined {
  if (!Object.hasOwn(decisions, id)) return undefined
  return decisions[id].choices.find(choice => choice.id === choiceId)
}

/** Preview the same net changes that settlement records, even before the player can afford them. */
export function decisionEffectForRun(run: RunState, id: DecisionId, choiceId: string): DecisionEffect | undefined {
  const choice = decisionChoiceForRun(run, id, choiceId)
  if (!choice || !Number.isSafeInteger(choice.cost) || choice.cost < 0
    || !Number.isSafeInteger(choice.corpusCost) || choice.corpusCost < 0
    || !Object.values(choice.effect).every(Number.isSafeInteger)
    || !Number.isSafeInteger(run.researchBps) || run.researchBps < 0
    || run.researchBps > rules.projectHuman.completionBps) return undefined
  const tokens = choice.effect.tokens - choice.cost
  const corpus = choice.effect.corpus - choice.corpusCost
  const progress = run.researchBps + choice.effect.humanBps
  if (!Number.isSafeInteger(tokens) || !Number.isSafeInteger(corpus) || !Number.isSafeInteger(progress)) return undefined
  return { tokens, corpus, humanBps: Math.max(0, Math.min(rules.projectHuman.completionBps, progress)) - run.researchBps }
}

export type DecisionChoiceStatus = "available" | "tokens" | "corpus" | "unavailable"

export function decisionChoiceStatus(run: RunState, id: DecisionId, choiceId: string): DecisionChoiceStatus {
  if (dailyOutcome(run) || !Number.isSafeInteger(nextCommandSeq(run))) return "unavailable"
  const choice = decisionChoiceForRun(run, id, choiceId)
  const effect = decisionEffectForRun(run, id, choiceId)
  if (!choice || !effect) return "unavailable"
  const corpus = researchState(run).corpus
  if (!Number.isSafeInteger(run.balance) || run.balance < 0 || !Number.isSafeInteger(corpus) || corpus < 0
    || !Number.isSafeInteger(run.researchBps) || run.researchBps < 0
    || run.researchBps > rules.projectHuman.completionBps) return "unavailable"
  if (run.balance < choice.cost) return "tokens"
  if (corpus < choice.corpusCost) return "corpus"
  const balanceAfter = run.balance + effect.tokens
  const corpusAfter = corpus + effect.corpus
  if (balanceAfter < 0) return "tokens"
  if (corpusAfter < 0) return "corpus"
  if (!Number.isSafeInteger(balanceAfter) || !Number.isSafeInteger(corpusAfter)) return "unavailable"
  if (choice.followUp && (!followUpContent(choice.followUp.id) || !Number.isSafeInteger(choice.followUp.delayDays)
    || choice.followUp.delayDays < 1 || !Number.isSafeInteger(run.completedDay + choice.followUp.delayDays))) return "unavailable"
  return "available"
}

export function resolveDecision(run: RunState, instanceId: string, id: DecisionId, choiceId: string): RunState {
  if (decisionChoiceStatus(run, id, choiceId) !== "available") return run
  const entry = pendingDecision(run, instanceId, id)
  if (!entry) return run
  const choice = decisionChoiceForRun(run, id, choiceId)!
  const command: GameCommand = {
    kind: "chooseEvent", day: run.completedDay, seq: nextCommandSeq(run),
    eventInstanceId: instanceId, choiceId,
  }
  const research = researchState(run)
  const effect = decisionEffectForRun(run, id, choiceId)!
  const balance = run.balance + effect.tokens
  const corpus = research.corpus + effect.corpus
  const researchBps = run.researchBps + effect.humanBps
  const resolved = { ...entry, choiceId, resolvedDay: run.completedDay, effect,
    ...(choice.followUp ? { followUpDay: run.completedDay + choice.followUp.delayDays } : {}) }
  return {
    ...run, balance, researchBps, research: { ...research, corpus },
    events: run.events.map(event => event === entry ? resolved : event),
    commands: [...run.commands, command],
  }
}
