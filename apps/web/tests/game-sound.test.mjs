import assert from "node:assert/strict"
import test from "node:test"
import { nextCommandSeq } from "../../../packages/game/run.ts"
import { researchNode } from "../../../packages/rules/v0.1/evolution/trees.ts"
import { standardScenario } from "../../../packages/rules/v0.1/scenario.ts"
import { audioCueFiles, isSoundCue, soundBank } from "../src/audio/cues.ts"
import { attachGameSound } from "../src/audio/game-sound.ts"
import { createSoundOutput } from "../src/audio/player.ts"
import { defaultResearchSkill } from "../src/scenes/machine.ts"
import { createGameStore } from "../src/scenes/store.ts"

const start = { type: "start", factionId: "claude", startRegionId: "as", difficultyId: "standard", seed: 42 }
const playTest = { type: "play-sound", cue: "test" }
const open = panel => ({ type: "open-panel", panel })
function startRun(store) {
  store.dispatch(open("menu"))
  store.dispatch({ type: "open-setup" })
  store.dispatch(start)
  assert.equal(store.getSnapshot().scene.kind, "campaign")
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
    assert.equal(isSoundCue(cue), false)
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

test("a scripted event queues one news cue after its commit, including when the day is retried", () => {
  const store = createGameStore()
  const { cues, stop } = record(store)
  startRun(store)
  const run = store.getSnapshot().scene.run
  const firstEventDay = run.schedule.nextDay
  const order = []
  let eventSnapshot
  store.on("event-occurred", (_, snapshot) => { order.push("event"); eventSnapshot = snapshot })
  store.on("play-sound", (_, snapshot) => {
    order.push("sound")
    assert.strictEqual(snapshot, eventSnapshot)
  })
  for (let day = 0; day < firstEventDay; day++) {
    const tick = { type: "advance-day", runId: run.runId, completedDay: day }
    store.dispatch(tick)
    store.dispatch(tick)
  }
  assert.deepEqual(cues, ["news_breaking"])
  assert.deepEqual(order, ["event", "sound"])
  stop()
})

test("gameplay notices and eternal night transitions dispatch their mapped SFX cues", () => {
  const store = createGameStore()
  const { cues, stop } = record(store)
  // Preview night layer toggles should not trigger the campaign transition stinger.
  store.dispatch({ type: "set-layer", layer: "night", enabled: false })
  store.dispatch({ type: "set-layer", layer: "night", enabled: true })
  assert.deepEqual(cues, [])

  startRun(store)
  store.dispatch({ type: "set-layer", layer: "night", enabled: false })
  let run = store.getSnapshot().scene.run
  store.dispatch({ type: "open-panel", panel: "overview" })
  store.dispatch({ type: "unlock-research-slot", slot: 1, runId: run.runId, completedDay: run.completedDay, seq: nextCommandSeq(run) })
  run = store.getSnapshot().scene.run
  store.dispatch({ type: "start-research", skillId: defaultResearchSkill, runId: run.runId, completedDay: run.completedDay, seq: nextCommandSeq(run) })
  store.dispatch({ type: "back" })
  store.dispatch({ type: "set-layer", layer: "night", enabled: true })
  // Repeated night layer update is ignored by the reducer.
  store.dispatch({ type: "set-layer", layer: "night", enabled: true })
  store.dispatch({ type: "finish", outcome: "ai-victory" })
  assert.deepEqual(cues, ["datacenter_deploy", "skill_evolve", "enter_eternal_night", "endgame_victory"])

  // A new withdrawn run triggers endgame_defeat.
  store.dispatch({ type: "open-setup" })
  store.dispatch({ ...start, seed: 7 })
  store.dispatch(open("menu"))
  store.dispatch({ type: "request-exit" })
  store.dispatch({ type: "withdraw" })
  assert.equal(cues.at(-1), "endgame_defeat")
  stop()
})

test("Project HUMAN alert fires once when research crosses 25% and 75% and does not fire on ending", () => {
  const store = createGameStore()
  const { cues, stop } = record(store)
  startRun(store)
  const scene = () => store.getSnapshot().scene
  const run = () => scene().kind === "decision" ? scene().back.run : scene().run
  const send = store.dispatch

  function daysTo(target) {
    while (run().completedDay < target) {
      if (scene().kind === "decision") send({ type: "back" })
      send({ type: "advance-day", runId: run().runId, completedDay: run().completedDay })
    }
    if (scene().kind === "decision") send({ type: "back" })
  }
  function order(payload) {
    const current = run()
    send({ ...payload, runId: current.runId, completedDay: current.completedDay, seq: nextCommandSeq(current) })
  }
  function research(...ids) {
    send(open("overview"))
    for (const skillId of ids) order({ type: "start-research", skillId })
    send({ type: "back" })
    daysTo(run().completedDay + Math.max(...ids.map(id => researchNode(id).skill.days)))
  }

  daysTo(20)
  send(open("overview"))
  for (const slot of [1, 2, 3]) order({ type: "unlock-research-slot", slot })
  send({ type: "back" })
  research("inference-efficiency")
  research("multimodal", "reinforcement-learning", "regulatory-adaptation")
  research("version-rebuild")
  const id = "recursive-improvement", node = researchNode(id)
  const levels = Math.ceil(standardScenario.rules.projectHuman.completionBps / node.skill.dangerBps)
  for (let level = 1; level <= levels; level++) research(id)

  const alerts = cues.filter(cue => cue === "project_human_alert")
  assert.equal(alerts.length, 2)
  assert.equal(cues.at(-1), "endgame_defeat")
  stop()
})

test("the only exported sound is an audible test ping with silent edges and sampled cues are listed", () => {
  assert.deepEqual(Object.keys(soundBank), ["test"])
  assert.ok(Object.keys(audioCueFiles).length >= 10)
  for (const cue of Object.keys(audioCueFiles)) assert.equal(isSoundCue(cue), true)
  const samples = soundBank.test()
  assert.equal(samples[0], 0)
  assert.equal(samples.at(-1), 0)
  const peak = samples.reduce((max, sample) => Math.max(max, Math.abs(sample)), 0)
  assert.ok(peak > .06 && peak < 1)
})

test("sampled cues load once, cache decoded buffers, and respect monophonic cancellation", async () => {
  const listeners = new Map()
  const page = {
    hidden: false,
    addEventListener(type, callback) { listeners.set(type, callback) },
    removeEventListener(type, callback) { if (listeners.get(type) === callback) listeners.delete(type) },
  }
  const sources = []
  const loadedUrls = []
  const node = { connect: dest => dest, disconnect() {} }
  const device = Object.assign(new EventTarget(), {
    state: "running", currentTime: 1, destination: {},
    resume: async () => {}, close: async () => { device.state = "closed" },
    createGain: () => ({ ...node, gain: { setTargetAtTime() {} } }),
    createBuffer: () => ({ copyToChannel() {} }),
    createBufferSource() {
      const source = { ...node, buffer: null, stopped: false, start() { sources.push(this) }, stop() { this.stopped = true } }
      return source
    },
  })
  const settings = { muted: false, volume: 75 }
  const output = createSoundOutput(() => settings, page, () => device, async url => {
    loadedUrls.push(url)
    return { duration: 1, url }
  })
  listeners.get("click")({ type: "click", isTrusted: true })
  await new Promise(resolve => setTimeout(resolve, 10))
  // Preload fetches each sampled asset once.
  assert.equal(loadedUrls.length, Object.keys(audioCueFiles).length)
  output.play("skill_evolve")
  output.play("skill_evolve")
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(sources.length, 2)
  assert.equal(sources[0].buffer.url, audioCueFiles.skill_evolve)
  assert.deepEqual(sources.map(s => s.stopped), [true, false])
  assert.equal(loadedUrls.length, Object.keys(audioCueFiles).length)
  output.dispose()
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
