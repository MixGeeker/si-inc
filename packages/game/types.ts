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
  | { kind: "cancelResearch"; slot: number }
  | { kind: "moveResearch"; fromSlot: number; toSlot: number }
  | { kind: "unlockResearchSlot"; slot: number }
  | { kind: "buyBuildCard" }
  | { kind: "buildDataCenter"; regionId: string }
  | { kind: "fundConversion"; tokens: number }
  | { kind: "toggleSynthetic"; regionId: string; enabled: boolean }
  | { kind: "useAbility"; abilityId: string; targetRegionId?: string }
  | { kind: "collectBubble"; bubbleId: string }
  | { kind: "chooseEvent"; eventInstanceId: string; choiceId: string }

/** A decision made after `day` completed days. Sequence numbers increase across the run. */
export type GameCommand = Readonly<{ day: number; seq: number } & Action>
export type TokenGrant = Readonly<{ day: number; seq: number; kind: "devGrantTokens"; amount: number }>
export type RunCommand = GameCommand | TokenGrant

/** Persist the rules, seed and inputs together. The engine derives balances and results. */
export interface ReplayV2 {
  readonly saveVersion: 2
  readonly runId: string
  readonly rulesVersion: string
  readonly seed: number
  readonly factionId: string
  readonly startRegionId: string
  readonly difficultyId: string
  readonly completedDay: number
  readonly commands: readonly GameCommand[]
}

export interface DeveloperReplay extends Omit<ReplayV2, "saveVersion" | "commands"> {
  readonly format: "debug-replay"
  readonly version: 2
  readonly commands: readonly RunCommand[]
}
