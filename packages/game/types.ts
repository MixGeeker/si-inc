export interface RegionState {
  regionId: string
  adoptionBps: number
  /** Share of local AI users who depend on it. 10,000 basis points represent 100%. */
  dependencyBps: number
  lockdownBps: number
  milestonesClaimed: string[]
}

type Action =
  | { kind: "buySkill"; skillId: string }
  | { kind: "useAbility"; abilityId: string; targetRegionId?: string }
  | { kind: "chooseEvent"; eventInstanceId: string; choiceId: string }

/** A decision made after `week` completed weeks. Sequence numbers increase across the run. */
export type GameCommand = { week: number; seq: number } & Action

/** Persist the rules, seed and inputs together. The engine derives balances and results. */
export interface ReplayV1 {
  saveVersion: 1
  rulesVersion: string
  seed: number
  factionId: string
  startRegionId: string
  difficultyId: string
  completedWeek: number
  commands: readonly GameCommand[]
}
