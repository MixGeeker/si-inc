import { standardScenario } from "../rules/v0.1/scenario.ts"
import { advanceWeek, createRun, grantDeveloperTokens, resolveDecision, type RunEvent, type RunState } from "./run.ts"
import type { DeveloperReplay, GameCommand, ReplayV1, RunCommand } from "./types.ts"

export function replayForRun(run: RunState): ReplayV1 | DeveloperReplay {
  const setup = { rulesVersion: standardScenario.rules.rulesVersion, seed: run.seed, ...run.setup, completedWeek: run.completedWeek }
  if (run.commands.every((c): c is GameCommand => c.kind !== "devGrantTokens")) {
    return { saveVersion: 1, ...setup, commands: run.commands }
  }
  return { format: "debug-replay", version: 1, ...setup, commands: run.commands }
}

export interface RunTraceEntry {
  week: number
  before: number | null
  after: number
  event?: RunEvent
  command?: RunCommand
}

/** Reconstruct each settlement with the rules that produced the run, including deferred decisions. */
export function runTimeline(run: RunState): RunTraceEntry[] | null {
  const initial = createRun(run.setup, run.seed)
  if (!initial) return null
  let cursor: RunState = initial
  const rows: RunTraceEntry[] = [{ week: 0, before: null, after: cursor.balance }]
  let index = 0
  for (let week = 0; week <= run.completedWeek; week++) {
    if (week > 0) {
      const before = cursor.balance
      cursor = advanceWeek(cursor)
      const last = cursor.events.at(-1)
      rows.push({ week, before, after: cursor.balance, event: last?.week === week ? last : undefined })
    }
    while (run.commands[index]?.week === week) {
      const command = run.commands[index++]
      const before: RunState = cursor
      let event: RunEvent | undefined
      if (command.kind === "devGrantTokens") cursor = grantDeveloperTokens(before, command.amount, command.seq)
      else if (command.kind === "chooseEvent") {
        event = before.events.find(entry => entry.instanceId === command.eventInstanceId)
        if (event?.content.kind !== "decision") return null
        cursor = resolveDecision(before, event.instanceId, event.content.id, command.choiceId)
      } else return null
      if (cursor === before || cursor.commands.at(-1)?.seq !== command.seq) return null
      rows.push({ week, before: before.balance, after: cursor.balance, command, event })
    }
  }
  return index === run.commands.length && cursor.balance === run.balance ? rows.reverse() : null
}
