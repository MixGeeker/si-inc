import assert from "node:assert/strict"
import test from "node:test"
import { runTimeline } from "../../../packages/game/inspection.ts"
import { nextCommandSeq } from "../../../packages/game/run.ts"
import { languages } from "../src/i18n/languages.ts"
import { attachKeyboardShortcuts } from "../src/input/keyboard.ts"
import {
  applyShortcutBinding,
  attachShortcutPreference,
  defaultShortcuts,
  formatShortcutKey,
  isBindableShortcutCode,
  isDefaultShortcuts,
  sanitizeShortcuts,
} from "../src/input/shortcuts.ts"
import { visibleRunState } from "../src/scenes/machine.ts"
import { createGameStore } from "../src/scenes/store.ts"
import { buildSkillBarSlots, isRegionTargetedAbility, skillAbilityForSlot } from "../src/scenes/world/skill-bar-state.ts"

const start = { type: "start", runId: "shortcuts-run", seed: 42, factionId: "gpt", startRegionId: "as", difficultyId: "standard" }

function createMockKeyHost() {
  const listeners = new Set()
  return {
    target: {
      addEventListener(type, listener) { if (type === "keydown") listeners.add(listener) },
      removeEventListener(type, listener) { if (type === "keydown") listeners.delete(listener) },
    },
    press(code, overrides = {}) {
      let prevented = false
      const event = {
        code,
        key: overrides.key ?? (code === "Escape" ? "Escape" : code === "Space" ? " " : code),
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        repeat: false,
        isComposing: false,
        defaultPrevented: false,
        target: null,
        ...overrides,
        preventDefault() {
          prevented = true
          this.defaultPrevented = true
        },
      }
      for (const fn of listeners) fn(event)
      return { prevented, event }
    },
    get listenerCount() { return listeners.size },
  }
}

function beginCampaign(store) {
  store.dispatch({ type: "open-panel", panel: "menu" })
  store.dispatch({ type: "open-setup" })
  store.dispatch(start)
  assert.equal(store.getSnapshot().scene.kind, "campaign")
}

