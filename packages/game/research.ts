import { attributeIds, researchNode, type ModelAttributes, type ResearchNode, type SkillId } from "../rules/v0.1/evolution/trees.ts"
import { standardScenario } from "../rules/v0.1/scenario.ts"
import type { RunState } from "./run.ts"

export interface ResearchProject {
  readonly skillId: SkillId
  readonly slot: number
  readonly startedDay: number
  /** Accumulated research work units where 100 units = 1 standard day at normal compute load. */
  readonly workDone?: number
  /** Actual day the project finished; omitted while still active (or in legacy fixtures). */
  readonly completedDay?: number
}

export interface ResearchState {
  readonly corpus: number
  readonly unlockedSlots: number
  readonly projects: readonly ResearchProject[]
}

const rules = standardScenario.rules.research

export function initialResearch(): ResearchState {
  return { corpus: rules.initialCorpus, unlockedSlots: 0, projects: [] }
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
  if (project.workDone !== undefined) return Math.max(0, Math.min(required, project.workDone))
  return Math.max(0, Math.min(required, (run.completedDay - project.startedDay) * 100))
}

export function isProjectCompleted(run: RunState, project: ResearchProject): boolean {
  if (project.completedDay !== undefined) return project.completedDay <= run.completedDay
  if (project.workDone !== undefined) return project.workDone >= projectWorkRequired(project)
  return project.startedDay + researchNode(project.skillId).skill.days <= run.completedDay
}

export function completionDay(project: ResearchProject): number {
  return project.completedDay ?? (project.startedDay + researchNode(project.skillId).skill.days)
}

export function projectRemainingDays(run: RunState, project: ResearchProject, workPerDay = 100): number {
  if (isProjectCompleted(run, project)) return 0
  const remainingWork = Math.max(1, projectWorkRequired(project) - projectWorkDone(run, project))
  return Math.max(1, Math.ceil(remainingWork / Math.max(1, workPerDay)))
}

export function activeResearchProjects(run: RunState): ResearchProject[] {
  return researchState(run).projects.filter(p => !isProjectCompleted(run, p))
}

export function activeResearchComputeLoad(run: RunState): number {
  let total = 0
  for (const project of researchState(run).projects) {
    if (!isProjectCompleted(run, project)) total += researchNode(project.skillId).skill.computeLoad
  }
  return total
}

export function advanceResearchProjects(
  run: RunState,
  nextDay: number,
  workPerDay: number,
): { readonly projects: readonly ResearchProject[]; readonly finishing: readonly ResearchProject[] } {
  const current = researchState(run).projects
  if (!current.length) return { projects: current, finishing: [] }
  const projects: ResearchProject[] = []
  const finishing: ResearchProject[] = []
  const rate = Math.max(1, Math.round(workPerDay))
  for (const project of current) {
    if (isProjectCompleted(run, project)) {
      projects.push(project)
      continue
    }
    const required = projectWorkRequired(project)
    const prevWork = projectWorkDone(run, project)
    const nextWork = Math.min(required, prevWork + rate)
    if (nextWork >= required) {
      const done: ResearchProject = { ...project, workDone: required, completedDay: nextDay }
      projects.push(done)
      finishing.push(done)
    } else {
      projects.push({ ...project, workDone: nextWork })
    }
  }
  return { projects, finishing }
}

export function completedLevel(run: RunState, id: SkillId): number {
  return researchState(run).projects.filter(p => p.skillId === id && isProjectCompleted(run, p)).length
}

export function researchCost(run: RunState, node: ResearchNode): number {
  const { skill } = node
  if (skill.repeatCostStep === undefined) return skill.cost
  const discount = completedLevel(run, "evaluation-suite") * (researchNode("evaluation-suite").skill.repeatDiscount ?? 0)
  return Math.max(1, skill.cost + skill.repeatCostStep * completedLevel(run, skill.id) - discount)
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
  return researchState(run).projects.filter(project =>
    project.completedDay !== undefined
      ? project.completedDay === day
      : project.workDone === undefined && project.startedDay + researchNode(project.skillId).skill.days === day)
}

export function parallelCompletionCorpus(run: RunState, count: number) {
  const bonus = researchNode("version-rebuild").skill.concurrentBonus
  return bonus && count >= bonus.minimum && completedLevel(run, "version-rebuild") > 0
    ? bonus.corpus : 0
}

export function slotProject(run: RunState, slot: number) {
  return researchState(run).projects.find(p => p.slot === slot && !isProjectCompleted(run, p))
}

export function firstIdleSlot(run: RunState): number | null {
  const { unlockedSlots } = researchState(run)
  for (let slot = 1; slot <= unlockedSlots; slot++) {
    if (!slotProject(run, slot)) return slot
  }
  return null
}

export type ResearchStatus = "available" | "upgradable" | "locked" | "active" | "completed" | "excluded"

export function researchStatus(run: RunState, node: ResearchNode): ResearchStatus {
  const { projects } = researchState(run)
  const skill = node.skill
  const latest = projects.filter(p => p.skillId === skill.id).at(-1)
  if (latest) {
    if (!isProjectCompleted(run, latest)) return "active"
    return skill.repeatCostStep !== undefined ? "upgradable" : "completed"
  }
  const taken = new Set(projects.map(p => p.skillId))
  function excluded(id: SkillId): boolean {
    if (taken.has(id)) return false
    const candidate = researchNode(id).skill
    return !!(candidate.excludes && taken.has(candidate.excludes)) || candidate.requires.some(group => group.every(excluded))
  }
  if (excluded(skill.id)) return "excluded"
  return skill.requires.every(group => group.some(id => completedLevel(run, id) > 0)) ? "available" : "locked"
}
