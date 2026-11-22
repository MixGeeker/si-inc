import { attributeIds, researchNode, type ModelAttributes, type ResearchNode, type SkillId } from "../rules/v0.1/evolution/trees.ts"
import { standardScenario } from "../rules/v0.1/scenario.ts"
import type { RunState } from "./run.ts"

export interface ResearchProject {
  readonly skillId: SkillId
  /** Queue position (1..7) while active/queued; retains completion slot (1) once completed. */
  readonly slot: number
  readonly startedDay: number
  /** Accumulated research work units where 100 units = 1 standard day at normal compute load. */
  readonly workDone?: number
  /** Actual day the project finished; omitted while still active or queued. */
  readonly completedDay?: number
  /** Corpus actually paid when this project started executing at slot 1; omitted while unpaid blueprint. */
  readonly paidCost?: number
}

export interface ResearchState {
  readonly corpus: number
  readonly unlockedSlots: number
  readonly projects: readonly ResearchProject[]
}

const rules = standardScenario.rules.research

export function initialResearch(): ResearchState {
  return { corpus: rules.initialCorpus, unlockedSlots: rules.initialSlots, projects: [] }
}

export function researchState(run: RunState): ResearchState {
  return run.research
}

export function projectWorkRequired(project: Pick<ResearchProject, "skillId">): number {
  return researchNode(project.skillId).skill.days * 100
}

export function projectWorkDone(run: RunState, project: ResearchProject): number {
  const required = projectWorkRequired(project)
  if (project.completedDay !== undefined) {
    return project.completedDay <= run.completedDay ? required : Math.min(required, project.workDone ?? 0)
  }
  return Math.max(0, Math.min(required, project.workDone ?? 0))
}

export function isProjectCompleted(run: RunState, project: ResearchProject): boolean {
  if (project.completedDay !== undefined) return project.completedDay <= run.completedDay
  if (project.workDone !== undefined) return project.workDone >= projectWorkRequired(project)
  return false
}

export function completionDay(project: ResearchProject): number {
  return project.completedDay ?? (project.startedDay + researchNode(project.skillId).skill.days)
}

export function queuedResearchProjects(run: RunState): ResearchProject[] {
  return researchState(run).projects
    .filter(p => !isProjectCompleted(run, p))
    .sort((a, b) => a.slot - b.slot)
}

/** Alias kept for UI/test ergonomics: returns all pending (active + queued) projects in queue order. */
export function activeResearchProjects(run: RunState): ResearchProject[] {
  return queuedResearchProjects(run)
}

export function headResearchProject(run: RunState): ResearchProject | undefined {
  return queuedResearchProjects(run).find(p => p.slot === 1)
}

export function isProjectRunning(run: RunState, project: ResearchProject): boolean {
  return !isProjectCompleted(run, project) && project.slot === 1 && project.paidCost !== undefined
}

export function isProjectWaitingCorpus(run: RunState, project: ResearchProject): boolean {
  return !isProjectCompleted(run, project) && project.slot === 1 && project.paidCost === undefined
}

export function projectRemainingDays(run: RunState, project: ResearchProject, workPerDay = 100): number {
  if (isProjectCompleted(run, project)) return 0
  const remainingWork = Math.max(1, projectWorkRequired(project) - projectWorkDone(run, project))
  return Math.max(1, Math.ceil(remainingWork / Math.max(1, workPerDay)))
}

/** Estimated cumulative days from now until the project at `slot` finishes in the serial queue. */
export function projectQueueEstimatedDays(run: RunState, slot: number, headWorkPerDay = 100): number {
  const queue = queuedResearchProjects(run)
  let totalDays = 0
  for (const project of queue) {
    const rate = project.slot === 1 ? headWorkPerDay : 100
    totalDays += projectRemainingDays(run, project, rate)
    if (project.slot === slot) return totalDays
  }
  return 0
}

/** Only the currently executing slot-1 project consumes training compute; queued blueprints cost 0 CU. */
export function activeResearchComputeLoad(run: RunState): number {
  const head = headResearchProject(run)
  if (!head || head.paidCost === undefined) return 0
  return researchNode(head.skillId).skill.computeLoad
}

export function completedLevel(run: RunState, id: SkillId): number {
  return researchState(run).projects.filter(p => p.skillId === id && isProjectCompleted(run, p)).length
}

export function queuedCount(run: RunState, id: SkillId): number {
  return queuedResearchProjects(run).filter(p => p.skillId === id).length
}

