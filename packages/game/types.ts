export interface RegionState {
  readonly regionId: string
  readonly adoptionBps: number
  /** Share of local AI users who depend on it. 10,000 basis points represent 100%. */
  readonly dependencyBps: number
  readonly lockdownBps: number
  readonly milestonesClaimed: readonly string[]
}

type Action =
  | { kind: "buySkill"; skillId: string }
  | { kind: "unlockResearchSlot"; slot: number }
  | { kind: "useAbility"; abilityId: string; targetRegionId?: string }
  | { kind: "chooseEvent"; eventInstanceId: string; choiceId: string }

/** A decision made after `week` completed weeks. Sequence numbers increase across the run. */
export type GameCommand = Readonly<{ week: number; seq: number } & Action>
export type TokenGrant = Readonly<{ week: number; seq: number; kind: "devGrantTokens"; amount: number }>
export type RunCommand = GameCommand | TokenGrant

/** Persist the rules, seed and inputs together. The engine derives balances and results. */
export interface ReplayV1 {
  /** Absent in exports from the original research catalog. */
  readonly researchExpandedAt?: { readonly week: number; readonly seq: number }
  readonly saveVersion: 1
  readonly rulesVersion: string
  readonly seed: number
  readonly factionId: string
  readonly startRegionId: string
  readonly difficultyId: string
  readonly completedWeek: number
  readonly commands: readonly GameCommand[]
}

export interface DeveloperReplay extends Omit<ReplayV1, "saveVersion" | "commands"> {
  readonly format: "debug-replay"
  readonly version: 1
  readonly commands: readonly RunCommand[]
}