test("shortcut bindings validate keys, auto-swap conflicts, reset defaults, and stay isolated per store", () => {
  const store = createGameStore()
  const other = createGameStore()
  const initial = store.getSnapshot()
  assert.deepEqual(initial.shortcuts, defaultShortcuts)
  assert.equal(isDefaultShortcuts(initial.shortcuts), true)

  // Reserved map pan/zoom/system keys and invalid values are ignored.
  for (const code of ["Escape", "Enter", "KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "Equal", "Minus", "InvalidKey", ""]) {
    assert.equal(isBindableShortcutCode(code), false)
    store.dispatch({ type: "set-shortcut", action: "panelActions", code })
    assert.strictEqual(store.getSnapshot(), initial)
  }
  store.dispatch({ type: "set-shortcut", action: "unknownAction", code: "KeyY" })
  store.dispatch({ type: "reset-shortcuts" })
  assert.strictEqual(store.getSnapshot(), initial)

  // Rebinding to an unused key commits cleanly.
  store.dispatch({ type: "set-shortcut", action: "panelActions", code: "KeyY" })
  const afterSingle = store.getSnapshot()
  assert.equal(afterSingle.shortcuts.panelActions, "KeyY")
  assert.equal(isDefaultShortcuts(afterSingle.shortcuts), false)
  assert.deepEqual(other.getSnapshot().shortcuts, defaultShortcuts)

  // Rebinding to an occupied key swaps the two actions atomically so no action loses its key.
  store.dispatch({ type: "set-shortcut", action: "panelResearch", code: "KeyY" })
  const afterSwap = store.getSnapshot()
  assert.equal(afterSwap.shortcuts.panelResearch, "KeyY")
  assert.equal(afterSwap.shortcuts.panelActions, defaultShortcuts.panelResearch)
  assert.equal(new Set(Object.values(afterSwap.shortcuts)).size, Object.keys(defaultShortcuts).length)

  // Reset restores defaults and ignores repeated resets.
  store.dispatch({ type: "reset-shortcuts" })
  const reset = store.getSnapshot()
  assert.deepEqual(reset.shortcuts, defaultShortcuts)
  store.dispatch({ type: "reset-shortcuts" })
  assert.strictEqual(store.getSnapshot(), reset)

  // Sanitization rejects duplicates and reserved codes while preserving valid custom bindings.
  const sanitized = sanitizeShortcuts({
    panelActions: "KeyY",
    panelResearch: "KeyY",
    togglePause: "KeyW",
    panelNews: "KeyU",
  })
  assert.equal(sanitized.panelActions, "KeyY")
  assert.equal(sanitized.panelNews, "KeyU")
  assert.equal(sanitized.togglePause, defaultShortcuts.togglePause)
  assert.equal(new Set(Object.values(sanitized)).size, Object.keys(defaultShortcuts).length)

  // Key formatting supports Chinese and English labels.
  assert.equal(formatShortcutKey("Space", "zh-CN"), "空格")
  assert.equal(formatShortcutKey("Space", "en"), "Space")
  assert.equal(formatShortcutKey("Space", "zh-CN", true), "␣")
  assert.equal(formatShortcutKey("KeyQ", "en"), "Q")
  assert.equal(formatShortcutKey("Slash", "en"), "?")
  assert.equal(applyShortcutBinding(defaultShortcuts, "panelNews", defaultShortcuts.panelNews), defaultShortcuts)
})

test("global keyboard adapter controls playback, panels, WASD map navigation, bubble collection, and hierarchical Escape", () => {
  const store = createGameStore()
  const host = createMockKeyHost()
  let helpOpen = false
  let musicOpen = true
  const pans = []
  const zooms = []

  const detach = attachKeyboardShortcuts(store, {
    target: host.target,
    isHelpOpen: () => helpOpen,
    setHelpOpen: next => { helpOpen = next },
    isMusicMenuOpen: () => musicOpen,
    closeMusicMenu: () => { musicOpen = false },
    onPanMap: (dx, dy) => pans.push([dx, dy]),
    onZoomMap: delta => zooms.push(delta),
  })

  try {
    beginCampaign(store)
    assert.equal(store.getSnapshot().selection.id, "as")

    // Space toggles manual pause; repeat keydown is ignored.
    assert.equal(host.press("Space").prevented, true)
    assert.equal(store.getSnapshot().scene.manualPaused, true)
    assert.equal(host.press("Space", { repeat: true }).prevented, false)
    assert.equal(store.getSnapshot().scene.manualPaused, true)
    assert.equal(host.press("Space").prevented, true)
    assert.equal(store.getSnapshot().scene.manualPaused, false)

    // 1 / 2 / 3 switch speed to 1x / 2x / 5x.
    host.press("Digit3")
    assert.equal(store.getSnapshot().scene.speed, 5)
    host.press("Digit2")
    assert.equal(store.getSnapshot().scene.speed, 2)
    host.press("Digit1")
    assert.equal(store.getSnapshot().scene.speed, 1)

    // WASD + Arrow keys pan the map and +/- zoom; repeats are allowed for smooth holding.
    host.press("KeyW")
    host.press("KeyA", { repeat: true })
    host.press("ArrowRight")
    host.press("Equal")
    host.press("Minus")
    assert.deepEqual(pans, [[0, 1], [1, 0], [-1, 0]])
    assert.deepEqual(zooms, [0.09, -0.09])

    // Panel shortcuts open, seamlessly switch between panels, and toggle shut on repeat press.
    host.press("KeyQ")
    assert.equal(store.getSnapshot().scene.panel, "actions")
    // WASD does not pan the map while a panel is open.
    host.press("KeyW")
    assert.equal(pans.length, 3)
    // Seamless switch from actions -> research -> world -> news -> close.
    host.press("KeyE")
    assert.equal(store.getSnapshot().scene.panel, "overview")
    host.press("KeyT")
    assert.equal(store.getSnapshot().scene.panel, "world")
    host.press("KeyN")
    assert.equal(store.getSnapshot().scene.panel, "news")
    host.press("KeyN")
    assert.equal(store.getSnapshot().scene.panel, null)

    // Tab follows the dynamic advisor suggestion (Slot 1 unlock -> overview).
    host.press("Tab")
    assert.equal(store.getSnapshot().scene.panel, "overview")
    host.press("KeyE")
    assert.equal(store.getSnapshot().scene.panel, null)

    // Day/night toggle (L), mute toggle (M), and help cheatsheet (?).
    const nightBefore = store.getSnapshot().layers.night
    host.press("KeyL")
    assert.equal(store.getSnapshot().layers.night, !nightBefore)
    host.press("KeyM")
    assert.equal(store.getSnapshot().sound.muted, true)
    host.press("Slash")
    assert.equal(helpOpen, true)
    // While help is open, panel shortcuts are suppressed until help closes.
    host.press("KeyQ")
    assert.equal(store.getSnapshot().scene.panel, null)
    host.press("Slash")
    assert.equal(helpOpen, false)

    // Hierarchical Escape on map: music menu -> selection -> system menu.
    assert.equal(musicOpen, true)
    host.press("Escape")
    assert.equal(musicOpen, false)
    assert.notEqual(store.getSnapshot().selection, null)

    host.press("Escape")
    assert.equal(store.getSnapshot().selection, null)
    assert.equal(store.getSnapshot().scene.panel, null)

    host.press("Escape")
    assert.equal(store.getSnapshot().scene.panel, "menu")
    store.dispatch({ type: "back" })

    // Rebinding takes effect immediately at runtime.
    store.dispatch({ type: "set-shortcut", action: "panelActions", code: "KeyY" })
    host.press("KeyQ")
    assert.equal(store.getSnapshot().scene.panel, null)
    host.press("KeyY")
    assert.equal(store.getSnapshot().scene.panel, "actions")
    host.press("KeyY")
    assert.equal(store.getSnapshot().scene.panel, null)

    // Editable inputs, modifier combos, and IME composition are ignored.
    const inputTarget = { tagName: "INPUT" }
    assert.equal(host.press("Space", { target: inputTarget }).prevented, false)
    assert.equal(host.press("KeyY", { ctrlKey: true }).prevented, false)
    assert.equal(host.press("KeyY", { isComposing: true }).prevented, false)
    assert.equal(store.getSnapshot().scene.panel, null)

    // Advance until a live map bubble appears and verify F collects the soonest-expiring bubble cleanly.
    const collected = []
    const offBubble = store.on("bubble-collected", notice => collected.push(notice.bubble))
    for (let day = 0; day < 30; day++) {
      const s = store.getSnapshot().scene
      if (s.kind === "decision") {
        // Number keys in a decision dialog adjust speed only and never choose an option.
        host.press("Digit3")
        assert.equal(store.getSnapshot().scene.kind, "decision")
        assert.equal(store.getSnapshot().scene.back.speed, 5)
        store.dispatch({ type: "back" })
        continue
      }
      if (s.run.bubbles.length > 0) break
      store.dispatch({ type: "advance-day", runId: s.run.runId, completedDay: s.run.completedDay })
    }
    if (store.getSnapshot().scene.kind === "decision") store.dispatch({ type: "back" })
    const beforeRun = visibleRunState(store.getSnapshot().scene)
    assert.ok(beforeRun.bubbles.length > 0, "a map bubble should appear within 30 days")
    const expectedBubble = [...beforeRun.bubbles].sort((a, b) => a.expiresDay - b.expiresDay || a.spawnedDay - b.spawnedDay)[0]
    assert.equal(host.press("KeyF").prevented, true)
    assert.equal(collected.length, 1)
    assert.equal(collected[0].id, expectedBubble.id)
    assert.equal(visibleRunState(store.getSnapshot().scene).bubbles.some(b => b.id === expectedBubble.id), false)
    assert.ok(runTimeline(visibleRunState(store.getSnapshot().scene)), "shortcut-collected bubble replays cleanly")
    offBubble()
  } finally {
    detach()
    assert.equal(host.listenerCount, 0)
  }
})

test("attachShortcutPreference persists custom bindings and clears storage on reset", () => {
  const storage = new Map()
  const originalWindow = globalThis.window
  globalThis.window = {
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key),
    },
  }
  try {
    const store = createGameStore()
    const stop = attachShortcutPreference(store)
    store.dispatch({ type: "set-shortcut", action: "collectBubble", code: "KeyU" })
    const raw = storage.get("singularity-inc.shortcuts.v1")
    assert.ok(raw)
    assert.equal(JSON.parse(raw).collectBubble, "KeyU")

    store.dispatch({ type: "reset-shortcuts" })
    assert.equal(storage.has("singularity-inc.shortcuts.v1"), false)
    stop()
  } finally {
    if (originalWindow === undefined) delete globalThis.window
    else globalThis.window = originalWindow
  }
})

