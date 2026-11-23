import { nextCommandSeq, type RunState } from "../../../../packages/game/run.ts"
import type { MapBubble } from "../../../../packages/game/operations.ts"
import type { MapPanel } from "../scenes/machine.ts"
import type { GameStore } from "../scenes/store.ts"
import { advisorTargetPanel } from "../scenes/world/hudContent.ts"
import { shortcutOrder, type ShortcutAction, type ShortcutBindings } from "./shortcuts.ts"

export interface KeyboardEventLike {
  readonly code: string
  readonly key: string
  readonly ctrlKey?: boolean
  readonly metaKey?: boolean
  readonly altKey?: boolean
  readonly shiftKey?: boolean
  readonly repeat?: boolean
  readonly isComposing?: boolean
  readonly keyCode?: number
  readonly defaultPrevented?: boolean
  readonly target?: EventTarget | null
  preventDefault(): void
}

export interface KeyboardShortcutOptions {
  /** Event target to listen on; defaults to `window`. */
  readonly target?: {
    addEventListener(type: "keydown", listener: (event: KeyboardEventLike) => void): void
    removeEventListener(type: "keydown", listener: (event: KeyboardEventLike) => void): void
  }
  readonly isHelpOpen?: () => boolean
  readonly setHelpOpen?: (open: boolean) => void
  readonly isMusicMenuOpen?: () => boolean
  readonly closeMusicMenu?: () => void
  readonly isTargetingSkill?: () => boolean
  readonly cancelTargetingSkill?: () => void
  readonly onTriggerSkillSlot?: (slotIndex: 0 | 1 | 2 | 3 | 4) => void
  readonly onPanMap?: (dx: number, dy: number) => void
  readonly onZoomMap?: (delta: number) => void
}

const panKeyVectors: Readonly<Record<string, readonly [number, number]>> = {
  KeyW: [0, 1],
  ArrowUp: [0, 1],
  KeyS: [0, -1],
  ArrowDown: [0, -1],
  KeyA: [1, 0],
  ArrowLeft: [1, 0],
  KeyD: [-1, 0],
  ArrowRight: [-1, 0],
}

const zoomKeyDeltas: Readonly<Record<string, number>> = {
  Equal: 0.09,
  NumpadAdd: 0.09,
  Minus: -0.09,
  NumpadSubtract: -0.09,
}

function isEditableTarget(target: EventTarget | null | undefined): boolean {
  if (!target || typeof target !== "object") return false
  const element = target as { tagName?: string; isContentEditable?: boolean; closest?: (selector: string) => unknown }
  const tag = element.tagName?.toUpperCase()
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true
  if (element.isContentEditable) return true
  return false
}

function isInteractiveControl(target: EventTarget | null | undefined): boolean {
  if (!target || typeof target !== "object") return false
  const element = target as { tagName?: string; getAttribute?: (name: string) => string | null; closest?: (selector: string) => unknown }
  const tag = element.tagName?.toUpperCase()
  if (tag === "BUTTON" || tag === "A" || tag === "SUMMARY") return true
  if (element.getAttribute?.("role") === "button") return true
  return Boolean(element.closest?.("button, a[href], summary, [role='button']"))
}

function matchShortcutAction(shortcuts: ShortcutBindings, code: string): ShortcutAction | null {
  for (const action of shortcutOrder) {
    if (shortcuts[action] === code) return action
  }
  return null
}

/** Pick the bubble closest to expiring so pressing F rescues the most urgent map popup first. */
export function nextBubbleToCollect(run: RunState): MapBubble | null {
  if (!run.bubbles.length) return null
  return [...run.bubbles].sort((a, b) => a.expiresDay - b.expiresDay || a.spawnedDay - b.spawnedDay || a.id.localeCompare(b.id))[0] ?? null
}

function togglePanel(store: GameStore, targetPanel: MapPanel) {
  const { scene } = store.getSnapshot()
  if (scene.kind !== "campaign" && scene.kind !== "preview") return false
  if (targetPanel === "actions" || targetPanel === "overview") {
    if (scene.kind !== "campaign") return false
  }
  if (scene.panel === "confirm-exit") return false
  if (scene.panel === targetPanel) {
    store.dispatch({ type: "back" })
    return true
  }
  if (scene.panel !== null) {
    store.dispatch({ type: "back" })
  }
  store.dispatch(targetPanel === "news"
    ? { type: "open-panel", panel: "news", newsView: "archive" }
    : { type: "open-panel", panel: targetPanel })
  return true
}

/**
 * Translate keyboard input into typed `GameEvent`s and map camera controls.
 * Respects text inputs, browser modifier shortcuts, IME composition, and modal dialogs.
 */
