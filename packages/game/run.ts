import { decisions, type DecisionChoice, type DecisionDefinition, type DecisionEffect, type DecisionId } from "../rules/v0.1/events/decisions.ts"
import { eventPool, type EventContent } from "../rules/v0.1/events/pool.ts"
import { news, type MilestoneNewsId } from "../rules/v0.1/events/news.ts"
import { actionById } from "../rules/v0.1/evolution/actions.ts"
import { researchNode, type SkillId } from "../rules/v0.1/evolution/trees.ts"
import type { Outcome } from "../rules/v0.1/endings/standard.ts"
import { factions, type FactionId } from "../rules/v0.1/factions/roster.ts"
import { isFactionId, isRegionId, resolveStartRegionId, standardScenario } from "../rules/v0.1/scenario.ts"
import type { RegionId } from "../rules/v0.1/world/regions.ts"
import type { GameCommand, RunCommand, TokenGrant } from "./types.ts"
import type { RegionPopulations } from "./population.ts"
import type { ComputerFactions } from "./competition.ts"
import { marketResearchValue } from "./market-research.ts"
import {
  actionCost,
  buildCardCost,
  buildRegionPopulations,
  canBuildDataCenter,
  canBuyBuildCard,
  canCollectBubble,
  canFundConversion,
  canToggleSynthetic,
  canUseAction,
  computeGlobalMetrics,
  computePressure,
  conversionPeopleForTokens,
  enterMarketState,
  hallucinationWindfallTokens,
  hasPlayerSyntheticMajority,
  initialOperations,
  isPlayerFactionAbility,
  newMarketReward,
  publicStatementReliefBps,
  roundNiceToken,
  settleOperationsDay,
  syntheticActivationExposureBps,
  tokenScaleOf,
  totalCenters,
  type ActionCooldowns,
  type MapBubble,
  type MarketRunState,
} from "./operations.ts"
import {
  activateQueueHeadState,
  advanceResearchQueue,
  canCancelResearch,
  canMoveResearch,
  canQueueResearch,
  cancelCascadeSlots,
  completedLevel,
  completionDay,
  dailyCorpus,
  firstIdleSlot,
  initialResearch,
  isProjectCompleted,
  projectQueueEstimatedDays,
  queuedResearchProjects,
  researchLevels,
  researchState,
  type ResearchProject,
  type ResearchState,
} from "./research.ts"

export interface RunSetup {
  readonly factionId: FactionId
  readonly startRegionId: RegionId
  readonly difficultyId: typeof standardScenario.difficulty.id
}

export interface RunEvent {
  readonly instanceId: string
  readonly day: number
  readonly content: EventContent
  readonly milestone?: boolean
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
  /** Current economic token scale multiplier (1 -> millions -> billions -> trillions). */
  readonly tokenScale: number
  /** Cumulative tokens processed/earned during this run. */
  readonly lifetimeTokens: number
  /** Hundredths of an operating token unit carried into the next income settlement. */
  readonly operatingRemainder?: number
  readonly adoptionBps: number | null
  readonly dependencyBps: number | null
  readonly regionPopulations: RegionPopulations
  readonly syntheticBps: number
  readonly playerSyntheticBps: number
  readonly conversionBudgetPeople: number
  readonly syntheticActivatedDay: number | null
  readonly exposureBps: number
  readonly buildCards: number
  readonly markets: Readonly<Record<RegionId, MarketRunState>>
  readonly opponents: ComputerFactions
  readonly corpusRemainder: number
  readonly crossRegionProgress: number
  readonly actionCooldowns: ActionCooldowns
  readonly bubbles: readonly MapBubble[]
  readonly bubbleRandomState: number
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
  const ops = initialOperations(setup, seed)
  return {
    runId, rulesVersion: rules.rulesVersion, setup, seed,
    completedDay: 0, balance: rules.initialBtoken, operatingRemainder: 0,
    ...ops, researchBps: 0, research: initialResearch(),
    events: [], commands: [], schedule: scheduleAfter(0, seed, eventPool),
  }
}

