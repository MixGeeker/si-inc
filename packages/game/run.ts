import { btoken } from "../rules/v0.1/economy/btoken.ts"
import { decisions, legacyDecisionChoices, type DecisionChoice, type DecisionDefinition, type DecisionEffect, type DecisionId } from "../rules/v0.1/events/decisions.ts"
import { eventPool, legacyEventPool, type EventContent } from "../rules/v0.1/events/pool.ts"
import { news } from "../rules/v0.1/events/news.ts"
import { researchNode, type SkillId } from "../rules/v0.1/evolution/trees.ts"
import type { FactionId } from "../rules/v0.1/factions/roster.ts"
import { isFactionId, resolveStartRegionId, standardScenario } from "../rules/v0.1/scenario.ts"
import type { RegionId } from "../rules/v0.1/world/regions.ts"
import type { GameCommand, RunCommand, TokenGrant } from "./types.ts"
import type { CountryPopulations } from "./population.ts"
import { marketResearchValue } from "./market-research.ts"
import { completedLevel, completionWeek, firstIdleSlot, initialResearch, parallelCompletionCorpus, projectsCompleting, researchCost, researchLevels, researchState, researchStatus,
  weeklyCorpus, type ResearchState } from "./research.ts"

export interface RunSetup {
  readonly factionId: FactionId
  readonly startRegionId: RegionId
  readonly difficultyId: typeof standardScenario.difficulty.id
}

export interface RunEvent {
  readonly instanceId: string
  readonly week: number
  readonly content: EventContent
  readonly choiceId?: string
  readonly sourceSkillId?: SkillId
  readonly resolvedWeek?: number
  /** Actual changes after payment and HUMAN clamping. */
  readonly effect?: DecisionEffect
  readonly followUpWeek?: number
  readonly sourceInstanceId?: string
  readonly sourceChoiceId?: string
}

