import { acceptWithoutChange, createEventStore } from "../../../../packages/game/event-store.ts"
import type { RunEvent, RunSetup } from "../../../../packages/game/run.ts"
import type { GameCommand } from "../../../../packages/game/types.ts"
import type { Outcome } from "../../../../packages/rules/v0.1/endings/standard.ts"
import { standardScenario } from "../../../../packages/rules/v0.1/scenario.ts"
import { soundBank, type SoundCue } from "../audio/cues.ts"
import { defaultSound, validVolume, type SoundSettings } from "../audio/settings.ts"
import { initialScene, sceneReducer, visibleRunState, type Scene, type SceneEvent } from "./machine.ts"

export interface MapSelection {
  readonly lon: number
  readonly lat: number
  readonly countryId?: string | null
  readonly islandName?: string
  readonly site?: string
}

const initialLayers = { night: true, cloud: true, current: true }
const previewSelection: MapSelection = { lon: 31.2, lat: 49.1 }
export interface GameState {
  readonly scene: Scene
  readonly selection: MapSelection | null
  readonly layers: Readonly<typeof initialLayers>
  readonly sound: SoundSettings
}

export type GameEvent = SceneEvent
  | { type: "play-sound"; cue: SoundCue }
  | { type: "set-sound-muted"; muted: boolean }
  | { type: "set-sound-volume"; volume: number }
  | { type: "set-layer"; layer: keyof typeof initialLayers; enabled: boolean }
  | { type: "pick-location"; selection: MapSelection }
  | { type: "focus-country"; selection: MapSelection }
  | { type: "map-preset"; view: "global" | "europe" }

export type GameNotice =
  | { type: "run-started"; setup: RunSetup; seed: number }
  | { type: "event-occurred"; entry: RunEvent }
  | { type: "decision-resolved"; command: Extract<GameCommand, { kind: "chooseEvent" }> }
  | { type: "run-ended"; outcome: Outcome | "withdrawn" }

function validSelection(point: MapSelection | null | undefined) {
  return point != null && Number.isFinite(point.lon) && Math.abs(point.lon) <= 180
    && Number.isFinite(point.lat) && Math.abs(point.lat) <= 90
    && (point.countryId == null || typeof point.countryId === "string")
    && (point.site === undefined || typeof point.site === "string")
    && (point.islandName === undefined || typeof point.islandName === "string")
}

function sameSelection(current: MapSelection | null, next: MapSelection) {
  return current !== null && current.lon === next.lon && current.lat === next.lat
    && current.countryId === next.countryId && current.site === next.site && current.islandName === next.islandName
}

function reduceGame(state: GameState, event: GameEvent): GameState | typeof acceptWithoutChange {
  const { scene } = state
  switch (event.type) {
    case "play-sound":
      if (typeof event.cue !== "string" || !Object.hasOwn(soundBank, event.cue)
        || state.sound.muted || state.sound.volume === 0) return state
      return acceptWithoutChange
    case "set-sound-muted":
      if (typeof event.muted !== "boolean" || state.sound.muted === event.muted) return state
      return { ...state, sound: { ...state.sound, muted: event.muted } }
    case "set-sound-volume":
      if (!validVolume(event.volume) || state.sound.volume === event.volume) return state
      return { ...state, sound: { ...state.sound, volume: event.volume } }
    case "set-layer":
      if (!Object.hasOwn(initialLayers, event.layer) || typeof event.enabled !== "boolean"
        || state.layers[event.layer] === event.enabled) return state
      return { ...state, layers: { ...state.layers, [event.layer]: event.enabled } }
    case "pick-location":
      if ((scene.kind !== "campaign" && scene.kind !== "preview") || scene.panel !== null
        || !validSelection(event.selection) || sameSelection(state.selection, event.selection)) return state
      return { ...state, selection: event.selection }
    case "focus-country":
      if ((scene.kind !== "campaign" && scene.kind !== "preview") || scene.panel !== "region"
        || !validSelection(event.selection) || !event.selection.countryId) return state
      return { ...state, selection: event.selection, scene: sceneReducer(scene, { type: "back" }) }
    case "map-preset":
      if ((scene.kind !== "campaign" && scene.kind !== "preview") || (scene.panel !== "world" && scene.panel !== "menu")
        || (event.view !== "europe" && event.view !== "global")) return state
      return { ...state, selection: event.view === "europe" ? previewSelection : null, scene: sceneReducer(scene, { type: "back" }) }
    default: {
      const next = sceneReducer(scene, event)
      if (next === scene) return state
      if (event.type === "start" && next.kind === "campaign") {
        const [lon, lat] = standardScenario.regions[next.run.setup.startRegionId].center
        return { ...state, scene: next, selection: { lon, lat } }
      }
      if (event.type === "return-to-preview") return { ...state, scene: next, selection: previewSelection }
      return { ...state, scene: next }
    }
  }
}

function gameNotices(event: GameEvent, { scene }: GameState): GameNotice[] {
  if (event.type === "start" && scene.kind === "campaign") {
    return [{ type: "run-started", setup: scene.run.setup, seed: scene.run.seed }]
  }
  if (scene.kind === "ending" && (event.type === "withdraw" || event.type === "finish" || event.type === "advance-week")) {
    return [{ type: "run-ended", outcome: scene.outcome }]
  }
  if (event.type === "advance-week") {
    const run = visibleRunState(scene)
    const entry = run?.events.at(-1)
    if (entry && entry.week === run?.completedWeek) return [{ type: "event-occurred", entry }]
  }
  if (event.type === "choose" && event.instanceId !== undefined && scene.kind === "campaign") {
    const command = scene.run.commands.at(-1)
    if (command?.kind === "chooseEvent") return [{ type: "decision-resolved", command }]
  }
  return []
}

export function createGameStore(sound: SoundSettings = defaultSound) {
  const initial = { scene: initialScene, layers: initialLayers, selection: previewSelection, sound }
  return createEventStore<GameState, GameEvent, GameNotice>(initial, reduceGame, gameNotices)
}

export type GameStore = ReturnType<typeof createGameStore>
