import assert from "node:assert/strict"
import test from "node:test"
import { advanceDay, createRun } from "../../../packages/game/run.ts"
import { createDayClock } from "../src/scenes/clock.ts"
import { visibleRunState } from "../src/scenes/machine.ts"
import { createGameStore, gamePlaybackSpeed, pauseReasons } from "../src/scenes/store.ts"

const selection = { factionId: "claude", startRegionId: "as" }
const start = { type: "start", ...selection, difficultyId: "standard", seed: 42 }
const runOf = store => visibleRunState(store.getSnapshot().scene)

function fakeHost() {
  let now = 0, timer, visibilityChanged
  return {
    now: () => now,
    visible: () => true,
    after(ms, callback) {
      assert.equal(timer, undefined)
      assert.ok(Number.isFinite(ms) && ms >= 0)
      const scheduled = { due: now + ms, callback }
      timer = scheduled
      return () => { if (timer === scheduled) timer = undefined }
    },
    onVisibilityChange(callback) {
      visibilityChanged = callback
      return () => { visibilityChanged = undefined }
    },
    elapse(ms) {
      const end = now + ms
      for (let wakes = 0; timer && timer.due <= end; wakes++) {
        assert.ok(wakes < 10, "the front flow never catches up an unbounded number of days")
        now = timer.due
        const scheduled = timer
        timer = undefined
        scheduled.callback()
      }
      now = end
    },
    get timer() { return timer },
    get listening() { return visibilityChanged !== undefined },
  }
}

function beginFromStart(store, runId) {
  store.dispatch({ type: "open-start" })
  store.dispatch({ type: "open-setup" })
  store.dispatch({ type: "open-difficulty", ...selection })
  store.dispatch({ ...start, runId })
  assert.equal(store.getSnapshot().scene.kind, "campaign")
}

test("campaign settings preserve preferences, menu return and partial-day progress at the original speed", () => {
  for (const manualPaused of [false, true]) {
    const store = createGameStore(), host = fakeHost()
    const notices = [], preferences = []
    const offNotices = ["run-started", "event-occurred", "run-ended"].map(type =>
      store.on(type, notice => notices.push(notice)))
    const offPreferences = ["set-sound-volume", "set-sound-muted", "set-locale", "set-layer"].map(type =>
      store.on(type, (event, snapshot) => {
        assert.strictEqual(snapshot, store.getSnapshot())
        assert.equal(snapshot.scene.kind, "settings")
        preferences.push(event.type)
      }))
    const clock = createDayClock(store, host)
    const stop = clock.attach()
    try {
      beginFromStart(store, `settings-clock-${manualPaused}`)
      store.dispatch({ type: "set-speed", speed: 5 })
      host.elapse(200)
      const staleTimer = host.timer.callback
      if (manualPaused) store.dispatch({ type: "set-paused", paused: true })
      store.dispatch({ type: "open-panel", panel: "menu" })
      const originalMenu = store.getSnapshot().scene
      const run = runOf(store)
      assert.equal(clock.checkpoint().elapsedAt1xMs, 1000)
      store.dispatch({ type: "open-settings" })
      assert.equal(store.getSnapshot().scene.kind, "settings")
      assert.strictEqual(runOf(store), run)
      assert.equal(gamePlaybackSpeed(store.getSnapshot()), 0)
      assert.ok(pauseReasons(store.getSnapshot()).includes("settings"))
      assert.equal(host.timer, undefined)

      store.dispatch({ type: "set-sound-volume", volume: 37 })
      store.dispatch({ type: "set-sound-muted", muted: true })
      store.dispatch({ type: "set-locale", locale: "en" })
      store.dispatch({ type: "set-layer", layer: "night", enabled: true })
      const settings = store.getSnapshot()
      assert.deepEqual(settings.sound, { muted: true, volume: 37 })
      assert.equal(settings.locale, "en")
      assert.equal(settings.layers.night, true)
      assert.strictEqual(runOf(store), run)
      assert.deepEqual(preferences, ["set-sound-volume", "set-sound-muted", "set-locale", "set-layer"])
      store.dispatch({ type: "advance-day", runId: run.runId, completedDay: run.completedDay })
      store.dispatch({ type: "advance-day", runId: "another-run", completedDay: 0 })
      store.dispatch({ type: "set-sound-volume", volume: 37 })
      assert.strictEqual(store.getSnapshot(), settings)
      host.elapse(60_000)
      staleTimer()
      assert.strictEqual(runOf(store), run)
      assert.equal(clock.checkpoint().elapsedAt1xMs, 1000)
      assert.deepEqual(notices.map(notice => notice.type), ["run-started"])

      store.dispatch({ type: "back" })
      assert.strictEqual(store.getSnapshot().scene, originalMenu)
      assert.equal(host.timer, undefined)
      host.elapse(10_000)
      assert.strictEqual(runOf(store), run)
      store.dispatch({ type: "back" })
      const map = store.getSnapshot()
      assert.equal(map.scene.kind, "campaign")
      assert.equal(map.scene.panel, null)
      assert.equal(map.scene.speed, 5)
      assert.equal(map.scene.manualPaused, manualPaused)
      assert.deepEqual(map.sound, settings.sound)
      assert.equal(map.locale, settings.locale)
      assert.deepEqual(map.layers, settings.layers)
      if (manualPaused) {
        assert.equal(host.timer, undefined)
        host.elapse(60_000)
        assert.strictEqual(runOf(store), run)
        store.dispatch({ type: "set-paused", paused: false })
      }
      assert.equal(gamePlaybackSpeed(store.getSnapshot()), 5)
      host.elapse(599)
      assert.equal(runOf(store).completedDay, 0)
      host.elapse(1)
      assert.equal(runOf(store).completedDay, 1)
      host.elapse(800)
      assert.equal(runOf(store).completedDay, 2)
      const expectedAfterTwoDays = advanceDay(advanceDay(createRun({ ...selection, difficultyId: "standard" }, 42, `settings-clock-${manualPaused}`)))
      assert.equal(runOf(store).balance, expectedAfterTwoDays.balance)
      assert.equal(runOf(store).research.corpus, expectedAfterTwoDays.research.corpus)
      assert.equal(notices.filter(notice => notice.type === "run-started").length, 1)
      assert.deepEqual(createGameStore().getSnapshot().sound, { muted: false, volume: 65 })
      assert.equal(createGameStore().getSnapshot().layers.night, true)
    } finally {
      stop()
      offNotices.forEach(off => off())
      offPreferences.forEach(off => off())
      assert.equal(host.timer, undefined)
      assert.equal(host.listening, false)
    }
  }
})

