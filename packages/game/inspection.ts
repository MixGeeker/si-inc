import { standardScenario } from "../rules/v0.1/scenario.ts"
import type { RegionId } from "../rules/v0.1/world/regions.ts"
import { researchState } from "./research.ts"
import {
  advanceDay,
  buildDataCenter,
  buyBuildCard,
  cancelResearch,
  collectMapBubble,
  createRun,
  fundConversion,
  grantDeveloperTokens,
  moveResearch,
  resolveDecision,
  startResearch,
  toggleSyntheticProgram,
  unlockResearchSlot,
  useAction,
  type RunEvent,
  type RunState,
} from "./run.ts"
import type { DeveloperReplay, GameCommand, ReplayV2, RunCommand } from "./types.ts"

export function replayForRun(run: RunState): ReplayV2 | DeveloperReplay {
  const setup = { runId: run.runId, rulesVersion: run.rulesVersion,
    seed: run.seed, ...run.setup, completedDay: run.completedDay }
  if (run.commands.every((c): c is GameCommand => c.kind !== "devGrantTokens")) {
    return { saveVersion: 2, ...setup, commands: run.commands }
  }
  return { format: "debug-replay", version: 2, ...setup, commands: run.commands }
}

export interface RunTraceEntry {
  day: number
  before: number | null
  after: number
  corpusBefore: number | null
  corpusAfter: number
  event?: RunEvent
  command?: RunCommand
}

function traceEntry(before: RunState | null, after: RunState): RunTraceEntry {
  return { day: after.completedDay, before: before?.balance ?? null, after: after.balance,
    corpusBefore: before && researchState(before).corpus, corpusAfter: researchState(after).corpus }
}

function sameSnapshotData(expected: unknown, actual: unknown): boolean {
  if (Object.is(expected, actual)) return true
  if (expected === null || actual === null || typeof expected !== "object" || typeof actual !== "object") return false
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || expected.length !== actual.length) return false
  } else if (Array.isArray(actual)) return false
  const expectedRecord = expected as Record<string, unknown>
  const actualRecord = actual as Record<string, unknown>
  const keys = Object.keys(expectedRecord)
  return keys.length === Object.keys(actualRecord).length && keys.every(key =>
    Object.hasOwn(actualRecord, key) && sameSnapshotData(expectedRecord[key], actualRecord[key]))
}