export function attachKeyboardShortcuts(store: GameStore, options: KeyboardShortcutOptions = {}) {
  const host = options.target ?? (typeof window !== "undefined"
    ? window as unknown as NonNullable<KeyboardShortcutOptions["target"]>
    : undefined)
  if (!host) return () => {}

  function onKeyDown(event: KeyboardEventLike) {
    if (event.defaultPrevented) return
    if (event.isComposing || event.keyCode === 229) return
    if (event.ctrlKey || event.metaKey || event.altKey) return

    const state = store.getSnapshot()
    const { scene, shortcuts } = state
    const helpOpen = options.isHelpOpen?.() ?? false
    const onMap = (scene.kind === "campaign" || scene.kind === "preview") && scene.panel === null
    const mapInteractive = onMap && !state.developer.open && !helpOpen

    // Hierarchical Escape on the open map: skill targeting -> music menu -> developer -> preview -> selection -> menu.
    // Open <dialog> modals and docked news layers handle their own Escape to avoid double-back.
    if (event.code === "Escape" || event.key === "Escape") {
      if (event.repeat || !onMap || helpOpen) return
      if (options.isTargetingSkill?.()) {
        event.preventDefault()
        options.cancelTargetingSkill?.()
        return
      }
      if (options.isMusicMenuOpen?.()) {
        event.preventDefault()
        options.closeMusicMenu?.()
        return
      }
      if (state.developer.open) {
        event.preventDefault()
        store.dispatch({ type: "set-developer-open", open: false })
        return
      }
      if (scene.kind === "preview" && state.populationPreview !== null) {
        event.preventDefault()
        store.dispatch({ type: "close-population-preview" })
        return
      }
      if (state.selection !== null) {
        event.preventDefault()
        if (scene.kind === "campaign") store.dispatch({ type: "focus-place", place: null })
        else store.dispatch({ type: "map-preset", view: "global" })
        return
      }
      event.preventDefault()
      store.dispatch({ type: "open-panel", panel: "menu" })
      return
    }

    if (isEditableTarget(event.target)) return

    // Fixed map navigation keys (WASD / Arrow pan, +/- zoom, Home for global view).
    if (mapInteractive) {
      const pan = panKeyVectors[event.code]
      if (pan && options.onPanMap) {
        event.preventDefault()
        options.onPanMap(pan[0], pan[1])
        return
      }
      const zoomDelta = zoomKeyDeltas[event.code]
      if (zoomDelta !== undefined && options.onZoomMap) {
        event.preventDefault()
        options.onZoomMap(zoomDelta)
        return
      }
      if (event.code === "Home" && !event.repeat) {
        event.preventDefault()
        store.dispatch({ type: "map-preset", view: "global" })
        return
      }
    }

    const action = matchShortcutAction(shortcuts, event.code)
    if (!action || event.repeat) return

    if (action === "toggleHelp") {
      if (scene.kind === "settings") return
      if (options.setHelpOpen) {
        event.preventDefault()
        options.setHelpOpen(!helpOpen)
      }
      return
    }

    if (helpOpen) return

    if (action === "toggleMute") {
      event.preventDefault()
      store.dispatch({ type: "set-sound-muted", muted: !state.sound.muted })
      return
    }

    if (action === "togglePause") {
      const playbackScene = scene.kind === "campaign" || scene.kind === "preview" ? scene : null
      if (!playbackScene || state.developer.open) return
      // Inside open dialogs, keep Space available for focused buttons/links/disclosures.
      if (playbackScene.panel !== null && isInteractiveControl(event.target)) return
      event.preventDefault()
      store.dispatch({ type: "set-paused", paused: !playbackScene.manualPaused })
      return
    }

    if (action === "speed1" || action === "speed2" || action === "speed5") {
      // Never auto-select decision choices with number keys; speed keys only adjust campaign playback speed.
      if (scene.kind !== "campaign" && scene.kind !== "preview" && scene.kind !== "decision") return
      if (state.developer.open) return
      const speed = action === "speed1" ? 1 : action === "speed2" ? 2 : 5
      event.preventDefault()
      store.dispatch({ type: "set-speed", speed })
      return
    }

    if (state.developer.open) return

    if (action === "panelActions" || action === "panelResearch" || action === "panelRegion" || action === "panelWorld" || action === "panelNews") {
      const panelMap: Record<"panelActions" | "panelResearch" | "panelRegion" | "panelWorld" | "panelNews", MapPanel> = {
        panelActions: "actions",
        panelResearch: "overview",
        panelRegion: "region",
        panelWorld: "world",
        panelNews: "news",
      }
      if (togglePanel(store, panelMap[action])) event.preventDefault()
      return
    }

    if (action === "toggleNight") {
      if (scene.kind !== "campaign" && scene.kind !== "preview") return
      event.preventDefault()
      store.dispatch({ type: "set-layer", layer: "night", enabled: !state.layers.night })
      return
    }

    if (!mapInteractive) return

    if (action === "globalView") {
      event.preventDefault()
      store.dispatch({ type: "map-preset", view: "global" })
      return
    }

    if (action === "collectBubble") {
      if (scene.kind !== "campaign") return
      const bubble = nextBubbleToCollect(scene.run)
      if (!bubble) return
      event.preventDefault()
      store.dispatch({
        type: "collect-bubble",
        bubbleId: bubble.id,
        runId: scene.run.runId,
        completedDay: scene.run.completedDay,
        seq: nextCommandSeq(scene.run),
      })
      return
    }

    if (action === "followAdvisor") {
      if (scene.kind !== "campaign") return
      const targetPanel = advisorTargetPanel(scene.run)
      event.preventDefault()
      store.dispatch({ type: "open-panel", panel: targetPanel })
      return
    }

    if (action === "skillSlot1" || action === "skillSlot2" || action === "skillSlot3" || action === "skillSlot4" || action === "skillSlot5") {
      if (scene.kind !== "campaign" || !options.onTriggerSkillSlot) return
      const slotIndex = (Number(action.slice(-1)) - 1) as 0 | 1 | 2 | 3 | 4
      event.preventDefault()
      options.onTriggerSkillSlot(slotIndex)
    }
  }

  host.addEventListener("keydown", onKeyDown)
  return () => host.removeEventListener("keydown", onKeyDown)
}
