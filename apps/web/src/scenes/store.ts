import { acceptWithoutChange, createEventStore } from "../../../../packages/game/event-store.ts"
import { projectsCompleting, researchState, type ResearchProject } from "../../../../packages/game/research.ts"
import { grantDeveloperTokens, type RunEvent, type RunSetup } from "../../../../packages/game/run.ts"
import type { GameCommand, TokenGrant } from "../../../../packages/game/types.ts"
import { defaultLocale, isLocale, type Locale } from "../../../../packages/rules/locales.ts"
import type { Outcome } from "../../../../packages/rules/v0.1/endings/standard.ts"
import { isRegionId } from "../../../../packages/rules/v0.1/scenario.ts"
import { regionOfCountry, type RegionId } from "../../../../packages/rules/v0.1/world/regions.ts"
import { computePlaceById, computePlaces } from "../cartography/compute-markers.ts"
import { spratlyIslands } from "../cartography/place-names.ts"
import { soundBank, type SoundCue } from "../audio/cues.ts"
import { defaultSound, validVolume, type SoundSettings } from "../audio/settings.ts"
import { advanceCampaignWeek, initialScene, playbackSpeed, sceneReducer, visibleRunState, type Scene, type SceneEvent } from "./machine.ts"
import { initialPopulationPreview, type PopulationPreview } from "./world/populationPreview.ts"

export interface MapPoint {
  readonly lon: number
  readonly lat: number
  readonly countryId?: string | null
  readonly islandId?: typeof spratlyIslands
  readonly siteId?: string
}

// Older map pickers sent a display label alongside the marker coordinates.
type PickedPoint = MapPoint & { readonly site?: string; readonly islandName?: string }

export type PlaceFocus = { readonly kind: "market"; readonly id: RegionId }
export type MapSelection = MapPoint | PlaceFocus

function marketFocus(id: RegionId): PlaceFocus {
  return { kind: "market", id }
}

export function selectedPlace(selection: MapSelection | null, locatedCountryId?: string): PlaceFocus | null {
  if (!selection || "kind" in selection) return selection
  const countryId = selection.countryId === undefined ? locatedCountryId : selection.countryId
  const id = countryId && regionOfCountry(countryId)
  return id ? marketFocus(id) : null
}

const initialLayers = { night: true, cloud: true, current: true, population: true }
const previewSelection: MapPoint = { lon: 31.2, lat: 49.1 }
export interface GameState {
  readonly scene: Scene
  readonly selection: MapSelection | null
  readonly layers: Readonly<typeof initialLayers>
  readonly populationPreview: PopulationPreview | null
  readonly sound: SoundSettings
  readonly locale: Locale
  readonly developer: { readonly enabled: boolean; readonly open: boolean }
}

export type GameEvent = SceneEvent
  | { type: "set-developer-enabled"; enabled: boolean }
  | { type: "set-developer-open"; open: boolean }
  | { type: "dev-step-week"; seed: number; completedWeek: number }
  | { type: "dev-grant-token"; seed: number; completedWeek: number; seq: number; amount: number }
  | { type: "set-locale"; locale: Locale }
  | { type: "play-sound"; cue: SoundCue }
  | { type: "set-sound-muted"; muted: boolean }
  | { type: "set-sound-volume"; volume: number }
  | { type: "set-layer"; layer: keyof typeof initialLayers; enabled: boolean }
  | { type: "open-population-preview" } | { type: "close-population-preview" }
  | { type: "set-preview-population"; field: keyof PopulationPreview; percent: number }
  | { type: "pick-location"; selection: PickedPoint }
  | { type: "focus-place"; place: PlaceFocus | null }
  | { type: "map-preset"; view: "global" | "europe" }

export type GameNotice =
  | { type: "run-started"; setup: RunSetup; seed: number }
  | { type: "dev-token-granted"; command: TokenGrant }
  | { type: "event-occurred"; entry: RunEvent }
  | { type: "research-slot-unlocked"; slot: number }
  | { type: "research-started"; project: ResearchProject }
  | { type: "research-completed"; project: ResearchProject }
  | { type: "decision-resolved"; command: Extract<GameCommand, { kind: "chooseEvent" }> }
  | { type: "run-ended"; outcome: Outcome | "withdrawn" }

function readMapPoint(point: PickedPoint | null | undefined): MapPoint | null {
  if (!point || typeof point !== "object" || "kind" in point
    || !Number.isFinite(point.lon) || Math.abs(point.lon) > 180
    || !Number.isFinite(point.lat) || Math.abs(point.lat) > 90
    || (point.countryId != null && typeof point.countryId !== "string")) return null
  if ("site" in point || "islandName" in point) {
    const { site, islandName, ...position } = point
    if (position.siteId !== undefined || position.islandId !== undefined) return null
    if (typeof site === "string" && site && islandName === undefined) {
      // The old picker used the site's center. Longitude wrapping can introduce rounding error.
      const marker = computePlaces.find(p => p.lat === point.lat && Math.abs(p.lon - point.lon) < 1e-8)
      return marker ? { ...position, siteId: marker.id } : null
    }
    return typeof islandName === "string" && islandName && site === undefined && point.countryId === "CHN"
      ? { ...position, islandId: spratlyIslands } : null
  }
  if (point.siteId !== undefined && !computePlaceById(point.siteId)) return null
  if (point.islandId !== undefined && (point.islandId !== spratlyIslands || point.countryId !== "CHN" || point.siteId !== undefined)) return null
  return point
}

