import {
  advanceDay,
  buildDataCenter,
  buyBuildCard,
  collectMapBubble,
  createRun,
  dailyOutcome,
  fundConversion,
  pendingDecision,
  resolveDecision,
  startResearch,
  toggleSyntheticProgram,
  unlockResearchSlot,
  useAction,
  type RunSetup,
  type RunState,
} from "../../../../packages/game/run.ts"
import { decisions, type DecisionId } from "../../../../packages/rules/v0.1/events/decisions.ts"
import { endings, type Outcome } from "../../../../packages/rules/v0.1/endings/standard.ts"
import type { ActionId } from "../../../../packages/rules/v0.1/evolution/actions.ts"
import type { FactionAbilityId } from "../../../../packages/rules/v0.1/factions/roster.ts"
import { researchNode, trees, type SkillId } from "../../../../packages/rules/v0.1/evolution/trees.ts"
import { isFactionId, isRegionId, standardScenario } from "../../../../packages/rules/v0.1/scenario.ts"
import type { RegionId } from "../../../../packages/rules/v0.1/world/regions.ts"

export type { RunSetup }
const mapPanels = ["menu", "world", "region", "overview", "actions", "news"] as const
export type MapPanel = typeof mapPanels[number]
const newsViews = ["archive", "current", "day"] as const
export type NewsView = typeof newsViews[number]
type NewsFocus = { newsView?: NewsView; newsItemId?: string }
type Preview = { kind: "preview"; panel: MapPanel | null; speed: number; manualPaused: boolean } & NewsFocus
export type RunSelection = Pick<RunSetup, "factionId" | "startRegionId">

interface Start {
  kind: "start"
  back: Preview
}

interface Setup {
  kind: "setup"
  back: Preview | Ending | Start
  selection?: RunSelection
}

interface Difficulty {
  kind: "difficulty"
  back: Setup & { selection: RunSelection }
}

interface Settings {
  kind: "settings"
  back: Start | Preview | Campaign
}

interface Campaign extends NewsFocus {
  kind: "campaign"
  run: RunState
  panel: MapPanel | "confirm-exit" | null
  speed: number
  manualPaused: boolean
  researchSkillId?: SkillId
  lastDecision?: { id: DecisionId; choiceId: string }
}

export interface Ending {
  kind: "ending"
  run: RunState
  outcome: Outcome | "withdrawn"
}

export type Scene =
  | Preview
  | Start
  | Settings
  | Setup
  | Difficulty
  | Campaign
  | { kind: "decision"; id: DecisionId; instanceId?: string; back: Campaign }
  | Ending

export type SceneEvent =
  | { type: "open-panel"; panel: MapPanel; newsView?: NewsView; newsItemId?: string }
  | { type: "back" }
  | { type: "set-speed"; speed: number }
  | { type: "set-paused"; paused: boolean }
  | { type: "open-start" }
  | { type: "open-settings" }
  | { type: "open-setup" }
  | { type: "open-difficulty"; factionId: string; startRegionId: string }
  | { type: "start"; factionId: string; startRegionId: string; difficultyId: string; seed?: number; runId?: string }
  | { type: "advance-day"; runId: string; completedDay: number }
  | { type: "select-research"; skillId: SkillId }
  | { type: "unlock-research-slot"; slot: number; runId: string; completedDay: number; seq: number }
  | { type: "start-research"; skillId: SkillId; runId: string; completedDay: number; seq: number }
  | { type: "buy-build-card"; runId: string; completedDay: number; seq: number }
  | { type: "build-data-center"; countryId: string; runId: string; completedDay: number; seq: number }
  | { type: "fund-conversion"; tokens: number; runId: string; completedDay: number; seq: number }
  | { type: "toggle-synthetic"; regionId: RegionId; enabled: boolean; runId: string; completedDay: number; seq: number }
  | { type: "use-action"; abilityId: ActionId | FactionAbilityId; targetRegionId?: RegionId; runId: string; completedDay: number; seq: number }
  | { type: "collect-bubble"; bubbleId: string; runId: string; completedDay: number; seq: number }
  | { type: "open-decision"; id: DecisionId; instanceId?: string }
  | { type: "choose"; id: DecisionId; instanceId?: string; choiceId: string }
  | { type: "request-exit" }
  | { type: "withdraw" }
  | { type: "finish"; outcome: Outcome }
  | { type: "return-to-preview" }

