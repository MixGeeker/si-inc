import { decisions, type DecisionId } from "../../../../packages/rules/v0.1/events/decisions.ts"
import type { FactionId } from "../../../../packages/rules/v0.1/factions/roster.ts"
import type { RegionId } from "../../../../packages/rules/v0.1/world/regions.ts"
import type { Outcome } from "../../../../packages/rules/v0.1/endings/standard.ts"
import { isFactionId, isRegionId, standardScenario } from "../../../../packages/rules/v0.1/scenario.ts"

export type MapPanel = "menu" | "world" | "region" | "overview" | "news"
type Preview = { kind: "preview"; panel: MapPanel | null; speed: number }

export interface RunSetup {
  factionId: FactionId
  startRegionId: RegionId
  difficultyId: typeof standardScenario.difficulty.id
}

interface Campaign {
  kind: "campaign"
  setup: RunSetup
  panel: MapPanel | "confirm-exit" | null
  speed: number
  lastDecision?: { id: DecisionId; choiceId: string }
}

export interface Ending {
  kind: "ending"
  setup: RunSetup
  outcome: Outcome | "withdrawn"
}

export type Scene =
  | Preview
  | { kind: "setup"; back: Preview | Ending }
  | Campaign
  | { kind: "decision"; id: DecisionId; back: Campaign }
  | Ending

export type SceneEvent =
  | { type: "open-panel"; panel: MapPanel }
  | { type: "back" }
  | { type: "set-speed"; speed: number }
  | { type: "open-setup" }
  | { type: "start"; factionId: string; startRegionId: string; difficultyId: string }
  | { type: "open-decision"; id: DecisionId }
  | { type: "choose"; id: DecisionId; choiceId: string }
  | { type: "request-exit" }
  | { type: "withdraw" }
  | { type: "finish"; outcome: Outcome }
  | { type: "return-to-preview" }

export const previewSpeeds = [0, 1, 2, 3] as const
export const initialScene: Preview = { kind: "preview", panel: null, speed: 1 }

export function sceneReducer(scene: Scene, event: SceneEvent): Scene {
  switch (event.type) {
    case "open-panel":
      if ((scene.kind === "preview" || scene.kind === "campaign") && scene.panel === null) {
        return { ...scene, panel: event.panel }
      }
      break
    case "back":
      if (scene.kind === "setup" || scene.kind === "decision") return scene.back
      if (scene.kind === "campaign" && scene.panel === "confirm-exit") return { ...scene, panel: "menu" }
      if ((scene.kind === "preview" || scene.kind === "campaign") && scene.panel) return { ...scene, panel: null }
      break
    case "open-setup":
      if ((scene.kind === "preview" && scene.panel === "menu") || scene.kind === "ending") {
        return { kind: "setup", back: scene }
      }
      break
    case "start": {
      const { factionId, startRegionId, difficultyId } = event
      if (scene.kind === "setup" && isFactionId(factionId) && isRegionId(startRegionId)
        && difficultyId === standardScenario.difficulty.id) {
        return { kind: "campaign", setup: { factionId, startRegionId, difficultyId }, speed: 1, panel: null }
      }
      break
    }
    case "set-speed":
      if ((scene.kind === "preview" || scene.kind === "campaign") && scene.panel === null) {
        const speeds: readonly number[] = scene.kind === "preview" ? previewSpeeds : standardScenario.rules.speedMultipliers
        if (speeds.includes(event.speed)) return { ...scene, speed: event.speed }
      }
      break
    case "open-decision":
      if (scene.kind === "campaign" && scene.panel === "news" && Object.hasOwn(decisions, event.id)) {
        return { kind: "decision", id: event.id, back: scene }
      }
      break
    case "choose":
      if (scene.kind === "decision" && scene.id === event.id && decisions[scene.id].choices.some(c => c.id === event.choiceId)) {
        return { ...scene.back, lastDecision: { id: event.id, choiceId: event.choiceId } }
      }
      break
    case "request-exit":
      if (scene.kind === "campaign" && scene.panel === "menu") return { ...scene, panel: "confirm-exit" }
      break
    case "withdraw":
      if (scene.kind === "campaign" && scene.panel === "confirm-exit") {
        return { kind: "ending", setup: scene.setup, outcome: "withdrawn" }
      }
      break
    case "finish":
      if (scene.kind === "campaign" || scene.kind === "decision") {
        return { kind: "ending", setup: scene.kind === "campaign" ? scene.setup : scene.back.setup, outcome: event.outcome }
      }
      break
    case "return-to-preview":
      if (scene.kind === "ending") return initialScene
      break
  }
  return scene
}

/** The map and camera stay mounted behind every overlay. */
export function visibleRun(scene: Scene): RunSetup | null {
  switch (scene.kind) {
    case "preview": return null
    case "setup": return scene.back.kind === "ending" ? scene.back.setup : null
    case "decision": return scene.back.setup
    default: return scene.setup
  }
}

export function playbackSpeed(scene: Scene): number {
  if (scene.kind === "preview") return scene.speed
  if (scene.kind === "campaign" && scene.panel !== "menu" && scene.panel !== "overview" && scene.panel !== "confirm-exit") {
    return scene.speed
  }
  return 0
}
