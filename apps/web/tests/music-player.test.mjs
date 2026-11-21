import assert from "node:assert/strict"
import test from "node:test"
import { attachGameMusic, createMusicOutput, readMusicSnapshot } from "../src/audio/music-player.ts"
import { createGameStore } from "../src/scenes/store.ts"

function createMockAudioEnv() {
  const listeners = new Map()
  const page = {
    hidden: false,
    addEventListener(type, callback) { listeners.set(type, callback) },
    removeEventListener(type, callback) { if (listeners.get(type) === callback) listeners.delete(type) },
  }
  const sources = []
  const gains = []
  const loadedUrls = []
  let opened = 0
  const node = { connect: dest => dest, disconnect() {} }
  const device = Object.assign(new EventTarget(), {
    state: "running",
    currentTime: 1,
    destination: {},
    resume: async () => {},
    close: async () => { device.state = "closed" },
    createGain: () => {
      const gainNode = {
        ...node,
        targets: [],
        gain: {
          value: 1,
          setValueAtTime() {},
          setTargetAtTime(value) { gainNode.targets.push(value) },
        },
      }
      gains.push(gainNode)
      return gainNode
    },
    createBufferSource() {
      const source = {
        ...node,
        buffer: null,
        loop: false,
        stopped: false,
        start() { sources.push(this) },
        stop() { this.stopped = true },
      }
      return source
    },
  })
  const loadAudio = async url => {
    loadedUrls.push(url)
    return { duration: 58, url }
  }
  return { listeners, page, sources, gains, loadedUrls, device, loadAudio, open: () => { opened++; return device }, openedCount: () => opened }
}

const flush = () => new Promise(resolve => setTimeout(resolve, 10))

test("music output waits for a trusted user gesture, loops, crossfades day/night, ducks on news/cues, and cleans up", async () => {
  const env = createMockAudioEnv()
  const store = createGameStore()
  const output = createMusicOutput(() => readMusicSnapshot(store), env.page, env.open, env.loadAudio)
  const stop = attachGameMusic(store, output)

  // Untrusted events and initial mount must not open audio.
  env.listeners.get("click")({ type: "click", isTrusted: false })
  await flush()
  assert.equal(env.openedCount(), 0)
  assert.equal(env.sources.length, 0)

  // Trusted interaction unlocks audio and starts Act II (initialLayers.night === true).
  env.listeners.get("click")({ type: "click", isTrusted: true })
  await flush()
  assert.equal(env.openedCount(), 1)
  assert.equal(env.sources.length, 1)
  assert.equal(env.sources[0].loop, true)
  assert.equal(env.sources[0].buffer.url, "/assets/audio/bgm-act2-night.mp3")

  // Ducking node is gains[1] (gains[0] is master, gains[1] is duckGain).
  const duckGain = env.gains[1]
  assert.equal(duckGain.targets.at(-1), 1)

  // Opening news panel gently ducks BGM for reading focus; closing restores 1.
  store.dispatch({ type: "open-panel", panel: "news" })
  assert.ok(duckGain.targets.at(-1) < 0.5)
  store.dispatch({ type: "back" })
  assert.equal(duckGain.targets.at(-1), 1)

  // Playing a news stinger ducks BGM sharply; muting SFX clears cue ducking immediately.
  store.dispatch({ type: "play-sound", cue: "compliance_stinger_a" })
  assert.ok(duckGain.targets.at(-1) <= 0.2)
  store.dispatch({ type: "set-sound-muted", muted: true })
  assert.equal(duckGain.targets.at(-1), 1)

  // Switching to day crossfades from Act II to Act I Day (single selected track B).
  store.dispatch({ type: "set-layer", layer: "night", enabled: false })
  await flush()
  assert.equal(env.sources.length, 2)
  assert.equal(env.sources[0].stopped, true)
  assert.equal(env.sources[1].stopped, false)
  assert.equal(env.sources[1].buffer.url, "/assets/audio/bgm-act1-day-b.mp3")

  // Manual track override switches to the selected faction radio and ignores day/night changes.
  store.dispatch({ type: "set-music-track", trackId: "faction-claude" })
  await flush()
  assert.equal(env.sources.length, 3)
  assert.equal(env.sources[1].stopped, true)
  assert.equal(env.sources[2].buffer.url, "/assets/audio/bgm-faction-claude.mp3")

  store.dispatch({ type: "set-layer", layer: "night", enabled: true })
  await flush()
  assert.equal(env.sources.length, 3)
  assert.equal(env.sources[2].stopped, false)

  // Returning to Auto mode restores Act II Eternal Night (cached buffer, no extra fetch).
  const fetchesBeforeAuto = env.loadedUrls.length
  store.dispatch({ type: "set-music-track", trackId: null })
  await flush()
  assert.equal(env.loadedUrls.length, fetchesBeforeAuto)
  assert.equal(env.sources.length, 4)
  assert.equal(env.sources[2].stopped, true)
  assert.equal(env.sources[3].buffer.url, "/assets/audio/bgm-act2-night.mp3")

  // Disabling music stops playback; hiding page suppresses playback too.
  store.dispatch({ type: "set-music-enabled", enabled: false })
  await flush()
  assert.equal(env.sources[3].stopped, true)

  store.dispatch({ type: "set-music-enabled", enabled: true })
  await flush()
  assert.equal(env.sources.length, 5)
  assert.equal(env.sources[4].stopped, false)

  env.page.hidden = true
  env.listeners.get("visibilitychange")()
  await flush()
  assert.equal(env.sources[4].stopped, true)

  stop()
  assert.equal(env.device.state, "closed")
  assert.equal(env.listeners.size, 0)
})