export function queuedSlotsForSkill(run: RunState, id: SkillId): number[] {
  return queuedResearchProjects(run).filter(p => p.skillId === id).map(p => p.slot)
}

function skillCostAtLevel(node: ResearchNode, completedSameSkill: number, hasEvaluationSuite: boolean): number {
  const { skill } = node
  if (skill.repeatCostStep === undefined) return skill.cost
  const discount = hasEvaluationSuite ? (researchNode("evaluation-suite").skill.repeatDiscount ?? 0) : 0
  return Math.max(1, skill.cost + skill.repeatCostStep * completedSameSkill - discount)
}

/** Exact corpus price if this technology started executing right now at slot 1. */
export function researchCost(run: RunState, node: ResearchNode): number {
  return skillCostAtLevel(node, completedLevel(run, node.skill.id), completedLevel(run, "evaluation-suite") > 0)
}

/** Projected corpus price for appending this technology at the tail of the current queue. */
export function nextQueuedResearchCost(run: RunState, node: ResearchNode): number {
  const queue = queuedResearchProjects(run)
  const earlierSame = queue.filter(p => p.skillId === node.skill.id).length
  const hasEval = completedLevel(run, "evaluation-suite") > 0 || queue.some(p => p.skillId === "evaluation-suite")
  return skillCostAtLevel(node, completedLevel(run, node.skill.id) + earlierSame, hasEval)
}

/** Projected corpus price for an existing queued project at `slot` once it reaches slot 1. */
export function queuedProjectExpectedCost(run: RunState, project: ResearchProject): number {
  if (project.paidCost !== undefined) return project.paidCost
  const queue = queuedResearchProjects(run)
  const earlier = queue.filter(p => p.slot < project.slot)
  const earlierSame = earlier.filter(p => p.skillId === project.skillId).length
  const hasEval = completedLevel(run, "evaluation-suite") > 0 || earlier.some(p => p.skillId === "evaluation-suite")
  return skillCostAtLevel(researchNode(project.skillId), completedLevel(run, project.skillId) + earlierSame, hasEval)
}

export type SkillLevels = Readonly<Partial<Record<SkillId, number>>>

export function researchLevels(run: RunState): SkillLevels {
  const levels: Partial<Record<SkillId, number>> = {}
  for (const project of researchState(run).projects) {
    if (isProjectCompleted(run, project)) levels[project.skillId] = (levels[project.skillId] ?? 0) + 1
  }
  return levels
}

export function attributesForLevels(levels: SkillLevels): ModelAttributes {
  const base = rules.attributeBaseline
  const result = { spread: base, appeal: base, profit: base, danger: base }
  for (const [skill, level] of Object.entries(levels)) {
    const delta = researchNode(skill as SkillId).skill.attributes
    for (const id of attributeIds) result[id] += (delta[id] ?? 0) * level
  }
  for (const id of attributeIds) result[id] = Math.max(0, result[id])
  return result
}

export function researchAttributes(run: RunState): ModelAttributes {
  return attributesForLevels(researchLevels(run))
}

export function dailyCorpus(run: RunState): number {
  return researchState(run).projects.reduce((income, project) => isProjectCompleted(run, project)
    ? income + (researchNode(project.skillId).skill.dailyCorpusBonus ?? 0) : income, rules.dailyCorpus)
}

export function projectsCompleting(run: RunState, day: number) {
  return researchState(run).projects.filter(project => project.completedDay === day)
}

/** Serial relay bonus from `version-rebuild`: +3 corpus when a project finishes with another queued right behind it. */
export function serialRelayBonusCorpus(run: RunState, completedCount: number, hasNextQueued: boolean): number {
  const bonus = researchNode("version-rebuild").skill.concurrentBonus
  return bonus && completedCount >= bonus.minimum && hasNextQueued && completedLevel(run, "version-rebuild") > 0
    ? bonus.corpus : 0
}

export function slotProject(run: RunState, slot: number): ResearchProject | undefined {
  return queuedResearchProjects(run).find(p => p.slot === slot)
}

export function firstIdleSlot(run: RunState): number | null {
  const { unlockedSlots } = researchState(run)
  const used = queuedResearchProjects(run).length
  return used < unlockedSlots ? used + 1 : null
}

