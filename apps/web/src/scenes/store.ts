import { acceptWithoutChange, createEventStore } from "../../../../packages/game/event-store.ts"
import type { MapBubble } from "../../../../packages/game/operations.ts"
import { projectsCompleting, researchState, type ResearchProject } from "../../../../packages/game/research.ts"
import { grantDeveloperTokens, type RunEvent, type RunSetup } from "../../../../packages/game/run.ts"
import type { GameCommand, TokenGrant } from "../../../../packages/game/types.ts"
import { defaultLocale, isLocale, type Locale } from "../../../../packages/rules/locales.ts"
import type { Outcome } from "../../../../packages/rules/v0.1/endings/standard.ts"
import type { ActionId } from "../../../../packages/rules/v0.1/evolution/actions.ts"
import type { FactionAbilityId } from "../../../../packages/rules/v0.1/factions/roster.ts"
import { isRegionId } from "../../../../packages/rules/v0.1/scenario.ts"
import { regionOfCountry, type RegionId } from "../../../../packages/rules/v0.1/world/regions.ts"
import { computePlaceById, computePlaces } from "../cartography/compute-markers.ts"
import { spratlyIslands } from "../cartography/place-names.ts"
import { isSoundCue, type SoundCue } from "../audio/cues.ts"
import { defaultMusic, resolveMusicTrackId, type MusicSettings } from "../audio/music.ts"
import { defaultSound, validVolume, type SoundSettings } from "../audio/settings.ts"
import {
  applyShortcutBinding,
  defaultShortcuts,
  isDefaultShortcuts,
  sanitizeShortcuts,
  type ShortcutAction,
  type ShortcutBindings,
} from "../input/shortcuts.ts"
import { advanceCampaignDay, initialScene, playbackSpeed, sceneReducer, visibleRunState, type Scene, type SceneEvent } from "./machine.ts"
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
  readonly music: MusicSettings
  readonly shortcuts: ShortcutBindings
  readonly locale: Locale
  readonly developer: { readonly enabled: boolean; readonly open: boolean }
  readonly environment: { readonly visible: boolean; readonly suspended: boolean }
}

export type GameEvent = SceneEvent
  | { type: "set-developer-enabled"; enabled: boolean }
  | { type: "set-developer-open"; open: boolean }
  | { type: "dev-step-day"; runId: string; completedDay: number }
  | { type: "dev-grant-token"; runId: string; completedDay: number; seq: number; amount: number }
  | { type: "set-page-visible"; visible: boolean }
  | { type: "set-page-suspended"; suspended: boolean }
  | { type: "set-locale"; locale: Locale }
  | { type: "play-sound"; cue: SoundCue }
  | { type: "set-sound-muted"; muted: boolean }
  | { type: "set-sound-volume"; volume: number }
  | { type: "set-music-enabled"; enabled: boolean }
  | { type: "set-music-volume"; volume: number }
  | { type: "set-music-track"; trackId: string | null }
  | { type: "set-shortcut"; action: ShortcutAction; code: string }
  | { type: "reset-shortcuts" }
  | { type: "set-layer"; layer: keyof typeof initialLayers; enabled: boolean }
  | { type: "open-population-preview" } | { type: "close-population-preview" }
  | { type: "set-preview-population"; field: keyof PopulationPreview; percent: number }
  | { type: "pick-location"; selection: PickedPoint }
  | { type: "focus-place"; place: PlaceFocus | null }
  | { type: "map-preset"; view: "global" | "europe" }

export type GameNotice =
  | { type: "run-started"; setup: RunSetup; seed: number; runId: string }
  | { type: "dev-token-granted"; command: TokenGrant }
  | { type: "event-occurred"; entry: RunEvent }
  | { type: "research-slot-unlocked"; slot: number }
  | { type: "research-started"; project: ResearchProject }
  | { type: "research-completed"; project: ResearchProject }
  | { type: "build-card-bought"; buildCards: number }
  | { type: "data-center-built"; countryId: string; centers: number }
  | { type: "synthetic-funded"; tokens: number; budgetPeople: number }
  | { type: "synthetic-toggled"; regionId: RegionId; enabled: boolean; firstActivation: boolean }
  | { type: "eternal-night-started" }
  | { type: "action-used"; abilityId: ActionId | FactionAbilityId; targetRegionId?: RegionId }
  | { type: "bubble-collected"; bubble: MapBubble }
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

function enteredSyntheticEra(previous: Scene, next: Scene) {
  return visibleRunState(next)?.syntheticActivatedDay != null && visibleRunState(previous)?.syntheticActivatedDay === null
}

function setNight(layers: GameState["layers"], night: boolean) {
  return layers.night === night ? layers : { ...layers, night }
}

function commitScene(state: GameState, scene: Scene): GameState {
  const layers = enteredSyntheticEra(state.scene, scene) ? setNight(state.layers, true) : state.layers
  return { ...state, scene, layers }
}

