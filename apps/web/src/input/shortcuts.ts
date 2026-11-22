import type { Locale } from "../../../../packages/rules/locales.ts"
import type { GameStore } from "../scenes/store.ts"

export const shortcutOrder = [
  "togglePause",
  "speed1",
  "speed2",
  "speed5",
  "panelActions",
  "panelResearch",
  "panelRegion",
  "panelWorld",
  "panelNews",
  "collectBubble",
  "followAdvisor",
  "globalView",
  "toggleNight",
  "toggleMute",
  "toggleHelp",
] as const

export type ShortcutAction = typeof shortcutOrder[number]
export type ShortcutGroup = "time" | "panels" | "map"
export type ShortcutBindings = Readonly<Record<ShortcutAction, string>>

export const shortcutGroups: readonly { readonly id: ShortcutGroup; readonly actions: readonly ShortcutAction[] }[] = Object.freeze([
  { id: "time", actions: ["togglePause", "speed1", "speed2", "speed5"] },
  { id: "panels", actions: ["panelActions", "panelResearch", "panelRegion", "panelWorld", "panelNews"] },
  { id: "map", actions: ["collectBubble", "followAdvisor", "globalView", "toggleNight", "toggleMute", "toggleHelp"] },
])

/** Default bindings leave W/A/S/D and Arrow keys free for map panning, and Esc for back/menu. */
export const defaultShortcuts: ShortcutBindings = Object.freeze({
  togglePause: "Space",
  speed1: "Digit1",
  speed2: "Digit2",
  speed5: "Digit3",
  panelActions: "KeyQ",
  panelResearch: "KeyE",
  panelRegion: "KeyR",
  panelWorld: "KeyT",
  panelNews: "KeyN",
  collectBubble: "KeyF",
  followAdvisor: "Tab",
  globalView: "KeyG",
  toggleNight: "KeyL",
  toggleMute: "KeyM",
  toggleHelp: "Slash",
})

/** Keys reserved for map camera movement, zoom, dialog confirmation, and hierarchical back/menu. */
export const reservedShortcutCodes: ReadonlySet<string> = new Set([
  "Escape",
  "Enter",
  "NumpadEnter",
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Equal",
  "Minus",
  "NumpadAdd",
  "NumpadSubtract",
])

const extraBindableCodes = new Set([
  "Space",
  "Tab",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "Backquote",
  "BracketLeft",
  "BracketRight",
  "Backslash",
  "Semicolon",
  "Quote",
  "Comma",
  "Period",
  "Slash",
])

const storageKey = "singularity-inc.shortcuts.v1"

export function isShortcutAction(value: unknown): value is ShortcutAction {
  return typeof value === "string" && (shortcutOrder as readonly string[]).includes(value)
}

export function isBindableShortcutCode(code: unknown): code is string {
  if (typeof code !== "string" || reservedShortcutCodes.has(code)) return false
  if (/^Key[A-Z]$/.test(code)) return true
  if (/^Digit[0-9]$/.test(code)) return true
  if (/^Numpad[0-9]$/.test(code)) return true
  if (/^F([1-9]|1[0-2])$/.test(code)) return true
  return extraBindableCodes.has(code)
}

export function isDefaultShortcuts(bindings: ShortcutBindings): boolean {
  return shortcutOrder.every(action => bindings[action] === defaultShortcuts[action])
}

export function findShortcutConflict(
  bindings: ShortcutBindings,
  action: ShortcutAction,
  code: string,
): ShortcutAction | null {
  for (const other of shortcutOrder) {
    if (other !== action && bindings[other] === code) return other
  }
  return null
}

/** Update a single binding, automatically swapping if another action currently owns the target key. */
export function applyShortcutBinding(
  bindings: ShortcutBindings,
  action: ShortcutAction,
  code: string,
): ShortcutBindings {
  if (!isShortcutAction(action) || !isBindableShortcutCode(code)) return bindings
  const current = bindings[action]
  if (current === code) return bindings
  const next: Record<ShortcutAction, string> = { ...bindings, [action]: code }
  const conflict = findShortcutConflict(bindings, action, code)
  if (conflict) next[conflict] = current
  return Object.freeze(next)
}

export function sanitizeShortcuts(raw: unknown): ShortcutBindings {
  if (!raw || typeof raw !== "object") return defaultShortcuts
  const input = raw as Record<string, unknown>
  const result: Record<ShortcutAction, string> = { ...defaultShortcuts }
  const used = new Set<string>()
  for (const action of shortcutOrder) {
    const candidate = input[action]
    if (isBindableShortcutCode(candidate) && !used.has(candidate)) {
      result[action] = candidate
      used.add(candidate)
    }
  }
  // Ensure any action that fell back to its default doesn't collide with an earlier custom key.
  for (const action of shortcutOrder) {
    if (used.has(result[action]) && input[action] !== result[action]) {
      const fallback = shortcutOrder
        .map(item => defaultShortcuts[item])
        .find(code => !used.has(code))
      if (fallback) result[action] = fallback
    }
    used.add(result[action])
  }
  return isDefaultShortcuts(result) ? defaultShortcuts : Object.freeze(result)
}

export function readShortcutSettings(): ShortcutBindings {
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (raw === null) return defaultShortcuts
    return sanitizeShortcuts(JSON.parse(raw))
  } catch {
    return defaultShortcuts
  }
}

export function saveShortcutSettings(bindings: ShortcutBindings) {
  try {
    if (isDefaultShortcuts(bindings)) window.localStorage.removeItem(storageKey)
    else window.localStorage.setItem(storageKey, JSON.stringify(bindings))
  } catch {
    /* Storage may be unavailable; the current session still keeps the committed bindings. */
  }
}

export function attachShortcutPreference(store: GameStore) {
  const persist = (_: unknown, snapshot: ReturnType<GameStore["getSnapshot"]>) => saveShortcutSettings(snapshot.shortcuts)
  const offSet = store.on("set-shortcut", persist)
  const offReset = store.on("reset-shortcuts", persist)
  return () => {
    offSet()
    offReset()
  }
}

const symbolLabels: Record<string, string> = {
  Backquote: "`",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "?",
  Home: "Home",
  End: "End",
  PageUp: "PgUp",
  PageDown: "PgDn",
  Tab: "Tab",
  Escape: "Esc",
}

/** Human-friendly keycap text for HUD badges, settings rows, and the cheatsheet. */
export function formatShortcutKey(code: string, locale: Locale = "zh-CN", compact = false): string {
  if (code === "Space") return compact ? "␣" : locale === "zh-CN" ? "空格" : "Space"
  if (code.startsWith("Key") && code.length === 4) return code.slice(3)
  if (code.startsWith("Digit") && code.length === 6) return code.slice(5)
  if (code.startsWith("Numpad") && code.length === 7) return `Num${code.slice(6)}`
  if (/^F([1-9]|1[0-2])$/.test(code)) return code
  return symbolLabels[code] ?? code
}