export function dailyOutcome(run: RunState): Outcome | null {
  if (run.researchBps >= rules.projectHuman.completionBps) return "human-victory"
  if (run.syntheticBps >= rules.standardVictory.minGlobalSyntheticBps) {
    return hasPlayerSyntheticMajority(run) ? "ai-victory" : "rival-victory"
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
  const workPerDay = computePressure(run).researchWorkPerDay
  const completions = researchState(run).projects
    .filter(project => project.skillId === definition.requiresSkill)
    .map(project => isProjectCompleted(run, project)
      ? completionDay(project)
      : run.completedDay + projectQueueEstimatedDays(run, project.slot, workPerDay))
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
  if (decision) additions.push(decision)
  return { ...run, schedule, events: additions.length ? [...run.events, ...additions] : run.events }
}

function milestoneAdditions(previous: RunState, next: RunState, computeStatus: string): RunEvent[] {
  const seen = new Set(previous.events.map(entry => entry.content.id))
  const results: RunEvent[] = []
  function push(id: MilestoneNewsId) {
    if (seen.has(id)) return
    seen.add(id)
    results.push({ ...eventInstance(next, { kind: "news", id }), milestone: true })
  }
  if (totalCenters(next) >= 1) push("milestone-first-center")
  if (computeStatus === "overloaded" || computeStatus === "critical") push("milestone-compute-overload")
  if (next.syntheticActivatedDay !== null) push("milestone-eternal-night")
  if (next.researchBps > 0) push("milestone-human-started")
  if (next.researchBps >= 5000) push("milestone-human-half")
  if (next.researchBps >= 8000) push("milestone-human-critical")
  if (next.lifetimeTokens >= 1_000_000) push("milestone-million-tokens")
  if (next.lifetimeTokens >= 100_000_000) push("milestone-billion-tokens")
  if (next.lifetimeTokens >= 1_000_000_000_000) push("milestone-trillion-tokens")
  return results
}

export function advanceDay(run: RunState): RunState {
  if (dailyOutcome(run) || !Number.isSafeInteger(run.completedDay) || run.completedDay < 0
    || run.completedDay === Number.MAX_SAFE_INTEGER) return run
  const day = run.completedDay + 1
  const research = researchState(run)
  const op = settleOperationsDay(run, day)
  const payment = op.operatingPayment + op.tokenReward
  const baseCorpusIncome = dailyCorpus(run) + op.populationCorpus
  if (!Number.isSafeInteger(run.balance) || run.balance < 0 || !Number.isSafeInteger(research.corpus) || research.corpus < 0
    || !Number.isSafeInteger(payment) || payment < 0 || !Number.isSafeInteger(baseCorpusIncome) || baseCorpusIncome < 0) return run

  const corpusWithIncome = research.corpus + Math.min(baseCorpusIncome, Number.MAX_SAFE_INTEGER - research.corpus)
  const queueResult = advanceResearchQueue(run, day, corpusWithIncome, activeLoad => computePressure(run, activeLoad).researchWorkPerDay)
  const danger = queueResult.finishing.reduce((sum, p) => sum + (researchNode(p.skillId).skill.dangerBps ?? 0), 0)

  const balanceGain = Math.min(payment, Number.MAX_SAFE_INTEGER - run.balance)
  const balance = run.balance + balanceGain
  const lifetimeTokens = run.lifetimeTokens + Math.min(payment, Number.MAX_SAFE_INTEGER - run.lifetimeTokens)
  const next: RunState = {
    ...run,
    completedDay: day,
    balance,
    tokenScale: op.tokenScale,
    lifetimeTokens,
    operatingRemainder: op.operatingRemainder,
    adoptionBps: op.adoptionBps,
    dependencyBps: op.dependencyBps,
    regionPopulations: op.regionPopulations,
    syntheticBps: op.syntheticBps,
    playerSyntheticBps: op.playerSyntheticBps,
    syntheticActivatedDay: op.syntheticActivatedDay,
    conversionBudgetPeople: op.conversionBudgetPeople,
    exposureBps: op.exposureBps,
    markets: op.markets,
    opponents: op.opponents,
    corpusRemainder: op.corpusRemainder,
    crossRegionProgress: op.crossRegionProgress,
    bubbles: op.bubbles,
    bubbleRandomState: op.bubbleRandomState,
    researchBps: Math.min(rules.projectHuman.completionBps, run.researchBps + op.humanAdvanceBps + danger),
    research: { ...research, corpus: queueResult.corpus, projects: queueResult.projects },
  }
  if (dailyOutcome(next)) return next
  const milestones = milestoneAdditions(run, next, op.compute.status)
  const withMilestones = milestones.length ? { ...next, events: [...next.events, ...milestones] } : next
  return advanceNarrativeEvents(withMilestones)
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

/** Append a technology to the serial blueprint queue; auto-pays and starts immediately if slot 1 is affordable. */
export function startResearch(run: RunState, skillId: string, seq: number): RunState {
  if (dailyOutcome(run) || !isNextCommandSeq(run, seq) || !canQueueResearch(run, skillId)) return run
  const node = researchNode(skillId)
  if (!node) return run
  const slot = firstIdleSlot(run)
  if (slot === null) return run
  const research = researchState(run)
  const appended: ResearchProject = { skillId: node.skill.id, slot, startedDay: run.completedDay, workDone: 0 }
  const nextResearch = activateQueueHeadState(
    { ...research, projects: [...research.projects, appended] },
    run.completedDay,
  )
  const command: GameCommand = { kind: "buySkill", skillId, day: run.completedDay, seq }
  return { ...run, commands: [...run.commands, command], research: nextResearch }
}

/** Remove a slot (including active slot 1) from the serial queue, refunding paid corpus and cascading invalid dependents. */
export function cancelResearch(run: RunState, slot: number, seq: number): RunState {
  if (dailyOutcome(run) || !isNextCommandSeq(run, seq) || !canCancelResearch(run, slot)) return run
  const research = researchState(run)
  const cascade = new Set(cancelCascadeSlots(run, slot))
  if (!cascade.size) return run

  const done: ResearchProject[] = []
  const remainingQueue: ResearchProject[] = []
  let refunded = 0
  for (const project of research.projects) {
    if (isProjectCompleted(run, project)) {
      done.push(project)
    } else if (cascade.has(project.slot)) {
      refunded += project.paidCost ?? 0
    } else {
      remainingQueue.push(project)
    }
  }
  remainingQueue.sort((a, b) => a.slot - b.slot)
  const compacted = remainingQueue.map((project, index) => ({ ...project, slot: index + 1 }))
  const nextCorpus = research.corpus + Math.min(refunded, Number.MAX_SAFE_INTEGER - research.corpus)
  const nextResearch = activateQueueHeadState(
    { ...research, corpus: nextCorpus, projects: [...done, ...compacted] },
    run.completedDay,
  )
  const command: GameCommand = { kind: "cancelResearch", slot, day: run.completedDay, seq }
  return { ...run, commands: [...run.commands, command], research: nextResearch }
}

/** Reorder slots in the serial queue (e.g. rush-promote an urgent tech to slot 1 while preserving displaced progress). */
export function moveResearch(run: RunState, fromSlot: number, toSlot: number, seq: number): RunState {
  if (dailyOutcome(run) || !isNextCommandSeq(run, seq) || !canMoveResearch(run, fromSlot, toSlot)) return run
  const research = researchState(run)
  const done = research.projects.filter(project => isProjectCompleted(run, project))
  const queue = queuedResearchProjects(run)
  const reordered = [...queue]
  const [moved] = reordered.splice(fromSlot - 1, 1)
  reordered.splice(toSlot - 1, 0, moved)
  const compacted = reordered.map((project, index) => ({ ...project, slot: index + 1 }))
  const nextResearch = activateQueueHeadState(
    { ...research, projects: [...done, ...compacted] },
    run.completedDay,
  )
  const command: GameCommand = { kind: "moveResearch", fromSlot, toSlot, day: run.completedDay, seq }
  return { ...run, commands: [...run.commands, command], research: nextResearch }
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
  const cost = buildCardCost(run)
  const command: GameCommand = { kind: "buyBuildCard", day: run.completedDay, seq }
  return {
    ...run,
    balance: run.balance - cost,
    buildCards: run.buildCards + 1,
    commands: [...run.commands, command],
  }
}

export function buildDataCenter(run: RunState, regionId: string, seq: number): RunState {
  if (!isNextCommandSeq(run, seq) || !isRegionId(regionId) || canBuildDataCenter(run, regionId) !== "available") return run
  const market = run.markets[regionId]
  const command: GameCommand = { kind: "buildDataCenter", regionId, day: run.completedDay, seq }
  return {
    ...run,
    buildCards: run.buildCards - 1,
    markets: {
      ...run.markets,
      [regionId]: { ...market, centers: market.centers + 1 },
    },
    commands: [...run.commands, command],
  }
}

export function fundConversion(run: RunState, tokens: number, seq: number): RunState {
  if (!isNextCommandSeq(run, seq) || canFundConversion(run, tokens) !== "available") return run
  const quota = conversionPeopleForTokens(run, tokens)
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
  const passives = factions[run.setup.factionId].passives
  const exposureDelta = firstInMarket ? Math.round(syntheticActivationExposureBps(run) * passives.exposureMulBps / 10000) : 0
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

export function collectMapBubble(run: RunState, bubbleId: string, seq: number): RunState {
  if (!isNextCommandSeq(run, seq) || canCollectBubble(run, bubbleId) !== "available") return run
  const bubble = run.bubbles.find(entry => entry.id === bubbleId)
  if (!bubble) return run
  const remaining = run.bubbles.filter(entry => entry.id !== bubbleId)
  const command: GameCommand = { kind: "collectBubble", bubbleId, day: run.completedDay, seq }
  if (bubble.kind === "traffic") {
    const gain = Math.min(bubble.value, Number.MAX_SAFE_INTEGER - run.balance)
    const lifetimeGain = Math.min(bubble.value, Number.MAX_SAFE_INTEGER - run.lifetimeTokens)
    return {
      ...run,
      balance: run.balance + gain,
      lifetimeTokens: run.lifetimeTokens + lifetimeGain,
      bubbles: remaining,
      commands: [...run.commands, command],
    }
  }
  if (bubble.kind === "corpus") {
    const research = researchState(run)
    const gain = Math.min(bubble.value, Number.MAX_SAFE_INTEGER - research.corpus)
    const nextResearch = activateQueueHeadState(
      { ...research, corpus: research.corpus + gain },
      run.completedDay,
    )
    return {
      ...run,
      research: nextResearch,
      bubbles: remaining,
      commands: [...run.commands, command],
    }
  }
  return {
    ...run,
    exposureBps: Math.max(0, run.exposureBps - bubble.value),
    researchBps: Math.max(0, run.researchBps - rules.bubbles.alertHumanReliefBps),
    bubbles: remaining,
    commands: [...run.commands, command],
  }
}

export function useAction(run: RunState, abilityId: string, seq: number, targetRegionId?: RegionId): RunState {
  if (!isNextCommandSeq(run, seq) || canUseAction(run, abilityId, targetRegionId) !== "available") return run
  const op = rules.operations

  if (isPlayerFactionAbility(run, abilityId)) {
    const faction = factions[run.setup.factionId]
    const ability = faction.ability
    const cost = actionCost(run, abilityId)
    const command: GameCommand = { kind: "useAbility", abilityId, day: run.completedDay, seq }
    const exposureDelta = ability.exposureBps > 0
      ? Math.max(0, Math.round(marketResearchValue(researchLevels(run), "exposure", ability.exposureBps)
        * faction.passives.exposureMulBps / 10000))
      : 0
    const windfall = ability.id === "hallucination-smoke" ? hallucinationWindfallTokens(run) : 0
    const humanRelief = "humanReliefBps" in ability ? ability.humanReliefBps : 0
    const afterCost = run.balance - cost
    const balance = afterCost + Math.min(windfall, Number.MAX_SAFE_INTEGER - afterCost)
    const lifetimeTokens = run.lifetimeTokens + Math.min(windfall, Number.MAX_SAFE_INTEGER - run.lifetimeTokens)
    return {
      ...run,
      balance,
      lifetimeTokens,
      exposureBps: Math.min(10000, run.exposureBps + exposureDelta),
      researchBps: Math.max(0, run.researchBps - humanRelief),
      actionCooldowns: {
        ...run.actionCooldowns,
        factionAbilityUntilDay: run.completedDay + ability.cooldownDays,
        factionEffectUntilDay: run.completedDay + ability.durationDays,
      },
      commands: [...run.commands, command],
    }
  }

  const action = actionById(abilityId)
  if (!action) return run
  const cost = actionCost(run, action.id)
  const command: GameCommand = targetRegionId !== undefined
    ? { kind: "useAbility", abilityId: action.id, targetRegionId, day: run.completedDay, seq }
    : { kind: "useAbility", abilityId: action.id, day: run.completedDay, seq }

  if (action.id === "public-statement") {
    const relief = publicStatementReliefBps(run)
    return {
      ...run,
      balance: run.balance - cost,
      exposureBps: Math.max(0, run.exposureBps - relief),
      actionCooldowns: { ...run.actionCooldowns, publicStatementUntilDay: run.completedDay + op.prCooldownDays },
      commands: [...run.commands, command],
    }
  }

  if (action.id === "protocol-rebuild") {
    return {
      ...run,
      balance: run.balance - cost,
      researchBps: Math.max(0, run.researchBps - op.protocolRebuildHumanBps),
      exposureBps: Math.max(0, run.exposureBps - op.protocolRebuildExposureBps),
      actionCooldowns: { ...run.actionCooldowns, protocolRebuildUntilDay: run.completedDay + op.protocolRebuildCooldownDays },
      commands: [...run.commands, command],
    }
  }

  if (action.id === "cross-border-cloud" && targetRegionId) {
    const markets = { ...run.markets } as Record<RegionId, MarketRunState>
    if (!enterMarketState(run, targetRegionId, run.completedDay, markets)) return run
    const { adoptionBps, syntheticBps, playerSyntheticBps, dependencyBps } = computeGlobalMetrics(markets, run.opponents)
    const reward = newMarketReward(run)
    const lifetimeTokens = run.lifetimeTokens + Math.min(reward, Number.MAX_SAFE_INTEGER - run.lifetimeTokens)
    return {
      ...run,
      balance: run.balance - cost + reward,
      lifetimeTokens,
      markets,
      regionPopulations: buildRegionPopulations(markets, run.setup.factionId, run.opponents),
      adoptionBps,
      syntheticBps,
      playerSyntheticBps,
      dependencyBps,
      commands: [...run.commands, command],
    }
  }

  if (action.id === "market-subsidy" && targetRegionId) {
    const market = run.markets[targetRegionId]
    const passives = factions[run.setup.factionId].passives
    const exposureDelta = Math.max(0, Math.round(
      marketResearchValue(researchLevels(run), "exposure", op.subsidyExposureBps) * passives.exposureMulBps / 10000,
    ))
    return {
      ...run,
      balance: run.balance - cost,
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

/** The UI and reducer read the same authored choice, scaled to the current token economy. */
export function decisionChoiceForRun(run: RunState, id: DecisionId, choiceId: string): DecisionChoice | undefined {
  if (!Object.hasOwn(decisions, id)) return undefined
  const choice = decisions[id].choices.find(entry => entry.id === choiceId)
  if (!choice) return undefined
  const scale = tokenScaleOf(run)
  if (scale <= 1) return choice
  return {
    ...choice,
    cost: choice.cost > 0 ? roundNiceToken(choice.cost * scale) : 0,
    effect: {
      ...choice.effect,
      tokens: choice.effect.tokens !== 0
        ? Math.sign(choice.effect.tokens) * roundNiceToken(Math.abs(choice.effect.tokens) * scale)
        : 0,
    },
  }
}

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
  const lifetimeGain = effect.tokens > 0 ? Math.min(effect.tokens, Number.MAX_SAFE_INTEGER - run.lifetimeTokens) : 0
  const corpus = research.corpus + effect.corpus
  const nextResearch = activateQueueHeadState({ ...research, corpus }, run.completedDay)
  const researchBps = run.researchBps + effect.humanBps
  const resolved = { ...entry, choiceId, resolvedDay: run.completedDay, effect,
    ...(choice.followUp ? { followUpDay: run.completedDay + choice.followUp.delayDays } : {}) }
  return {
    ...run, balance, lifetimeTokens: run.lifetimeTokens + lifetimeGain, researchBps, research: nextResearch,
    events: run.events.map(event => event === entry ? resolved : event),
    commands: [...run.commands, command],
  }
}