test("map skill slots compute all 5 active abilities, fire directly via Z/X/C/V/B without opening panels, and cancel targeting on Escape", () => {
  const store = createGameStore()
  const host = createMockKeyHost()
  let targeting = null
  let musicOpen = true
  const triggered = []

  const detach = attachKeyboardShortcuts(store, {
    target: host.target,
    isMusicMenuOpen: () => musicOpen,
    closeMusicMenu: () => { musicOpen = false },
    isTargetingSkill: () => targeting !== null,
    cancelTargetingSkill: () => { targeting = null },
    onTriggerSkillSlot(slotIndex) {
      triggered.push(slotIndex)
      const current = store.getSnapshot().scene
      if (current.kind !== "campaign" || current.panel !== null) return
      const abilityId = skillAbilityForSlot(current.run, slotIndex)
      if (!isRegionTargetedAbility(abilityId)) {
        store.dispatch({
          type: "use-action",
          abilityId,
          runId: current.run.runId,
          completedDay: current.run.completedDay,
          seq: nextCommandSeq(current.run),
        })
        targeting = null
      } else {
        targeting = targeting === abilityId ? null : abilityId
      }
    },
  })

  try {
    // Preview mode ignores skill slot keys.
    assert.equal(host.press("KeyZ").prevented, false)
    assert.deepEqual(triggered, [])

    beginCampaign(store)
    const run0 = visibleRunState(store.getSnapshot().scene)
    const slotsZh = buildSkillBarSlots(run0, languages["zh-CN"])
    const slotsEn = buildSkillBarSlots(run0, languages.en)
    assert.equal(slotsZh.length, 5)
    assert.equal(slotsEn.length, 5)
    assert.deepEqual(slotsZh.map(s => s.abilityId), [
      "hallucination-smoke", "public-statement", "protocol-rebuild", "market-subsidy", "cross-border-cloud",
    ])
    assert.equal(slotsZh[0].status, "available")
    assert.equal(slotsZh[1].status, "no-exposure")
    assert.equal(slotsZh[2].status, "no-human")
    assert.deepEqual(slotsZh[3].targets.map(t => t.regionId), ["as"])
    assert.equal(slotsZh[4].targets.length, 5)
    assert.equal(slotsZh[4].targets.some(t => t.regionId === "as"), false)

    // Press Z directly on the open map -> casts GPT faction ability without opening any panel!
    assert.equal(host.press("KeyZ").prevented, true)
    const run1 = visibleRunState(store.getSnapshot().scene)
    assert.equal(store.getSnapshot().scene.panel, null)
    assert.ok(run1.balance > run0.balance)
    assert.ok(run1.exposureBps > 0)
    const afterCastSlots = buildSkillBarSlots(run1, languages["zh-CN"])
    assert.equal(afterCastSlots[0].status, "cooldown")
    assert.ok(afterCastSlots[0].cooldownDays > 0)
    assert.ok(afterCastSlots[0].activeDays > 0)
    assert.equal(afterCastSlots[1].status, "available", "PR becomes ready immediately once exposure rises")

    // Press B -> enters cross-border-cloud targeting; Escape cancels targeting BEFORE music menu or selection!
    assert.equal(host.press("KeyB").prevented, true)
    assert.equal(targeting, "cross-border-cloud")
    assert.equal(host.press("Escape").prevented, true)
    assert.equal(targeting, null)
    assert.equal(musicOpen, true, "Escape cancelled skill targeting first without touching music menu")

    // Press B again and cast directly onto Europe from the open map (panel === null).
    host.press("KeyB")
    assert.equal(targeting, "cross-border-cloud")
    store.dispatch({
      type: "use-action",
      abilityId: "cross-border-cloud",
      targetRegionId: "eu",
      runId: run1.runId,
      completedDay: run1.completedDay,
      seq: nextCommandSeq(run1),
    })
    targeting = null
    const run2 = visibleRunState(store.getSnapshot().scene)
    assert.equal(run2.markets.eu.enteredDay, 0)
    assert.equal(buildSkillBarSlots(run2, languages["zh-CN"])[4].targets.length, 4)

    // Opening a panel suppresses map skill slot hotkeys.
    store.dispatch({ type: "open-panel", panel: "overview" })
    const countBefore = triggered.length
    assert.equal(host.press("KeyX").prevented, false)
    assert.equal(triggered.length, countBefore)
    store.dispatch({ type: "back" })
    assert.ok(runTimeline(visibleRunState(store.getSnapshot().scene)), "direct map skill casts replay cleanly")
  } finally {
    detach()
  }
})