/** Reconstruct each settlement with the rules that produced the run, including deferred decisions and serial research queue ops. */
export function runTimeline(run: RunState): RunTraceEntry[] | null {
  if (run.rulesVersion !== standardScenario.rules.rulesVersion || !Number.isSafeInteger(run.completedDay) || run.completedDay < 0) return null
  const initial = createRun(run.setup, run.seed, run.runId)
  if (!initial) return null
  let cursor: RunState = initial
  const rows: RunTraceEntry[] = [traceEntry(null, cursor)]
  let index = 0
  for (let day = 0; day <= run.completedDay; day++) {
    if (day > 0) {
      const before: RunState = cursor
      cursor = advanceDay(cursor)
      if (cursor === before) return null
      const events = cursor.events.slice(before.events.length)
      rows.push({ ...traceEntry(before, cursor), event: events[0] })
      for (const event of events.slice(1)) rows.push({ ...traceEntry(cursor, cursor), event })
    }
    while (run.commands[index]?.day === day) {
      const command = run.commands[index++]
      const before: RunState = cursor
      let event: RunEvent | undefined
      if (command.kind === "devGrantTokens") cursor = grantDeveloperTokens(before, command.amount, command.seq)
      else if (command.kind === "unlockResearchSlot") cursor = unlockResearchSlot(before, command.slot, command.seq)
      else if (command.kind === "buySkill") cursor = startResearch(before, command.skillId, command.seq)
      else if (command.kind === "cancelResearch") cursor = cancelResearch(before, command.slot, command.seq)
      else if (command.kind === "moveResearch") cursor = moveResearch(before, command.fromSlot, command.toSlot, command.seq)
      else if (command.kind === "buyBuildCard") cursor = buyBuildCard(before, command.seq)
      else if (command.kind === "buildDataCenter") cursor = buildDataCenter(before, command.regionId, command.seq)
      else if (command.kind === "fundConversion") cursor = fundConversion(before, command.tokens, command.seq)
      else if (command.kind === "toggleSynthetic") cursor = toggleSyntheticProgram(before, command.regionId as RegionId, command.enabled, command.seq)
      else if (command.kind === "useAbility") cursor = useAction(before, command.abilityId, command.seq, command.targetRegionId as RegionId | undefined)
      else if (command.kind === "collectBubble") cursor = collectMapBubble(before, command.bubbleId, command.seq)
      else if (command.kind === "chooseEvent") {
        event = before.events.find(entry => entry.instanceId === command.eventInstanceId)
        if (event?.content.kind !== "decision") return null
        cursor = resolveDecision(before, event.instanceId, event.content.id, command.choiceId)
        event = cursor.events.find(entry => entry.instanceId === command.eventInstanceId)
      } else return null
      if (cursor === before || cursor.commands.at(-1)?.seq !== command.seq) return null
      rows.push({ ...traceEntry(before, cursor), command, event })
    }
  }
  const expected = researchState(run), actual = researchState(cursor)
  if (index !== run.commands.length || cursor.completedDay !== run.completedDay || cursor.balance !== run.balance
    || cursor.tokenScale !== run.tokenScale || cursor.lifetimeTokens !== run.lifetimeTokens
    || (cursor.operatingRemainder ?? 0) !== (run.operatingRemainder ?? 0)
    || cursor.exposureBps !== run.exposureBps || cursor.buildCards !== run.buildCards
    || cursor.adoptionBps !== run.adoptionBps || cursor.dependencyBps !== run.dependencyBps
    || cursor.syntheticBps !== run.syntheticBps || cursor.playerSyntheticBps !== run.playerSyntheticBps
    || cursor.conversionBudgetPeople !== run.conversionBudgetPeople
    || cursor.syntheticActivatedDay !== run.syntheticActivatedDay
    || cursor.corpusRemainder !== run.corpusRemainder || cursor.crossRegionProgress !== run.crossRegionProgress
    || cursor.bubbleRandomState !== run.bubbleRandomState
    || cursor.actionCooldowns.publicStatementUntilDay !== run.actionCooldowns.publicStatementUntilDay
    || cursor.actionCooldowns.protocolRebuildUntilDay !== run.actionCooldowns.protocolRebuildUntilDay
    || cursor.actionCooldowns.factionAbilityUntilDay !== run.actionCooldowns.factionAbilityUntilDay
    || cursor.actionCooldowns.factionEffectUntilDay !== run.actionCooldowns.factionEffectUntilDay
    || !sameSnapshotData(cursor.bubbles, run.bubbles)
    || !sameSnapshotData(cursor.opponents, run.opponents)
    || !sameSnapshotData(cursor.regionPopulations, run.regionPopulations)
    || cursor.researchBps !== run.researchBps || expected.corpus !== actual.corpus
    || expected.unlockedSlots !== actual.unlockedSlots || expected.projects.length !== actual.projects.length) return null
  const matches = sameSnapshotData(cursor.markets, run.markets) && expected.projects.every((p, i) => p.skillId === actual.projects[i].skillId
    && p.startedDay === actual.projects[i].startedDay && p.slot === actual.projects[i].slot
    && p.workDone === actual.projects[i].workDone && p.completedDay === actual.projects[i].completedDay
    && p.paidCost === actual.projects[i].paidCost)
  const eventMatches = cursor.events.length === run.events.length && cursor.events.every((event, i) => {
    const expectedEvent = run.events[i]
    return event.instanceId === expectedEvent.instanceId && event.day === expectedEvent.day
      && event.content.kind === expectedEvent.content.kind && event.content.id === expectedEvent.content.id
      && event.choiceId === expectedEvent.choiceId && event.resolvedDay === expectedEvent.resolvedDay
      && event.sourceSkillId === expectedEvent.sourceSkillId && event.followUpDay === expectedEvent.followUpDay
      && event.sourceInstanceId === expectedEvent.sourceInstanceId && event.sourceChoiceId === expectedEvent.sourceChoiceId
      && event.effect?.tokens === expectedEvent.effect?.tokens && event.effect?.corpus === expectedEvent.effect?.corpus
      && event.effect?.humanBps === expectedEvent.effect?.humanBps
  })
  const scheduleMatches = cursor.schedule.nextDay === run.schedule.nextDay
    && cursor.schedule.randomState === run.schedule.randomState && cursor.schedule.remaining.length === run.schedule.remaining.length
    && cursor.schedule.remaining.every((content, i) => content.kind === run.schedule.remaining[i].kind
      && content.id === run.schedule.remaining[i].id)
  return matches && eventMatches && scheduleMatches ? rows.reverse() : null
}