/** Verify that every item in `queue` has its prerequisites satisfied by either `completed` or an earlier item in `queue`. */
export function isQueueOrderValid(completed: ReadonlySet<SkillId>, queue: readonly ResearchProject[]): boolean {
  const seen = new Set<SkillId>(completed)
  for (const project of queue) {
    const skill = researchNode(project.skillId).skill
    const met = skill.requires.every(group => group.some(req => seen.has(req)))
    if (!met) return false
    seen.add(project.skillId)
  }
  return true
}

function completedSkillSet(run: RunState): Set<SkillId> {
  const set = new Set<SkillId>()
  for (const p of researchState(run).projects) {
    if (isProjectCompleted(run, p)) set.add(p.skillId)
  }
  return set
}

function plannedSkillSet(run: RunState): Set<SkillId> {
  const set = new Set<SkillId>()
  for (const p of researchState(run).projects) set.add(p.skillId)
  return set
}

export type ResearchStatus = "available" | "upgradable" | "locked" | "active" | "queued" | "completed" | "excluded"

export function researchStatus(run: RunState, node: ResearchNode): ResearchStatus {
  const { projects } = researchState(run)
  const skill = node.skill
  const queue = queuedResearchProjects(run)
  const queuedMatches = queue.filter(p => p.skillId === skill.id)
  const completedCount = projects.filter(p => p.skillId === skill.id && isProjectCompleted(run, p)).length

  // Non-repeatable technologies cannot be queued twice.
  if (skill.repeatCostStep === undefined) {
    if (queuedMatches.length > 0) {
      return queuedMatches[0].slot === 1 ? "active" : "queued"
    }
    if (completedCount > 0) return "completed"
  }

  const taken = plannedSkillSet(run)
  function excluded(id: SkillId): boolean {
    if (taken.has(id)) return false
    const candidate = researchNode(id).skill
    return !!(candidate.excludes && taken.has(candidate.excludes))
      || candidate.requires.some(group => group.every(excluded))
  }
  if (excluded(skill.id)) return "excluded"

  const prereqMet = skill.requires.every(group => group.some(id => taken.has(id)))
  if (!prereqMet) return "locked"

  if (skill.repeatCostStep !== undefined) {
    if (completedCount > 0 || queuedMatches.length > 0) return "upgradable"
    return "available"
  }
  return "available"
}

/** True when a technology can be appended to the blueprint serial queue (repeatable techs can fill all slots). */
export function canQueueResearch(run: RunState, skillId: string): boolean {
  const node = researchNode(skillId)
  if (!node) return false
  if (firstIdleSlot(run) === null) return false
  const status = researchStatus(run, node)
  return status === "available" || status === "upgradable"
}

/** Return slots that would be removed when cancelling `slot` (including dependent downstream queue entries). */
export function cancelCascadeSlots(run: RunState, slot: number): number[] {
  const queue = queuedResearchProjects(run)
  if (!Number.isInteger(slot) || slot < 1 || slot > queue.length) return []
  const completed = completedSkillSet(run)
  const removedSlots: number[] = []
  const kept: ResearchProject[] = []
  for (const project of queue) {
    if (project.slot === slot) {
      removedSlots.push(project.slot)
      continue
    }
    const available = new Set<SkillId>(completed)
    for (const k of kept) available.add(k.skillId)
    const skill = researchNode(project.skillId).skill
    const valid = skill.requires.every(group => group.some(req => available.has(req)))
    if (valid) kept.push(project)
    else removedSlots.push(project.slot)
  }
  return removedSlots
}

export function canCancelResearch(run: RunState, slot: number): boolean {
  const queue = queuedResearchProjects(run)
  return Number.isInteger(slot) && slot >= 1 && slot <= queue.length
}

export function canMoveResearch(run: RunState, fromSlot: number, toSlot: number): boolean {
  const queue = queuedResearchProjects(run)
  if (!Number.isInteger(fromSlot) || !Number.isInteger(toSlot)) return false
  if (fromSlot < 1 || fromSlot > queue.length || toSlot < 1 || toSlot > queue.length || fromSlot === toSlot) return false
  const reordered = [...queue]
  const [moved] = reordered.splice(fromSlot - 1, 1)
  reordered.splice(toSlot - 1, 0, moved)
  return isQueueOrderValid(completedSkillSet(run), reordered)
}

/**
 * Ensure slot 1 starts executing automatically whenever corpus can pay for it.
 * Leaves already-paid (paused/reordered) slot-1 projects untouched with their preserved progress.
 */