function reduceGame(state: GameState, event: GameEvent): GameState | typeof acceptWithoutChange {
  const { scene } = state
  switch (event.type) {
    case "set-page-visible":
      return typeof event.visible !== "boolean" || event.visible === state.environment.visible ? state
        : { ...state, environment: { ...state.environment, visible: event.visible } }
    case "set-page-suspended":
      return typeof event.suspended !== "boolean" || event.suspended === state.environment.suspended ? state
        : { ...state, environment: { ...state.environment, suspended: event.suspended } }
    case "set-developer-enabled":
      if (typeof event.enabled !== "boolean" || event.enabled === state.developer.enabled) return state
      return { ...state, developer: { enabled: event.enabled, open: false } }
    case "set-developer-open": {
      if (!state.developer.enabled || typeof event.open !== "boolean") return state
      const fromMenu = (scene.kind === "preview" || scene.kind === "campaign") && scene.panel === "menu"
      if (event.open && (scene.kind === "start" || scene.kind === "settings" || scene.kind === "setup" || scene.kind === "difficulty"
        || ((scene.kind === "preview" || scene.kind === "campaign") && scene.panel && !fromMenu))) return state
      if (state.developer.open === event.open && !(event.open && fromMenu)) return state
      return { ...state, developer: { enabled: true, open: event.open },
        scene: event.open && fromMenu ? sceneReducer(scene, { type: "back" }) : scene }
    }
    case "dev-step-day": {
      if (!state.developer.open || scene.kind !== "campaign" || scene.panel !== null) return state
      const next = advanceCampaignDay(scene, event.runId, event.completedDay)
      return next === scene ? state : commitScene(state, next)
    }
    case "dev-grant-token": {
      const campaign = scene.kind === "decision" ? scene.back : scene.kind === "campaign" && scene.panel === null ? scene : null
      if (!state.developer.open || !campaign || campaign.run.runId !== event.runId || campaign.run.completedDay !== event.completedDay) return state
      const run = grantDeveloperTokens(campaign.run, event.amount, event.seq)
      if (run === campaign.run) return state
      const next = { ...campaign, run }
      return { ...state, scene: scene.kind === "decision" ? { ...scene, back: next } : next }
    }
    case "play-sound":
      if (!isSoundCue(event.cue) || state.sound.muted || state.sound.volume === 0) return state
      return acceptWithoutChange
    case "set-locale":
      return isLocale(event.locale) && state.locale !== event.locale ? { ...state, locale: event.locale } : state
    case "set-sound-muted":
      if (typeof event.muted !== "boolean" || state.sound.muted === event.muted) return state
      return { ...state, sound: { ...state.sound, muted: event.muted } }
    case "set-sound-volume":
      if (!validVolume(event.volume) || state.sound.volume === event.volume) return state
      return { ...state, sound: { ...state.sound, volume: event.volume } }
    case "set-music-enabled":
      if (typeof event.enabled !== "boolean" || state.music.enabled === event.enabled) return state
      return { ...state, music: { ...state.music, enabled: event.enabled } }
    case "set-music-volume":
      if (!validVolume(event.volume) || state.music.volume === event.volume) return state
      return { ...state, music: { ...state.music, volume: event.volume } }
    case "set-music-track": {
      const trackId = resolveMusicTrackId(event.trackId)
      if (trackId === undefined || state.music.trackId === trackId) return state
      return { ...state, music: { ...state.music, trackId } }
    }
    case "set-shortcut": {
      const next = applyShortcutBinding(state.shortcuts, event.action, event.code)
      return next === state.shortcuts ? state : { ...state, shortcuts: next }
    }
    case "reset-shortcuts":
      return isDefaultShortcuts(state.shortcuts) ? state : { ...state, shortcuts: defaultShortcuts }
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
      if (event.type === "advance-day" && gamePlaybackSpeed(state) === 0) return state
      const next = sceneReducer(scene, event)
      if (next === scene) return state
      if (event.type === "start" && next.kind === "campaign") {
        return { ...state, scene: next, layers: setNight(state.layers, false), developer: { ...state.developer, open: false },
          populationPreview: null, selection: marketFocus(next.run.setup.startRegionId) }
      }
      if (event.type === "return-to-preview") return { ...state, scene: next, layers: setNight(state.layers, true),
        developer: { ...state.developer, open: false }, selection: previewSelection }
      if ((event.type === "open-start" || event.type === "open-settings" || event.type === "open-setup"
        || event.type === "open-difficulty") && state.developer.open) return { ...state, scene: next, developer: { ...state.developer, open: false } }
      return commitScene(state, next)
    }
  }
}

