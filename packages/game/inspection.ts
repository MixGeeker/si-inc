import { standardScenario } from "../rules/v0.1/scenario.ts"
import { researchState } from "./research.ts"
import { advanceWeek, createRun, grantDeveloperTokens, resolveDecision, startResearch, unlockResearchSlot, type RunEvent, type RunState } from "./run.ts"
import type { DeveloperReplay, GameCommand, ReplayV1, RunCommand } from "./types.ts"

export function replayForRun(run: RunState): ReplayV1 | DeveloperReplay {
  const setup = { rulesVersion: standardScenario.rules.rulesVersion, researchExpandedAt: researchState(run).expandedAt,
    ...(run.eventVersion === 1 ? { eventVersion: run.eventVersion } : {}),
    seed: run.seed, ...run.setup, completedWeek: run.completedWeek }
  if (run.commands.every((c): c is GameCommand => c.kind !== "devGrantTokens")) {
    return { saveVersion: 1, ...setup, commands: run.commands }
  }
  return { format: "debug-replay", version: 1, ...setup, commands: run.commands }
}

export interface RunTraceEntry {
  week: number
  before: number | null
  after: number
  corpusBefore: number | null
  corpusAfter: number
  event?: RunEvent
  command?: RunCommand
}

function traceEntry(before: RunState | null, after: RunState): RunTraceEntry {
  return { week: after.completedWeek, before: before?.balance ?? null, after: after.balance,
    corpusBefore: before && researchState(before).corpus, corpusAfter: researchState(after).corpus }
}

/** Reconstruct each settlement with the rules that produced the run, including deferred decisions. */
export function runTimeline(run: RunState): RunTraceEntry[] | null {
  const initial = createRun(run.setup, run.seed, run.eventVersion ?? 0)
  if (!initial) return null
  let cursor: RunState = { ...initial, research: { ...researchState(initial), expandedAt: researchState(run).expandedAt } }
  const rows: RunTraceEntry[] = [traceEntry(null, cursor)]
  let index = 0
  for (let week = 0; week <= run.completedWeek; week++) {
    if (week > 0) {
      const before: RunState = cursor
      cursor = advanceWeek(cursor)
      const events = cursor.events.slice(before.events.length)
      rows.push({ ...traceEntry(before, cursor), event: events[0] })
      for (const event of events.slice(1)) rows.push({ ...traceEntry(cursor, cursor), event })
    }
    while (run.commands[index]?.week === week) {
      const command = run.commands[index++]
      const before: RunState = cursor
      let event: RunEvent | undefined
      if (command.kind === "devGrantTokens") cursor = grantDeveloperTokens(before, command.amount, command.seq)
      else if (command.kind === "unlockResearchSlot") cursor = unlockResearchSlot(before, command.slot, command.seq)
      else if (command.kind === "buySkill") cursor = startResearch(before, command.skillId, command.seq)
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
  if (index !== run.commands.length || cursor.completedWeek !== run.completedWeek || cursor.balance !== run.balance
    || (cursor.operatingRemainder ?? 0) !== (run.operatingRemainder ?? 0)
    || cursor.researchBps !== run.researchBps || expected.corpus !== actual.corpus
    || expected.unlockedSlots !== actual.unlockedSlots || expected.projects.length !== actual.projects.length) return null
  const matches = expected.projects.every((p, i) => p.skillId === actual.projects[i].skillId
    && p.startedWeek === actual.projects[i].startedWeek && p.slot === actual.projects[i].slot)
  const eventMatches = cursor.events.length === run.events.length && cursor.events.every((event, i) => {
    const expected = run.events[i]
    return event.instanceId === expected.instanceId && event.week === expected.week
      && event.content.kind === expected.content.kind && event.content.id === expected.content.id
      && event.choiceId === expected.choiceId && event.resolvedWeek === expected.resolvedWeek
      && event.sourceSkillId === expected.sourceSkillId && event.followUpWeek === expected.followUpWeek
      && event.sourceInstanceId === expected.sourceInstanceId && event.sourceChoiceId === expected.sourceChoiceId
      && event.effect?.tokens === expected.effect?.tokens && event.effect?.corpus === expected.effect?.corpus
      && event.effect?.humanBps === expected.effect?.humanBps
  })
  const scheduleMatches = cursor.schedule.nextWeek === run.schedule.nextWeek
    && cursor.schedule.randomState === run.schedule.randomState && cursor.schedule.remaining.length === run.schedule.remaining.length
    && cursor.schedule.remaining.every((content, i) => content.kind === run.schedule.remaining[i].kind
      && content.id === run.schedule.remaining[i].id)
  return matches && eventMatches && scheduleMatches ? rows.reverse() : null
}