function validPlace(place: PlaceFocus | null | undefined) {
  return place === null || (place?.kind === "market" && isRegionId(place.id))
}

function sameSelection(current: MapSelection | null, next: MapSelection | null) {
  if (!current || !next) return current === next
  if ("kind" in current) return "kind" in next && current.kind === next.kind && current.id === next.id
  return !("kind" in next) && current.lon === next.lon && current.lat === next.lat
    && current.countryId === next.countryId && current.siteId === next.siteId && current.islandId === next.islandId
}

function reduceGame(state: GameState, event: GameEvent): GameState | typeof acceptWithoutChange {
  const { scene } = state
  switch (event.type) {
    case "set-developer-enabled":
      if (typeof event.enabled !== "boolean" || event.enabled === state.developer.enabled) return state
      return { ...state, developer: { enabled: event.enabled, open: false } }
    case "set-developer-open": {
      if (!state.developer.enabled || typeof event.open !== "boolean") return state
      const fromMenu = (scene.kind === "preview" || scene.kind === "campaign") && scene.panel === "menu"
      if (event.open && (scene.kind === "setup" || ((scene.kind === "preview" || scene.kind === "campaign") && scene.panel && !fromMenu))) return state
      if (state.developer.open === event.open && !(event.open && fromMenu)) return state
      return { ...state, developer: { enabled: true, open: event.open },
        scene: event.open && fromMenu ? sceneReducer(scene, { type: "back" }) : scene }
    }
    case "dev-step-week": {
      if (!state.developer.open || scene.kind !== "campaign" || scene.panel !== null) return state
      const next = advanceCampaignWeek(scene, event.seed, event.completedWeek)
      return next === scene ? state : { ...state, scene: next }
    }
    case "dev-grant-token": {
      const campaign = scene.kind === "decision" ? scene.back : scene.kind === "campaign" && scene.panel === null ? scene : null
      if (!state.developer.open || !campaign || campaign.run.seed !== event.seed || campaign.run.completedWeek !== event.completedWeek) return state
      const run = grantDeveloperTokens(campaign.run, event.amount, event.seq)
      if (run === campaign.run) return state
      const next = { ...campaign, run }
      return { ...state, scene: scene.kind === "decision" ? { ...scene, back: next } : next }
    }
    case "play-sound":
      if (typeof event.cue !== "string" || !Object.hasOwn(soundBank, event.cue)
        || state.sound.muted || state.sound.volume === 0) return state
      return acceptWithoutChange
    case "set-locale":
      return isLocale(event.locale) && state.locale !== event.locale ? { ...state, locale: event.locale } : state
    case "set-sound-muted":
      if (typeof event.muted !== "boolean" || state.sound.muted === event.muted) return state
      return { ...state, sound: { ...state.sound, muted: event.muted } }
    case "set-sound-volume":
      if (!validVolume(event.volume) || state.sound.volume === event.volume) return state
      return { ...state, sound: { ...state.sound, volume: event.volume } }
    case "set-layer":
      if (!Object.hasOwn(initialLayers, event.layer) || typeof event.enabled !== "boolean"
        || state.layers[event.layer] === event.enabled) return state
      return { ...state, layers: { ...state.layers, [event.layer]: event.enabled },
        populationPreview: event.layer === "population" && !event.enabled ? null : state.populationPreview }
    case "open-population-preview":
      if (scene.kind !== "preview" || scene.panel !== "world") return state
      return { ...state, scene: sceneReducer(scene, { type: "back" }), selection: null,
        populationPreview: state.populationPreview ?? initialPopulationPreview, layers: { ...state.layers, population: true } }
    case "close-population-preview":
      return scene.kind === "preview" && scene.panel === null && state.populationPreview ? { ...state, populationPreview: null } : state
    case "set-preview-population":
      if (scene.kind !== "preview" || scene.panel !== null || !state.populationPreview
        || !Object.hasOwn(initialPopulationPreview, event.field) || !Number.isInteger(event.percent)
        || event.percent < 0 || event.percent > 100 || state.populationPreview[event.field] === event.percent) return state
      return { ...state, populationPreview: { ...state.populationPreview, [event.field]: event.percent } }
    case "pick-location": {
      if ((scene.kind !== "campaign" && scene.kind !== "preview") || scene.panel !== null) return state
      const point = readMapPoint(event.selection)
      if (!point) return state
      const selection = point.siteId || point.islandId ? point : selectedPlace(point) ?? point
      return sameSelection(state.selection, selection) ? state : { ...state, selection }
    }
    case "focus-place": {
      const place = event.place
      if (!validPlace(place)) return state
      const fromMap = scene.kind === "campaign" && scene.panel === null
      const fromDirectory = (scene.kind === "preview" || scene.kind === "campaign") && scene.panel === "region" && place !== null
      if (!fromMap && !fromDirectory) return state
      if (fromMap && sameSelection(state.selection, place)) return state
      return { ...state, selection: place, scene: fromDirectory ? sceneReducer(scene, { type: "back" }) : scene }
    }
    case "map-preset":
      if ((scene.kind !== "campaign" && scene.kind !== "preview") || (event.view !== "europe" && event.view !== "global")) return state
      if (scene.panel === null && event.view === "global") return state.selection === null ? acceptWithoutChange : { ...state, selection: null }
      if (scene.panel !== "world" && scene.panel !== "menu") return state
      return { ...state, selection: event.view === "global" ? null : scene.kind === "campaign" ? marketFocus("eu") : previewSelection,
        scene: sceneReducer(scene, { type: "back" }) }
    default: {
      if (event.type === "advance-week" && state.developer.open) return state
      const next = sceneReducer(scene, event)
      if (next === scene) return state
      if (event.type === "start" && next.kind === "campaign") {
        return { ...state, scene: next, developer: { ...state.developer, open: false }, populationPreview: null, selection: marketFocus(next.run.setup.startRegionId) }
      }
      if (event.type === "return-to-preview") return { ...state, scene: next, developer: { ...state.developer, open: false }, selection: previewSelection }
      if (event.type === "open-setup" && state.developer.open) return { ...state, scene: next, developer: { ...state.developer, open: false } }
      return { ...state, scene: next }
    }
  }
}