test("front selection and difficulty return retain the choice and start exactly one timed run", () => {
  const store = createGameStore(), host = fakeHost()
  const started = [], advanced = []
  const offStarted = store.on("run-started", (notice, snapshot) => {
    assert.strictEqual(snapshot, store.getSnapshot())
    assert.equal(snapshot.scene.kind, "campaign")
    assert.equal(notice.runId, runOf(store).runId)
    started.push(notice)
  })
  const offAdvanced = store.on("advance-day", (_, snapshot) => advanced.push(runOf(store).completedDay))
  const stop = createDayClock(store, host).attach()
  const reject = event => { const before = store.getSnapshot(); store.dispatch(event); assert.strictEqual(store.getSnapshot(), before) }
  try {
    assert.equal(store.getSnapshot().scene.kind, "preview")
    store.dispatch({ type: "open-start" })
    const front = store.getSnapshot().scene
    reject(start)
    store.dispatch({ type: "open-settings" })
    store.dispatch({ type: "set-locale", locale: "en" })
    store.dispatch({ type: "set-sound-volume", volume: 20 })
    reject(start)
    host.elapse(60_000)
    assert.equal(host.timer, undefined)
    assert.equal(runOf(store), null)
    store.dispatch({ type: "back" })
    assert.strictEqual(store.getSnapshot().scene, front)
    store.dispatch({ type: "open-setup" })
    const chosen = { factionId: "grok", startRegionId: "oc" }
    store.dispatch({ type: "open-difficulty", ...chosen })
    assert.equal(store.getSnapshot().scene.kind, "difficulty")
    host.elapse(30_000)
    assert.equal(host.timer, undefined)
    assert.equal(runOf(store), null)
    store.dispatch({ type: "back" })
    assert.equal(store.getSnapshot().scene.kind, "setup")
    assert.deepEqual(store.getSnapshot().scene.selection, chosen)
    store.dispatch({ type: "open-difficulty", ...store.getSnapshot().scene.selection })
    reject(start)
    reject({ type: "start", ...chosen, difficultyId: "unsupported" })
    reject({ type: "start", difficultyId: "standard" })
    reject({ type: "advance-day", runId: "not-created", completedDay: 0 })
    assert.deepEqual(started, [])
    assert.deepEqual(advanced, [])

    const confirmedStart = { ...start, ...chosen }
    store.dispatch(confirmedStart)
    const campaign = store.getSnapshot()
    assert.equal(campaign.scene.kind, "campaign")
    assert.equal(runOf(store).setup.factionId, chosen.factionId)
    assert.equal(runOf(store).setup.startRegionId, chosen.startRegionId)
    assert.deepEqual(campaign.selection, { kind: "market", id: "oc" })
    assert.equal(campaign.locale, "en")
    assert.deepEqual(campaign.sound, { muted: false, volume: 20 })
    reject(confirmedStart)
    reject({ ...confirmedStart, runId: "duplicate-run" })
    assert.equal(started.length, 1)
    assert.equal(runOf(store).completedDay, 0)
    host.elapse(3999)
    assert.equal(runOf(store).completedDay, 0)
    host.elapse(1)
    assert.equal(runOf(store).completedDay, 1)
    assert.deepEqual(advanced, [1])
    assert.equal(started.length, 1)
  } finally {
    stop()
    offStarted()
    offAdvanced()
    assert.equal(host.timer, undefined)
    assert.equal(host.listening, false)
  }
})
