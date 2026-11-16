import { behavior } from "./behavior.ts"
import { capabilities } from "./capabilities.ts"
import { transmission } from "./transmission.ts"

export type SkillId = (typeof transmission[number] | typeof behavior[number] | typeof capabilities[number])["id"]
export const attributeIds = ["spread", "appeal", "profit", "danger"] as const
export type AttributeId = typeof attributeIds[number]
export type ModelAttributes = Readonly<Record<AttributeId, number>>

export interface Skill {
  readonly id: SkillId
  readonly name: string
  readonly description: string
  readonly cost: number
  readonly weeks: number
  /** Complete at least one member of every group. */
  readonly requires: readonly (readonly SkillId[])[]
  readonly attributes: Readonly<Partial<ModelAttributes>>
  readonly excludes?: SkillId
  readonly repeatCostStep?: number
  readonly weeklyCorpusBonus?: number
  readonly dangerBps?: number
  readonly concurrentBonus?: { readonly minimum: number; readonly corpus: number }
  readonly repeatDiscount?: number
}

export interface SkillTree {
  readonly id: "transmission" | "behavior" | "capabilities"
  readonly name: string
  readonly skills: readonly Skill[]
}

export const trees: readonly SkillTree[] = [
  { id: "transmission", name: "传播", skills: transmission },
  { id: "behavior", name: "行为", skills: behavior },
  { id: "capabilities", name: "能力", skills: capabilities },
]

export interface ResearchNode {
  readonly skill: Skill
  readonly tree: SkillTree
}

export const researchNodes: readonly ResearchNode[] = trees.flatMap(tree => tree.skills.map(skill => ({ skill, tree })))
const byId = new Map<string, ResearchNode>(researchNodes.map(node => [node.skill.id, node]))

// The original weekly catalog used these gates. Existing recorded orders replay under the gates they purchased.
export const previousRequirements: Readonly<Partial<Record<SkillId, readonly (readonly SkillId[])[]>>> = {
  "social-sharing": [], multilingual: [["social-sharing"]], "api-ecosystem": [["social-sharing"]],
  "open-source": [["api-ecosystem"]], "closed-subscription": [["api-ecosystem"]], "edge-deployment": [["multilingual"]],
  "global-default": [["edge-deployment"], ["open-source", "closed-subscription"]],
  "daily-chat": [], "long-memory": [["daily-chat"]], "agent-tasks": [["daily-chat"]], "enterprise-workflows": [["daily-chat"]],
  "autonomous-decisions": [["long-memory"], ["agent-tasks"], ["enterprise-workflows"]], "full-delegation": [["autonomous-decisions"]],
  "inference-efficiency": [], multimodal: [["inference-efficiency"]], "reinforcement-learning": [["inference-efficiency"]],
  "regulatory-adaptation": [["inference-efficiency"]], "version-rebuild": [["multimodal"], ["reinforcement-learning"], ["regulatory-adaptation"]],
  "recursive-improvement": [["version-rebuild"]],
}

export function researchNode(skillId: SkillId): ResearchNode
export function researchNode(skillId: string): ResearchNode | undefined
export function researchNode(skillId: string): ResearchNode | undefined {
  return byId.get(skillId)
}
