import assert from "node:assert/strict"
import test from "node:test"
import { soundBank } from "../src/audio/cues.ts"
import { attachGameSound } from "../src/audio/game-sound.ts"
import { createSoundOutput } from "../src/audio/player.ts"
import { createGameStore } from "../src/scenes/store.ts"

const start = { type: "start", factionId: "claude", startRegionId: "sea", difficultyId: "standard", seed: 42 }
const playTest = { type: "play-sound", cue: "test" }
const open = panel => ({ type: "open-panel", panel })
function startRun(store) {
  store.dispatch(open("menu"))
  store.dispatch({ type: "open-setup" })
  store.dispatch(start)
}
function record(store) {
  const cues = [], saved = []
  const stop = attachGameSound(store, {
    play: cue => cues.push(cue), syncSettings() {}, dispose() {},
  }, settings => saved.push(settings))
  return { cues, saved, stop }
}

test("sound preferences survive runs; invalid and repeated input is silent and never persisted", () => {
  const store = createGameStore()
  const { cues, saved, stop } = record(store)
  const initial = store.getSnapshot()
  for (const volume of [-1, 101, 1.5, NaN, Infinity, "50", null, initial.sound.volume]) {
    store.dispatch({ type: "set-sound-volume", volume })
  }
  store.dispatch({ type: "set-sound-muted", muted: 1 })
  store.dispatch({ type: "set-sound-muted", muted: initial.sound.muted })
  assert.strictEqual(store.getSnapshot(), initial)
  assert.deepEqual(saved, [])
  assert.deepEqual(cues, [])

  store.dispatch({ type: "set-sound-volume", volume: 0 })
  store.dispatch({ type: "set-sound-muted", muted: true })
  store.dispatch({ type: "set-sound-volume", volume: 37 })
  assert.deepEqual(cues, [])
  startRun(store)
  const run = store.getSnapshot().scene.run
  store.dispatch({ type: "set-sound-muted", muted: false })
  assert.deepEqual(store.getSnapshot().sound, { muted: false, volume: 37 })
  assert.strictEqual(store.getSnapshot().scene.run, run)
  assert.deepEqual(saved.at(-1), store.getSnapshot().sound)
  assert.equal(saved.length, 4)
  assert.deepEqual(cues, [])
  assert.deepEqual(createGameStore().getSnapshot().sound, initial.sound)
  stop()
  store.dispatch({ type: "set-sound-volume", volume: 100 })
  store.dispatch(playTest)
  assert.deepEqual(cues, [])
  assert.equal(saved.length, 4)
})

test("each accepted play-sound reaches only its store and preserves the committed snapshot", () => {
  const store = createGameStore()
  const { cues, saved, stop } = record(store)
  const other = record(createGameStore())
  const initial = store.getSnapshot()
  let commits = 0
  store.subscribe(() => commits++)
  for (const cue of ["missing", "toString", null, undefined, ["test"]]) {
    store.dispatch({ type: "play-sound", cue })
  }
  assert.deepEqual(cues, [])
  store.dispatch(playTest)
  store.dispatch(playTest)
  assert.deepEqual(cues, ["test", "test"])
  assert.deepEqual(other.cues, [])
  assert.deepEqual(saved, [])
  assert.strictEqual(store.getSnapshot(), initial)
  assert.equal(commits, 0)
  store.dispatch({ type: "set-sound-muted", muted: true })
  store.dispatch(playTest)
  store.dispatch({ type: "set-sound-volume", volume: 0 })
  store.dispatch({ type: "set-sound-muted", muted: false })
  store.dispatch(playTest)
  assert.deepEqual(cues, ["test", "test"])
  stop()
  other.stop()
})

test("a scripted event queues one test sound after its commit, including when the week is retried", () => {
  const store = createGameStore()
  const { cues, stop } = record(store)
  startRun(store)
  const firstEventWeek = store.getSnapshot().scene.run.schedule.nextWeek
  const order = []
  let eventSnapshot
  store.on("event-occurred", (_, snapshot) => { order.push("event"); eventSnapshot = snapshot })
  store.on("play-sound", (_, snapshot) => {
    order.push("sound")
    assert.strictEqual(snapshot, eventSnapshot)
  })
  for (let week = 0; week < firstEventWeek; week++) {
    const tick = { type: "advance-week", seed: start.seed, completedWeek: week }
    store.dispatch(tick)
    store.dispatch(tick)
  }
  assert.deepEqual(cues, ["test"])
  assert.deepEqual(order, ["event", "sound"])
  stop()
})

test("the only exported sound is an audible test ping with silent edges", () => {
  assert.deepEqual(Object.keys(soundBank), ["test"])
  const samples = soundBank.test()
  assert.equal(samples[0], 0)
  assert.equal(samples.at(-1), 0)
  const peak = samples.reduce((max, sample) => Math.max(max, Math.abs(sample)), 0)
  assert.ok(peak > .06 && peak < 1)
})

test("a delayed device drops hidden or muted requests and releases the active sound on detach", () => {
  const listeners = new Map()
  const page = {
    hidden: false,
    addEventListener(type, callback) { listeners.set(type, callback) },
    removeEventListener(type, callback) { if (listeners.get(type) === callback) listeners.delete(type) },
  }
  const sources = []
  let opened = 0
  const node = { connect: dest => dest, disconnect() {} }
  const device = Object.assign(new EventTarget(), {
    state: "suspended", currentTime: 1, destination: {},
    resume: async () => {}, close: async () => { device.state = "closed" },
    createGain: () => ({ ...node, gain: { setTargetAtTime() {} } }),
    createBuffer: () => ({ copyToChannel() {} }),
    createBufferSource() {
      const source = { ...node, stopped: false, start() { sources.push(this) }, stop() { this.stopped = true } }
      return source
    },
  })
  const settings = { muted: true, volume: 65 }
  const output = createSoundOutput(() => settings, page, () => { opened++; return device })
  listeners.get("click")({ type: "click", isTrusted: false })
  output.play("test")
  listeners.get("keydown")({ type: "keydown", isTrusted: true })
  assert.equal(opened, 0)
  settings.muted = false
  output.syncSettings()
  assert.equal(opened, 1)
  output.play("test") // waiting for the device
  page.hidden = true
  listeners.get("visibilitychange")()
  device.state = "running"
  device.dispatchEvent(new Event("statechange"))
  output.play("test")
  page.hidden = false
  listeners.get("visibilitychange")()
  assert.equal(sources.length, 0)

  output.play("test")
  output.play("test")
  assert.equal(sources.length, 2)
  assert.deepEqual(sources.map(s => s.stopped), [true, false])
  settings.muted = true
  output.syncSettings()
  output.play("test")
  assert.equal(sources.length, 2)
  assert.ok(sources.every(s => s.stopped))
  settings.muted = false
  output.syncSettings()
  output.play("test")
  output.dispose()
  assert.equal(sources.at(-1).stopped, true)
  assert.equal(device.state, "closed")
  assert.equal(listeners.size, 0)
})
