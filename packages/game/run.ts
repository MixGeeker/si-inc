import { btoken } from "../rules/v0.1/economy/btoken.ts"
import { decisions, type DecisionId } from "../rules/v0.1/events/decisions.ts"
import { eventPool, type EventContent } from "../rules/v0.1/events/pool.ts"
import type { FactionId } from "../rules/v0.1/factions/roster.ts"
import { isFactionId, resolveStartRegionId, standardScenario } from "../rules/v0.1/scenario.ts"
import type { RegionId } from "../rules/v0.1/world/regions.ts"
import type { GameCommand } from "./types.ts"

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
  readonly adoptionBps: number | null
  readonly dependencyBps: number | null
  readonly researchBps: number
  readonly events: readonly RunEvent[]
  readonly commands: readonly GameCommand[]
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
    adoptionBps: null, dependencyBps: null, researchBps: 0,
    events: [], commands: [], schedule: scheduleAfter(0, seed, eventPool),
  }
}

export function advanceWeek(run: RunState): RunState {
  if (run.completedWeek >= rules.maxWeeks) return run
  const week = run.completedWeek + 1
  const income = btoken.income
  const payment = week % income.everyWeeks === 0
    ? Math.min(income.maximum, income.base + Math.floor((run.adoptionBps ?? 0) / income.adoptionStepBps))
    : 0
  const next = { ...run, completedWeek: week, balance: run.balance + payment }
  if (week === rules.maxWeeks || week !== run.schedule.nextWeek) return next

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

export function resolveDecision(run: RunState, instanceId: string, id: DecisionId, choiceId: string): RunState {
  if (run.completedWeek >= rules.maxWeeks) return run
  const entry = pendingDecision(run, instanceId, id)
  if (!entry) return run
  const choice = decisions[id].choices.find(option => option.id === choiceId)
  if (!choice || run.balance < choice.cost) return run
  const command: GameCommand = {
    kind: "chooseEvent", week: run.completedWeek, seq: (run.commands.at(-1)?.seq ?? 0) + 1,
    eventInstanceId: instanceId, choiceId,
  }
  return {
    ...run, balance: run.balance - choice.cost,
    events: run.events.map(event => event === entry ? { ...entry, choiceId } : event),
    commands: [...run.commands, command],
  }
}
