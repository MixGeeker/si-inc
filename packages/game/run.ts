import { btoken } from "../rules/v0.1/economy/btoken.ts"
import { decisions, type DecisionId } from "../rules/v0.1/events/decisions.ts"
import { eventPool, type EventContent } from "../rules/v0.1/events/pool.ts"
import { researchNode } from "../rules/v0.1/evolution/trees.ts"
import type { FactionId } from "../rules/v0.1/factions/roster.ts"
import { isFactionId, resolveStartRegionId, standardScenario } from "../rules/v0.1/scenario.ts"
import type { RegionId } from "../rules/v0.1/world/regions.ts"
import type { GameCommand, RunCommand, TokenGrant } from "./types.ts"
import type { CountryPopulations } from "./population.ts"
import { marketResearchValue } from "./market-research.ts"
import { firstIdleSlot, initialResearch, parallelCompletionCorpus, projectsCompleting, researchCost, researchLevels, researchState, researchStatus,
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
}

export interface RunState {
  readonly setup: RunSetup
  readonly seed: number
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

export function createRun(input: { [K in keyof RunSetup]: string }, seed: number): RunState | null {
  const { factionId, difficultyId } = input
  const startRegionId = resolveStartRegionId(input.startRegionId)
  if (!Number.isInteger(seed) || seed < 0 || seed >= uint32Range || !isFactionId(factionId)
    || !startRegionId || difficultyId !== standardScenario.difficulty.id) return null
  return {
    setup: { factionId, startRegionId, difficultyId }, seed, completedWeek: 0, balance: rules.initialBtoken,
    adoptionBps: null, dependencyBps: null, countryPopulations: {}, researchBps: 0, research: initialResearch(),
    events: [], commands: [], schedule: scheduleAfter(0, seed, eventPool),
  }
}

export function weeklyOutcome(run: RunState): "human-victory" | "timeout" | null {
  if (run.researchBps >= rules.projectHuman.completionBps) return "human-victory"
  return run.completedWeek >= rules.maxWeeks ? "timeout" : null
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
  const next = { ...run, completedWeek: week, balance: run.balance + payment, operatingRemainder,
    researchBps: Math.min(rules.projectHuman.completionBps, run.researchBps + danger),
    research: { ...research, corpus: research.corpus + weeklyCorpus(run) + parallelCompletionCorpus(run, finishing.length) } }
  if (weeklyOutcome(next) || week !== run.schedule.nextWeek) return next

  const pool = run.schedule.remaining.length ? run.schedule.remaining : eventPool
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

export function resolveDecision(run: RunState, instanceId: string, id: DecisionId, choiceId: string): RunState {
  if (weeklyOutcome(run)) return run
  const entry = pendingDecision(run, instanceId, id)
  if (!entry) return run
  const choice = decisions[id].choices.find(option => option.id === choiceId)
  if (!choice || run.balance < choice.cost) return run
  const command: GameCommand = {
    kind: "chooseEvent", week: run.completedWeek, seq: nextCommandSeq(run),
    eventInstanceId: instanceId, choiceId,
  }
  return {
    ...run, balance: run.balance - choice.cost,
    events: run.events.map(event => event === entry ? { ...entry, choiceId } : event),
    commands: [...run.commands, command],
  }
}