export function activateQueueHeadState(
  research: ResearchState,
  completedDay: number,
): ResearchState {
  const done: ResearchProject[] = []
  const queue: ResearchProject[] = []
  for (const p of research.projects) {
    if (p.completedDay !== undefined && p.completedDay <= completedDay) done.push(p)
    else queue.push(p)
  }
  queue.sort((a, b) => a.slot - b.slot)
  if (!queue.length) return research
  const head = queue[0]
  if (head.paidCost !== undefined) return research

  const completedSame = done.filter(p => p.skillId === head.skillId).length
  const hasEval = done.some(p => p.skillId === "evaluation-suite")
  const cost = skillCostAtLevel(researchNode(head.skillId), completedSame, hasEval)
  if (research.corpus < cost) return research

  const activated: ResearchProject = { ...head, slot: 1, paidCost: cost, workDone: head.workDone ?? 0 }
  const nextQueue = [activated, ...queue.slice(1).map((p, idx) => ({ ...p, slot: idx + 2 }))]
  return {
    ...research,
    corpus: research.corpus - cost,
    projects: [...done, ...nextQueue],
  }
}

export function advanceResearchQueue(
  run: RunState,
  nextDay: number,
  corpusWithDailyIncome: number,
  resolveWorkPerDay: (activeLoad: number) => number,
): {
  readonly corpus: number
  readonly projects: readonly ResearchProject[]
  readonly finishing: readonly ResearchProject[]
  readonly relayBonus: number
} {
  const research = researchState(run)
  const done: ResearchProject[] = []
  const queue: ResearchProject[] = []
  for (const p of research.projects) {
    if (isProjectCompleted(run, p)) done.push(p)
    else queue.push(p)
  }
  queue.sort((a, b) => a.slot - b.slot)
  if (!queue.length) {
    return { corpus: corpusWithDailyIncome, projects: research.projects, finishing: [], relayBonus: 0 }
  }

  let corpus = corpusWithDailyIncome
  let head = queue[0]
  let tail = queue.slice(1)

  // Auto-start waiting slot 1 once daily corpus income arrives.
  if (head.paidCost === undefined) {
    const completedSame = done.filter(p => p.skillId === head.skillId).length
    const hasEval = done.some(p => p.skillId === "evaluation-suite")
    const cost = skillCostAtLevel(researchNode(head.skillId), completedSame, hasEval)
    if (corpus >= cost) {
      corpus -= cost
      head = { ...head, slot: 1, paidCost: cost, workDone: head.workDone ?? 0 }
    } else {
      return { corpus, projects: [...done, head, ...tail], finishing: [], relayBonus: 0 }
    }
  }

  // Only the active slot-1 project advances today.
  const activeLoad = researchNode(head.skillId).skill.computeLoad
  const rate = Math.max(1, Math.round(resolveWorkPerDay(activeLoad)))
  const required = projectWorkRequired(head)
  const prevWork = Math.max(0, head.workDone ?? 0)
  const nextWork = Math.min(required, prevWork + rate)

  if (nextWork < required) {
    const updatedHead: ResearchProject = { ...head, slot: 1, workDone: nextWork }
    return { corpus, projects: [...done, updatedHead, ...tail], finishing: [], relayBonus: 0 }
  }

  // Head project completed today!
  const finished: ResearchProject = { ...head, slot: 1, workDone: required, completedDay: nextDay }
  const nextDone = [...done, finished]
  const relayBonus = serialRelayBonusCorpus(run, 1, tail.length > 0)
  corpus = corpus + Math.min(relayBonus, Number.MAX_SAFE_INTEGER - corpus)

  // Compact remaining queue to slots 1..N and pre-activate next slot 1 if corpus permits (starts advancing tomorrow).
  let nextQueue = tail.map((p, idx) => ({ ...p, slot: idx + 1 }))
  if (nextQueue.length > 0 && nextQueue[0].paidCost === undefined) {
    const nextHead = nextQueue[0]
    const completedSame = nextDone.filter(p => p.skillId === nextHead.skillId).length
    const hasEval = nextDone.some(p => p.skillId === "evaluation-suite")
    const cost = skillCostAtLevel(researchNode(nextHead.skillId), completedSame, hasEval)
    if (corpus >= cost) {
      corpus -= cost
      nextQueue = [{ ...nextHead, slot: 1, paidCost: cost, workDone: nextHead.workDone ?? 0 }, ...nextQueue.slice(1)]
    }
  }

  return {
    corpus,
    projects: [...nextDone, ...nextQueue],
    finishing: [finished],
    relayBonus,
  }
}
