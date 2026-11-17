import { attributeIds, researchNode, type ModelAttributes, type ResearchNode, type SkillId } from "../rules/v0.1/evolution/trees.ts"
import { standardScenario } from "../rules/v0.1/scenario.ts"
import type { RunState } from "./run.ts"

export interface ResearchProject {
  readonly skillId: SkillId
  readonly slot: number
  readonly startedDay: number
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

export function completionDay(project: ResearchProject): number {
  return project.startedDay + researchNode(project.skillId).skill.days
}

export function completedLevel(run: RunState, id: SkillId): number {
  return researchState(run).projects.filter(p => p.skillId === id && completionDay(p) <= run.completedDay).length
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
    if (completionDay(project) <= run.completedDay) levels[project.skillId] = (levels[project.skillId] ?? 0) + 1
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
  return researchState(run).projects.reduce((income, project) => completionDay(project) <= run.completedDay
    ? income + (researchNode(project.skillId).skill.dailyCorpusBonus ?? 0) : income, rules.dailyCorpus)
}

export function projectsCompleting(run: RunState, day: number) {
  return researchState(run).projects.filter(project => completionDay(project) === day)
}

export function parallelCompletionCorpus(run: RunState, count: number) {
  const bonus = researchNode("version-rebuild").skill.concurrentBonus
  return bonus && count >= bonus.minimum && completedLevel(run, "version-rebuild") > 0
    ? bonus.corpus : 0
}

export function slotProject(run: RunState, slot: number) {
  return researchState(run).projects.find(p => p.slot === slot && completionDay(p) > run.completedDay)
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
    if (completionDay(latest) > run.completedDay) return "active"
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