function gameNotices(event: GameEvent, { scene }: GameState): GameNotice[] {
  if (event.type === "start" && scene.kind === "campaign") {
    return [{ type: "run-started", setup: scene.run.setup, seed: scene.run.seed }]
  }
  const stepped = event.type === "advance-week" || event.type === "dev-step-week"
  if (stepped) {
    const run = visibleRunState(scene)
    if (!run) return []
    const notices: GameNotice[] = projectsCompleting(run, run.completedWeek)
      .map(project => ({ type: "research-completed", project }))
    const entry = run.events.at(-1)
    if (entry?.week === run.completedWeek) notices.push({ type: "event-occurred", entry })
    if (scene.kind === "ending") notices.push({ type: "run-ended", outcome: scene.outcome })
    return notices
  }
  if (scene.kind === "ending" && (event.type === "withdraw" || event.type === "finish")) {
    return [{ type: "run-ended", outcome: scene.outcome }]
  }
  if (event.type === "unlock-research-slot") return [{ type: "research-slot-unlocked", slot: event.slot }]
  if (event.type === "start-research" && scene.kind === "campaign") {
    const project = researchState(scene.run).projects.at(-1)
    if (project) return [{ type: "research-started", project }]
  }
  if (event.type === "dev-grant-token") {
    const command = visibleRunState(scene)?.commands.at(-1)
    if (command?.kind === "devGrantTokens") return [{ type: "dev-token-granted", command }]
  }
  if (event.type === "choose" && event.instanceId !== undefined && scene.kind === "campaign") {
    const command = scene.run.commands.at(-1)
    if (command?.kind === "chooseEvent") return [{ type: "decision-resolved", command }]
  }
  return []
}

function storeFromSnapshot(initial: GameState) {
  return createEventStore<GameState, GameEvent, GameNotice>(initial, reduceGame, gameNotices)
}

export function createGameStore(sound: SoundSettings = defaultSound, locale: Locale = defaultLocale, developerEnabled = false) {
  return storeFromSnapshot({ scene: initialScene, layers: initialLayers, selection: previewSelection, populationPreview: null,
    sound, locale, developer: { enabled: developerEnabled, open: false } })
}

/** A manual trial owns its subscriptions and queue. The browser clock stays attached to the live store. */
export function forkDeveloperStore(snapshot: GameState) {
  let scene = snapshot.scene
  // The trial has its own controls. A decision opened from the live news archive returns to its trial map.
  if (scene.kind === "decision" && scene.back.panel === "news") {
    const back = sceneReducer(scene.back, { type: "back" })
    if (back.kind === "campaign") scene = { ...scene, back }
  }
  return storeFromSnapshot({ ...snapshot, scene, developer: { enabled: true, open: true } })
}

export function gamePlaybackSpeed(state: GameState) {
  return state.developer.open ? 0 : playbackSpeed(state.scene)
}

export type GameStore = ReturnType<typeof createGameStore>