export interface RunState {
  readonly setup: RunSetup
  readonly seed: number
  /** Missing in runs using the original unconditional event pool and choice prices. */
  readonly eventVersion?: 1
  readonly completedWeek: number
  readonly balance: number
  /** Hundredths of an operating token carried into the next income settlement. */
  readonly operatingRemainder?: number
  readonly adoptionBps: number | null
  readonly dependencyBps: number | null
  readonly countryPopulations?: CountryPopulations
  readonly researchBps: number
  readonly research?: ResearchState
  readonly events: readonly RunEvent[]
  readonly commands: readonly RunCommand[]
  readonly schedule: {
    readonly nextWeek: number
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

function scheduleAfter(week: number, previousRandom: number, remaining: readonly EventContent[]) {
  const randomState = nextRandom(previousRandom)
  const { min, max } = rules.eventIntervalWeeks
  const interval = min + Math.floor(randomState / uint32Range * (max - min + 1))
  return { nextWeek: week + interval, randomState, remaining }
}

export function createRun(input: { [K in keyof RunSetup]: string }, seed: number, eventVersion: 0 | 1 = 1): RunState | null {
  const { factionId, difficultyId } = input
  const startRegionId = resolveStartRegionId(input.startRegionId)
  if (!Number.isInteger(seed) || seed < 0 || seed >= uint32Range || !isFactionId(factionId)
    || !startRegionId || difficultyId !== standardScenario.difficulty.id || (eventVersion !== 0 && eventVersion !== 1)) return null
  return {
    setup: { factionId, startRegionId, difficultyId }, seed, ...(eventVersion === 1 ? { eventVersion } : {}),
    completedWeek: 0, balance: rules.initialBtoken,
    adoptionBps: null, dependencyBps: null, countryPopulations: {}, researchBps: 0, research: initialResearch(),
    events: [], commands: [], schedule: scheduleAfter(0, seed, eventVersion === 1 ? eventPool : legacyEventPool),
  }
}

export function weeklyOutcome(run: RunState): "human-victory" | "timeout" | null {
  if (run.researchBps >= rules.projectHuman.completionBps) return "human-victory"
  return run.completedWeek >= rules.maxWeeks ? "timeout" : null
}

function eventInstance(run: RunState, content: EventContent): RunEvent {
  return { instanceId: `${run.seed}:${run.completedWeek}:${content.id}`, week: run.completedWeek, content }
}

function decisionEligible(run: RunState, id: DecisionId): boolean {
  const definition: DecisionDefinition = decisions[id]
  return run.completedWeek >= definition.minWeek && (!definition.requiresHuman || run.researchBps > 0)
    && (!definition.requiresSkill || completedLevel(run, definition.requiresSkill) > 0)
}

function followUpContent(id: string): EventContent | undefined {
  const item = news.find(entry => entry.id === id)
  return item ? { kind: "news", id: item.id } : undefined
}

/** The milestone has its own seed stream, so unrelated news cannot postpone it. */
function codingMilestone(run: RunState): RunEvent | undefined {
  const id = "unexpected-coding"
  const definition: DecisionDefinition = decisions[id]
  if (!definition.requiresSkill || !definition.delayWeeks || !decisionEligible(run, id)
    || run.events.some(entry => entry.content.id === id)) return undefined
  const completions = researchState(run).projects.filter(project => project.skillId === definition.requiresSkill)
    .map(completionWeek).filter(week => week <= run.completedWeek)
  if (!completions.length) return undefined
  const completed = Math.min(...completions)
  const draw = nextRandom((run.seed ^ completed ^ 0x9e3779b9) >>> 0)
  const { min, max } = definition.delayWeeks
  const due = completed + min + Math.floor(draw / uint32Range * (max - min + 1))
  return due === run.completedWeek
    ? { ...eventInstance(run, { kind: "decision", id }), sourceSkillId: definition.requiresSkill } : undefined
}

function advanceNarrativeEvents(run: RunState): RunState {
  const additions: RunEvent[] = []
  for (const parent of run.events) {
    if (parent.followUpWeek !== run.completedWeek || parent.content.kind !== "decision" || !parent.choiceId
      || run.events.some(entry => entry.sourceInstanceId === parent.instanceId)) continue
    const followUp = decisionChoiceForRun(run, parent.content.id, parent.choiceId)?.followUp
    const content = followUp && followUpContent(followUp.id)
    if (content) additions.push({ ...eventInstance(run, content),
      instanceId: `${run.seed}:${run.completedWeek}:${content.id}:${parent.instanceId}`,
      sourceInstanceId: parent.instanceId, sourceChoiceId: parent.choiceId })
  }

  let decision = codingMilestone(run)
  let schedule = run.schedule
  if (run.completedWeek === schedule.nextWeek) {
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
      schedule = scheduleAfter(run.completedWeek, draw,
        remaining.filter(report => report.kind !== content.kind || report.id !== content.id))
    } else schedule = scheduleAfter(run.completedWeek, schedule.randomState, remaining)
  }
  // Scene entry points open the final decision while all reports remain in the archive.
  if (decision) additions.push(decision)
  return { ...run, schedule, events: additions.length ? [...run.events, ...additions] : run.events }
}

export function advanceWeek(run: RunState): RunState {
  if (weeklyOutcome(run)) return run
  const week = run.completedWeek + 1
  const income = btoken.income
  const research = researchState(run)
  let payment = 0, operatingRemainder = run.operatingRemainder ?? 0
  if (week % income.everyWeeks === 0) {
    const users = Math.min(income.maximum - income.base, Math.floor((run.adoptionBps ?? 0) / income.adoptionStepBps))
    const earnings = users && run.completedWeek >= research.expandedAt!.week
      ? marketResearchValue(researchLevels(run), "revenue", users) : users
    const cents = Math.round(100 * earnings) + operatingRemainder
    payment = Math.min(income.maximum, income.base + Math.floor(cents / 100))
    operatingRemainder = cents % 100
  }
  const finishing = projectsCompleting(run, week)
  const danger = finishing.reduce((sum, p) => sum + (researchNode(p.skillId).skill.dangerBps ?? 0), 0)
  const balance = run.balance + payment
  const corpus = research.corpus + weeklyCorpus(run) + parallelCompletionCorpus(run, finishing.length)
  if (!Number.isSafeInteger(balance) || balance < 0 || !Number.isSafeInteger(corpus) || corpus < 0) return run
  const next = { ...run, completedWeek: week, balance, operatingRemainder,
    researchBps: Math.min(rules.projectHuman.completionBps, run.researchBps + danger),
    research: { ...research, corpus } }
  if (weeklyOutcome(next)) return next
  if (run.eventVersion === 1) return advanceNarrativeEvents(next)
  if (week !== run.schedule.nextWeek) return next

  const pool = run.schedule.remaining.length ? run.schedule.remaining : legacyEventPool
  const draw = nextRandom(run.schedule.randomState)
  const index = Math.floor(draw / uint32Range * pool.length)
  const content = pool[index]
  const entry: RunEvent = { instanceId: `${run.seed}:${week}:${content.id}`, week, content }
  return {
    ...next, events: [...run.events, entry],
    schedule: scheduleAfter(week, draw, pool.filter((_, i) => i !== index)),
  }
}

export function pendingDecision(run: RunState, instanceId: string, id: DecisionId) {
  return run.events.find(entry => entry.instanceId === instanceId && entry.content.kind === "decision"
    && entry.content.id === id && entry.choiceId === undefined)
}

export function nextCommandSeq(run: RunState) {
  return (run.commands.at(-1)?.seq ?? 0) + 1
}

export function canUnlockSlot(run: RunState, slot: number): boolean {
  const { unlockedSlots, corpus } = researchState(run)
  return !weeklyOutcome(run) && slot === unlockedSlots + 1 && slot <= rules.research.slotCosts.length
    && corpus >= rules.research.slotCosts[slot - 1]
}

export function unlockResearchSlot(run: RunState, slot: number, seq: number): RunState {
  if (seq !== nextCommandSeq(run) || !canUnlockSlot(run, slot)) return run
  const research = researchState(run)
  const command: GameCommand = { kind: "unlockResearchSlot", slot, week: run.completedWeek, seq }
  return { ...run, commands: [...run.commands, command],
    research: { ...research, unlockedSlots: slot, corpus: research.corpus - rules.research.slotCosts[slot - 1] } }
}

export function startResearch(run: RunState, skillId: string, seq: number): RunState {
  if (weeklyOutcome(run) || seq !== nextCommandSeq(run)) return run
  const node = researchNode(skillId)
  if (!node) return run
  const research = researchState(run)
  const status = researchStatus(run, node)
  const cost = researchCost(run, node)
  if ((status !== "available" && status !== "upgradable") || research.corpus < cost) return run
  const slot = firstIdleSlot(run)
  if (slot === null) return run
  const project = { skillId: node.skill.id, slot, startedWeek: run.completedWeek }
  const command: GameCommand = { kind: "buySkill", skillId, week: run.completedWeek, seq }
  return { ...run, commands: [...run.commands, command],
    research: { ...research, corpus: research.corpus - cost, projects: [...research.projects, project] } }
}

export function canGrantTokens(run: RunState, amount: number) {
  const { everyWeeks, maximum } = btoken.income
  const paymentsLeft = Math.floor(rules.maxWeeks / everyWeeks) - Math.floor(run.completedWeek / everyWeeks)
  return !weeklyOutcome(run) && Number.isSafeInteger(amount) && amount > 0
    && amount <= Number.MAX_SAFE_INTEGER - run.balance - paymentsLeft * maximum
}

export function grantDeveloperTokens(run: RunState, amount: number, seq: number): RunState {
  if (!canGrantTokens(run, amount) || seq !== nextCommandSeq(run)) return run
  const command: TokenGrant = { kind: "devGrantTokens", week: run.completedWeek, seq, amount }
  return { ...run, balance: run.balance + amount, commands: [...run.commands, command] }
}

/** Price and effects must come from the same event version in the UI and reducer. */
export function decisionChoiceForRun(run: RunState, id: DecisionId, choiceId: string): DecisionChoice | undefined {
  if (!Object.hasOwn(decisions, id)) return undefined
  if (run.eventVersion !== 1) {
    return id === "unexpected-coding" ? legacyDecisionChoices.find(choice => choice.id === choiceId) : undefined
  }
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
  if (weeklyOutcome(run) || !Number.isSafeInteger(nextCommandSeq(run))) return "unavailable"
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
  if (choice.followUp && (!followUpContent(choice.followUp.id) || !Number.isSafeInteger(choice.followUp.delayWeeks)
    || choice.followUp.delayWeeks < 1 || !Number.isSafeInteger(run.completedWeek + choice.followUp.delayWeeks))) return "unavailable"
  return "available"
}

export function resolveDecision(run: RunState, instanceId: string, id: DecisionId, choiceId: string): RunState {
  if (decisionChoiceStatus(run, id, choiceId) !== "available") return run
  const entry = pendingDecision(run, instanceId, id)
  if (!entry) return run
  const choice = decisionChoiceForRun(run, id, choiceId)!
  const command: GameCommand = {
    kind: "chooseEvent", week: run.completedWeek, seq: nextCommandSeq(run),
    eventInstanceId: instanceId, choiceId,
  }
  // Keep the original command semantics and snapshot shape for historical runs.
  if (run.eventVersion !== 1) return {
    ...run, balance: run.balance - choice.cost,
    events: run.events.map(event => event === entry ? { ...entry, choiceId } : event),
    commands: [...run.commands, command],
  }
  const research = researchState(run)
  const effect = decisionEffectForRun(run, id, choiceId)!
  const balance = run.balance + effect.tokens
  const corpus = research.corpus + effect.corpus
  const researchBps = run.researchBps + effect.humanBps
  const resolved = { ...entry, choiceId, resolvedWeek: run.completedWeek, effect,
    ...(choice.followUp ? { followUpWeek: run.completedWeek + choice.followUp.delayWeeks } : {}) }
  return {
    ...run, balance, researchBps, research: { ...research, corpus },
    events: run.events.map(event => event === entry ? resolved : event),
    commands: [...run.commands, command],
  }
}
