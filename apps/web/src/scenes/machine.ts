import { advanceWeek, createRun, pendingDecision, resolveDecision, type RunState, type RunSetup } from "../../../../packages/game/run.ts"
import { decisions, type DecisionId } from "../../../../packages/rules/v0.1/events/decisions.ts"
import { endings, type Outcome } from "../../../../packages/rules/v0.1/endings/standard.ts"
import { standardScenario } from "../../../../packages/rules/v0.1/scenario.ts"

export type { RunSetup }
const mapPanels = ["menu", "world", "region", "overview", "news"] as const
export type MapPanel = typeof mapPanels[number]
type Preview = { kind: "preview"; panel: MapPanel | null; speed: number }

interface Campaign {
  kind: "campaign"
  run: RunState
  panel: MapPanel | "confirm-exit" | null
  speed: number
  lastDecision?: { id: DecisionId; choiceId: string }
}

export interface Ending {
  kind: "ending"
  run: RunState
  outcome: Outcome | "withdrawn"
}

export type Scene =
  | Preview
  | { kind: "setup"; back: Preview | Ending }
  | Campaign
  | { kind: "decision"; id: DecisionId; instanceId?: string; back: Campaign }
  | Ending

export type SceneEvent =
  | { type: "open-panel"; panel: MapPanel }
  | { type: "back" }
  | { type: "set-speed"; speed: number }
  | { type: "open-setup" }
  | { type: "start"; factionId: string; startRegionId: string; difficultyId: string; seed?: number }
  | { type: "advance-week"; seed: number; completedWeek: number }
  | { type: "open-decision"; id: DecisionId; instanceId?: string }
  | { type: "choose"; id: DecisionId; instanceId?: string; choiceId: string }
  | { type: "request-exit" }
  | { type: "withdraw" }
  | { type: "finish"; outcome: Outcome }
  | { type: "return-to-preview" }

export const previewSpeeds = [0, 1, 2, 3] as const
export const initialScene: Preview = { kind: "preview", panel: null, speed: 1 }

export function sceneReducer(scene: Scene, event: SceneEvent): Scene {
  switch (event.type) {
    case "open-panel":
      if ((scene.kind === "preview" || scene.kind === "campaign") && scene.panel === null && mapPanels.includes(event.panel)) {
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
      if (scene.kind !== "setup") return scene
      const run = createRun(event, event.seed === undefined ? 0 : event.seed)
      return run ? { kind: "campaign", run, speed: 1, panel: null } : scene
    }
    case "set-speed":
      if ((scene.kind === "preview" || scene.kind === "campaign") && scene.panel === null) {
        const speeds: readonly number[] = scene.kind === "preview" ? previewSpeeds : standardScenario.rules.speedMultipliers
        if (speeds.includes(event.speed) && event.speed !== scene.speed) return { ...scene, speed: event.speed }
      }
      break
    case "advance-week": {
      if (scene.kind !== "campaign" || playbackSpeed(scene) === 0 || scene.run.seed !== event.seed
        || scene.run.completedWeek !== event.completedWeek) return scene
      const run = advanceWeek(scene.run)
      if (run.completedWeek >= standardScenario.rules.maxWeeks) return { kind: "ending", outcome: "timeout", run }
      const campaign: Campaign = { ...scene, run }
      const entry = run.events.at(-1)
      if (entry?.week === run.completedWeek && entry.content.kind === "decision") {
        return { kind: "decision", id: entry.content.id, instanceId: entry.instanceId, back: campaign }
      }
      return campaign
    }
    case "open-decision":
      if (scene.kind === "campaign" && scene.panel === "news" && Object.hasOwn(decisions, event.id)
        && (event.instanceId === undefined || pendingDecision(scene.run, event.instanceId, event.id))) {
        return { kind: "decision", id: event.id, instanceId: event.instanceId, back: scene }
      }
      break
    case "choose":
      if (scene.kind !== "decision" || scene.id !== event.id || scene.instanceId !== event.instanceId) return scene
      if (event.instanceId !== undefined) {
        const run = resolveDecision(scene.back.run, event.instanceId, scene.id, event.choiceId)
        return run === scene.back.run ? scene : { ...scene.back, run }
      }
      if (decisions[scene.id].choices.some(c => c.id === event.choiceId)) {
        return { ...scene.back, lastDecision: { id: event.id, choiceId: event.choiceId } }
      }
      break
    case "request-exit":
      if (scene.kind === "campaign" && scene.panel === "menu") return { ...scene, panel: "confirm-exit" }
      break
    case "withdraw":
      if (scene.kind === "campaign" && scene.panel === "confirm-exit") {
        return { kind: "ending", run: scene.run, outcome: "withdrawn" }
      }
      break
    case "finish":
      if ((scene.kind === "campaign" || scene.kind === "decision") && Object.hasOwn(endings, event.outcome)) {
        return { kind: "ending", run: scene.kind === "campaign" ? scene.run : scene.back.run, outcome: event.outcome }
      }
      break
    case "return-to-preview":
      if (scene.kind === "ending") return initialScene
      break
    default:
      event satisfies never
  }
  return scene
}

/** The map and camera stay mounted behind every overlay. */
export function visibleRunState(scene: Scene): RunState | null {
  switch (scene.kind) {
    case "preview": return null
    case "setup": return scene.back.kind === "ending" ? scene.back.run : null
    case "decision": return scene.back.run
    default: return scene.run
  }
}

export function visibleRun(scene: Scene): RunSetup | null {
  return visibleRunState(scene)?.setup ?? null
}

export function playbackSpeed(scene: Scene): number {
  if (scene.kind === "preview") return scene.speed
  if (scene.kind === "campaign" && scene.panel !== "menu" && scene.panel !== "overview" && scene.panel !== "confirm-exit") {
    return scene.speed
  }
  return 0
}
