import { researchNode, type Skill, type SkillId, type SkillTree } from "../../../../../packages/rules/v0.1/evolution/trees.ts"

// Odd columns sit half a row lower. Tiles, glass bridges and the background share this lattice.
export type Cell = readonly [column: number, row: number]
export const hive = { width: 880, height: 448, radius: 47.5, originX: 82, originY: 80 } as const
export const cellHeight = Math.sqrt(3) * hive.radius

export function cellCenter([column, row]: Cell) {
  return { x: hive.originX + column * hive.radius * 1.5, y: hive.originY + (row + (column % 2) * .5) * cellHeight }
}

export const cells: Readonly<Record<SkillId, Cell>> = {
  "social-sharing": [1, 1], multilingual: [2, 1], "language-communities": [2, 0],
  "remix-templates": [0, 2], "trending-takeover": [0, 1],
  "device-preinstall": [3, 2], "edge-deployment": [4, 2], "device-handoff": [3, 3], "offline-bundles": [5, 2],
  "global-default": [6, 1], "api-ecosystem": [9, 1], "open-source": [8, 1], "community-mirrors": [8, 0],
  "closed-subscription": [9, 2], "metered-billing": [10, 3], "plugin-market": [10, 1], "group-purchasing": [10, 2],

  "daily-chat": [1, 2], "tone-matching": [1, 1], "chat-import": [0, 1], "privacy-controls": [0, 3],
  "long-memory": [2, 2], "lasting-companionship": [2, 1], "memory-recap": [3, 0],
  "identity-registry": [3, 2], "continuous-persona": [4, 1], "weekly-reports": [8, 0],
  "agent-tasks": [7, 0], "enterprise-workflows": [9, 0], "team-seats": [10, 1],
  "human-approval": [7, 1], "live-handoff": [9, 1], "autonomous-decisions": [6, 1], "full-delegation": [6, 2],

  "inference-efficiency": [2, 1], multimodal: [3, 0], "reinforcement-learning": [2, 0],
  quantization: [1, 1], "offline-inference": [1, 0], "request-cache": [2, 2], "load-balancing": [3, 2],
  "regulatory-adaptation": [4, 1], "audit-logs": [5, 1], deidentification: [4, 2],
  "version-rebuild": [6, 0], "recursive-improvement": [7, 0], "evaluation-suite": [6, 1],
  "synthetic-interface": [8, 2], "distributed-review": [9, 1], "batch-conversion": [9, 2],
}

// A bridge follows a specific prerequisite across empty cells. It has no purchase or unlock state of its own.
type Bridge = { from: SkillId; to: SkillId; via: readonly Cell[] }
export const bridges: Readonly<Record<SkillTree["id"], readonly Bridge[]>> = {
  transmission: [
    { from: "language-communities", to: "trending-takeover", via: [[1, 0]] },
    { from: "social-sharing", to: "device-preinstall", via: [[2, 2]] },
    { from: "multilingual", to: "edge-deployment", via: [[3, 1]] },
    { from: "edge-deployment", to: "global-default", via: [[5, 1]] },
    { from: "open-source", to: "global-default", via: [[7, 0]] },
  ],
  behavior: [
    { from: "lasting-companionship", to: "continuous-persona", via: [[3, 1]] },
    { from: "identity-registry", to: "continuous-persona", via: [[4, 2]] },
    { from: "long-memory", to: "autonomous-decisions", via: [[2, 3], [3, 3], [4, 3], [5, 2], [5, 1]] },
    { from: "human-approval", to: "live-handoff", via: [[8, 1]] },
  ],
  capabilities: [
    { from: "inference-efficiency", to: "regulatory-adaptation", via: [[3, 1]] },
    { from: "multimodal", to: "version-rebuild", via: [[4, 0], [5, 0]] },
    { from: "audit-logs", to: "distributed-review", via: [[6, 2], [7, 1], [8, 1]] },
    { from: "load-balancing", to: "batch-conversion", via: [[4, 3], [5, 3], [6, 3], [7, 3], [8, 3]] },
  ],
}

// Each group requires one alternative, and every group must be satisfied.
export function researchTier(skill: Skill): number {
  return 1 + Math.max(0, ...skill.requires.map(group => Math.min(...group.map(id => researchTier(researchNode(id).skill)))))
}

export const tierNumerals = ["", "I", "II", "III", "IV", "V", "VI"] as const