function gameNotices(event: GameEvent, { scene, layers }: GameState, previous: GameState): GameNotice[] {
  if (event.type === "start" && scene.kind === "campaign") {
    return [{ type: "run-started", setup: scene.run.setup, seed: scene.run.seed, runId: scene.run.runId }]
  }
  const stepped = event.type === "advance-day" || event.type === "dev-step-day"
  if (stepped) {
    const run = visibleRunState(scene)
    if (!run) return []
    const notices: GameNotice[] = projectsCompleting(run, run.completedDay)
      .map(project => ({ type: "research-completed", project }))
    if (!previous.layers.night && layers.night) notices.push({ type: "eternal-night-started" })
    for (const entry of run.events.filter(entry => entry.day === run.completedDay)) {
      notices.push({ type: "event-occurred", entry })
    }
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
  if (event.type === "buy-build-card" && (scene.kind === "campaign" || scene.kind === "ending")) {
    return [{ type: "build-card-bought", buildCards: scene.run.buildCards }]
  }
  if (event.type === "build-data-center" && (scene.kind === "campaign" || scene.kind === "ending")) {
    const centers = scene.run.countries[event.countryId]?.centers ?? 0
    return [{ type: "data-center-built", countryId: event.countryId, centers }]
  }
  if (event.type === "fund-conversion" && (scene.kind === "campaign" || scene.kind === "ending")) {
    return [{ type: "synthetic-funded", tokens: event.tokens, budgetPeople: scene.run.conversionBudgetPeople }]
  }
  if (event.type === "toggle-synthetic" && (scene.kind === "campaign" || scene.kind === "ending")) {
    const firstActivation = enteredSyntheticEra(previous.scene, scene)
    const notices: GameNotice[] = [{ type: "synthetic-toggled", regionId: event.regionId, enabled: event.enabled, firstActivation }]
    if (!previous.layers.night && layers.night) notices.push({ type: "eternal-night-started" })
    if (scene.kind === "ending") notices.push({ type: "run-ended", outcome: scene.outcome })
    return notices
  }
  if (event.type === "use-action" && (scene.kind === "campaign" || scene.kind === "ending")) {
    const notices: GameNotice[] = [{ type: "action-used", abilityId: event.abilityId, targetRegionId: event.targetRegionId }]
    if (scene.kind === "ending") notices.push({ type: "run-ended", outcome: scene.outcome })
    return notices
  }
  if (event.type === "collect-bubble" && scene.kind === "campaign") {
    const bubble = visibleRunState(previous.scene)?.bubbles.find(entry => entry.id === event.bubbleId)
    if (bubble) return [{ type: "bubble-collected", bubble }]
  }
  if (event.type === "dev-grant-token") {
    const command = visibleRunState(scene)?.commands.at(-1)
    if (command?.kind === "devGrantTokens") return [{ type: "dev-token-granted", command }]
  }
  if (event.type === "choose" && event.instanceId !== undefined && (scene.kind === "campaign" || scene.kind === "ending")) {
    const command = scene.run.commands.at(-1)
    if (command?.kind === "chooseEvent") {
      const notices: GameNotice[] = [{ type: "decision-resolved", command }]
      if (scene.kind === "ending") notices.push({ type: "run-ended", outcome: scene.outcome })
      return notices
    }
  }
  return []
}

function storeFromSnapshot(initial: GameState) {
  const store = createEventStore<GameState, GameEvent, GameNotice>(initial, reduceGame, gameNotices)
  return { ...store, dispatch(event: GameEvent) {
    // Runtime identity is external input; the reducer and rule engine stay pure.
    store.dispatch(event.type === "start" ? { ...event, runId: event.runId ?? crypto.randomUUID() } : event)
  } }
}

export function createGameStore(
  sound: SoundSettings = defaultSound,
  locale: Locale = defaultLocale,
  developerEnabled = false,
  music: MusicSettings = defaultMusic,
  shortcuts: ShortcutBindings = defaultShortcuts,
) {
  return storeFromSnapshot({
    scene: initialScene,
    layers: initialLayers,
    selection: previewSelection,
    populationPreview: null,
    sound,
    music,
    shortcuts: sanitizeShortcuts(shortcuts),
    locale,
    developer: { enabled: developerEnabled, open: false },
    environment: { visible: true, suspended: false },
  })
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
  return pauseReasons(state).length ? 0 : playbackSpeed(state.scene)
}

export function pauseReasons(state: GameState) {
  const reasons: string[] = []
  const { scene } = state
  const map = scene.kind === "decision" || scene.kind === "settings" ? scene.back : scene
  if ((map.kind === "preview" || map.kind === "campaign") && map.manualPaused) reasons.push("manual")
  if (map.kind === "preview" || map.kind === "campaign") {
    if (map.panel === "menu") reasons.push("menu")
    if (map.panel === "overview") reasons.push("research")
    if (map.panel === "actions") reasons.push("actions")
    if (map.panel === "confirm-exit") reasons.push("confirm-exit")
  }
  if (scene.kind === "start" || scene.kind === "settings" || scene.kind === "setup" || scene.kind === "difficulty"
    || scene.kind === "decision" || scene.kind === "ending") reasons.push(scene.kind)
  if (state.developer.open) reasons.push("developer")
  if (!state.environment.visible) reasons.push("hidden")
  if (state.environment.suspended) reasons.push("suspended")
  return reasons
}

export type GameStore = ReturnType<typeof createGameStore>