export const previewSpeeds = standardScenario.rules.speedMultipliers
export const defaultResearchSkill = trees[0].skills[0].id
export const initialScene: Preview = { kind: "preview", panel: null, speed: 1, manualPaused: false }

function isNewsView(value: string): value is NewsView {
  return (newsViews as readonly string[]).includes(value)
}

function showNews(scene: Preview | Campaign, view: NewsView, itemId: string | undefined): Preview | Campaign {
  const { newsView, newsItemId, ...rest } = scene
  void newsView
  void newsItemId
  const opened = { ...rest, panel: "news" as const, newsView: view }
  return itemId === undefined ? opened : { ...opened, newsItemId: itemId }
}

export function sceneReducer(scene: Scene, event: SceneEvent): Scene {
  switch (event.type) {
    case "open-panel": {
      if (scene.kind !== "preview" && scene.kind !== "campaign") break
      if (!mapPanels.includes(event.panel)) break
      if (event.panel === "actions" && scene.kind !== "campaign") return scene
      if (event.panel === "news") {
        if (event.newsView !== undefined && !isNewsView(event.newsView)) return scene
        if (event.newsItemId !== undefined && event.newsItemId === "") return scene
        const view = event.newsView ?? "archive"
        const itemId = event.newsItemId
        if (scene.panel !== null && scene.panel !== "news") return scene
        if (scene.panel === "news" && (scene.newsView ?? "archive") === view && scene.newsItemId === itemId) return scene
        return showNews(scene, view, itemId)
      }
      if (scene.panel !== null) return scene
      return { ...scene, panel: event.panel }
    }
    case "back":
      if (scene.kind === "start" || scene.kind === "settings" || scene.kind === "setup"
        || scene.kind === "difficulty" || scene.kind === "decision") return scene.back
      if (scene.kind === "campaign" && scene.panel === "confirm-exit") return { ...scene, panel: "menu" }
      if ((scene.kind === "preview" || scene.kind === "campaign") && scene.panel) {
        if (scene.newsView === undefined && scene.newsItemId === undefined) return { ...scene, panel: null }
        const { newsView, newsItemId, ...rest } = scene
        void newsView
        void newsItemId
        return { ...rest, panel: null }
      }
      break
    case "open-start":
      if (scene.kind === "preview" && (scene.panel === null || scene.panel === "menu")) {
        return { kind: "start", back: scene }
      }
      break
    case "open-settings":
      if (scene.kind === "start" || ((scene.kind === "preview" || scene.kind === "campaign") && scene.panel === "menu")) {
        return { kind: "settings", back: scene }
      }
      break
    case "open-setup":
      if (scene.kind === "start" || (scene.kind === "preview" && scene.panel === "menu") || scene.kind === "ending") {
        return scene.kind === "ending"
          ? { kind: "setup", back: scene, selection: { factionId: scene.run.setup.factionId, startRegionId: scene.run.setup.startRegionId } }
          : { kind: "setup", back: scene }
      }
      break
    case "open-difficulty": {
      if (scene.kind !== "setup" || !isFactionId(event.factionId) || !isRegionId(event.startRegionId)) return scene
      const selection: RunSelection = { factionId: event.factionId, startRegionId: event.startRegionId }
      return { kind: "difficulty", back: { ...scene, selection } }
    }
    case "start": {
      if (scene.kind !== "setup" && scene.kind !== "difficulty") return scene
      if (scene.kind === "difficulty" && (event.factionId !== scene.back.selection.factionId
        || event.startRegionId !== scene.back.selection.startRegionId || event.difficultyId !== standardScenario.difficulty.id)) return scene
      const run = createRun(event, event.seed === undefined ? 0 : event.seed, event.runId)
      return run ? { kind: "campaign", run, speed: 1, manualPaused: false, panel: null } : scene
    }
    case "set-speed": {
      const current = scene.kind === "decision" ? scene.back : scene
      if (current.kind !== "preview" && current.kind !== "campaign") return scene
      const speeds: readonly number[] = standardScenario.rules.speedMultipliers
      if (!speeds.includes(event.speed) || event.speed === current.speed) return scene
      const next = { ...current, speed: event.speed }
      return scene.kind === "decision" ? { ...scene, back: next as Campaign } : next
    }
    case "set-paused": {
      const current = scene.kind === "decision" ? scene.back : scene
      if ((current.kind !== "preview" && current.kind !== "campaign") || typeof event.paused !== "boolean"
        || current.manualPaused === event.paused) return scene
      const next = { ...current, manualPaused: event.paused }
      return scene.kind === "decision" ? { ...scene, back: next as Campaign } : next
    }
    case "advance-day":
      return playbackSpeed(scene) === 0 ? scene : advanceCampaignDay(scene, event.runId, event.completedDay)
    case "select-research":
      if (scene.kind === "campaign" && scene.panel === "overview" && researchNode(event.skillId)
        && event.skillId !== (scene.researchSkillId ?? defaultResearchSkill)) return { ...scene, researchSkillId: event.skillId }
      break
    case "unlock-research-slot":
    case "start-research": {
      if (scene.kind !== "campaign" || scene.panel !== "overview"
        || scene.run.runId !== event.runId || scene.run.completedDay !== event.completedDay) return scene
      const run = event.type === "start-research" ? startResearch(scene.run, event.skillId, event.seq)
        : unlockResearchSlot(scene.run, event.slot, event.seq)
      return run === scene.run ? scene : { ...scene, run }
    }
    case "buy-build-card":
    case "build-data-center":
    case "fund-conversion":
    case "toggle-synthetic":
    case "use-action": {
      if (scene.kind !== "campaign" || (scene.panel !== "actions" && scene.panel !== "region" && scene.panel !== null)
        || scene.run.runId !== event.runId || scene.run.completedDay !== event.completedDay) return scene
      const run = event.type === "buy-build-card"
        ? buyBuildCard(scene.run, event.seq)
        : event.type === "build-data-center"
          ? buildDataCenter(scene.run, event.countryId, event.seq)
          : event.type === "fund-conversion"
            ? fundConversion(scene.run, event.tokens, event.seq)
            : event.type === "toggle-synthetic"
              ? toggleSyntheticProgram(scene.run, event.regionId, event.enabled, event.seq)
              : useAction(scene.run, event.abilityId, event.seq, event.targetRegionId)
      if (run === scene.run) return scene
      const outcome = dailyOutcome(run)
      return outcome ? { kind: "ending", outcome, run } : { ...scene, run }
    }
    case "collect-bubble": {
      if (scene.kind !== "campaign" || scene.panel !== null
        || scene.run.runId !== event.runId || scene.run.completedDay !== event.completedDay) return scene
      const run = collectMapBubble(scene.run, event.bubbleId, event.seq)
      return run === scene.run ? scene : { ...scene, run }
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
        if (run === scene.back.run) return scene
        const outcome = dailyOutcome(run)
        return outcome ? { kind: "ending", outcome, run } : { ...scene.back, run }
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

export function advanceCampaignDay(scene: Scene, runId: string, completedDay: number): Scene {
  if (scene.kind !== "campaign" || scene.run.runId !== runId || scene.run.completedDay !== completedDay) return scene
  const run = advanceDay(scene.run)
  if (run === scene.run) return scene
  const outcome = dailyOutcome(run)
  if (outcome) return { kind: "ending", outcome, run }
  const campaign: Campaign = { ...scene, run }
  const entry = run.events.at(-1)
  if (entry?.day === run.completedDay && entry.content.kind === "decision") {
    return { kind: "decision", id: entry.content.id, instanceId: entry.instanceId, back: campaign }
  }
  return campaign
}

/** The map and camera stay mounted behind every overlay. */
export function visibleRunState(scene: Scene): RunState | null {
  switch (scene.kind) {
    case "preview": return null
    case "start":
    case "settings":
    case "setup":
    case "difficulty":
    case "decision": return visibleRunState(scene.back)
    default: return scene.run
  }
}

export function visibleRun(scene: Scene): RunSetup | null {
  return visibleRunState(scene)?.setup ?? null
}

export function playbackSpeed(scene: Scene): number {
  if ((scene.kind === "preview" || scene.kind === "campaign") && !scene.manualPaused
    && scene.panel !== "menu" && scene.panel !== "overview" && scene.panel !== "actions" && scene.panel !== "confirm-exit") {
    return scene.speed
  }
  return 0
}
