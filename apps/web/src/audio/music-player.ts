import { visibleRunState } from "../scenes/machine.ts"
import type { GameStore } from "../scenes/store.ts"
import type { SoundCue } from "./cues.ts"
import { musicTrack, resolveAutoMusicTrackId, type MusicSettings } from "./music.ts"
import type { AudioLoader } from "./player.ts"

export interface MusicSnapshot {
  readonly music: MusicSettings
  readonly night: boolean
  readonly researchBps: number
  readonly readingFocus: boolean
}

export interface MusicOutput {
  sync(): void
  duck(durationMs: number, factor?: number): void
  clearDuck(): void
  dispose(): void
}

interface ActiveDeck {
  readonly trackId: string
  readonly source: AudioBufferSourceNode
  readonly gain: GainNode
}

const openBrowserContext = () => typeof AudioContext === "undefined"
  ? undefined : new AudioContext({ latencyHint: "playback" })

async function fetchAndDecodeMusic(url: string, context: AudioContext) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to load music ${url}: ${response.status}`)
  return context.decodeAudioData(await response.arrayBuffer())
}

const crossfadeSeconds = 1.8
// Keep BGM comfortably below SFX peaks so UI clicks, alerts, and news stingers stay crisp.
const bgmMixScale = .45
const readingDuckFactor = .38

const cueDuckProfile: Record<SoundCue, { readonly durationMs: number; readonly factor: number }> = {
  compliance_stinger_a: { durationMs: 10200, factor: .14 },
  compliance_stinger_b: { durationMs: 10200, factor: .14 },
  endgame_victory: { durationMs: 4200, factor: .14 },
  endgame_defeat: { durationMs: 4200, factor: .14 },
  enter_eternal_night: { durationMs: 3600, factor: .16 },
  project_human_alert: { durationMs: 2600, factor: .18 },
  news_breaking: { durationMs: 1300, factor: .20 },
  faction_ability: { durationMs: 1200, factor: .32 },
  datacenter_deploy: { durationMs: 1000, factor: .42 },
  skill_evolve: { durationMs: 900, factor: .48 },
  test: { durationMs: 650, factor: .45 },
}

export function createMusicOutput(
  read: () => MusicSnapshot,
  page = document,
  open = openBrowserContext,
  loadAudio: AudioLoader = fetchAndDecodeMusic,
): MusicOutput {
  let context: AudioContext | undefined, master: GainNode | undefined, duckGain: GainNode | undefined
  let interacted = false, disposed = false
  let activeDeck: ActiveDeck | undefined
  const fadingDecks = new Set<{ deck: ActiveDeck; timer: ReturnType<typeof setTimeout> }>()
  const buffers = new Map<string, AudioBuffer>()
  const loading = new Map<string, Promise<AudioBuffer | undefined>>()
  let requestToken = 0
  let cueDuckFactor = 1
  let cueDuckTimer: ReturnType<typeof setTimeout> | undefined

  function clearCueDuckTimer() {
    if (cueDuckTimer !== undefined) {
      clearTimeout(cueDuckTimer)
      cueDuckTimer = undefined
    }
  }

  function applyDuckGain(fast = false) {
    if (!context || !duckGain) return
    const { readingFocus } = read()
    const target = Math.min(cueDuckFactor, readingFocus ? readingDuckFactor : 1)
    const timeConstant = fast ? .045 : .22
    duckGain.gain.setTargetAtTime(target, context.currentTime, timeConstant)
  }

  function clearDuck() {
    clearCueDuckTimer()
    cueDuckFactor = 1
    applyDuckGain(false)
  }

  function duck(durationMs: number, factor = .20) {
    if (disposed || durationMs <= 0) return
    clearCueDuckTimer()
    cueDuckFactor = Math.max(0, Math.min(1, factor))
    applyDuckGain(true)
    cueDuckTimer = setTimeout(() => {
      cueDuckTimer = undefined
      cueDuckFactor = 1
      applyDuckGain(false)
    }, durationMs)
  }

  function masterLevel() {
    const { music } = read()
    return !music.enabled || page.hidden ? 0 : (music.volume / 100) ** 1.5 * bgmMixScale
  }

  function desiredTrackId() {
    if (!masterLevel()) return null
    const { music, night, researchBps } = read()
    return music.trackId ?? resolveAutoMusicTrackId(night, researchBps)
  }

  function releaseDeck(deck: ActiveDeck) {
    try { deck.source.disconnect() } catch {}
    try { deck.gain.disconnect() } catch {}
  }

  function fadeOutDeck(deck: ActiveDeck, seconds: number) {
    if (!context) {
      releaseDeck(deck)
      return
    }
    const now = context.currentTime
    deck.gain.gain.setTargetAtTime(0, now, seconds / 4)
    try { deck.source.stop(now + seconds + .05) } catch {}
    const entry = {
      deck,
      timer: setTimeout(() => {
        fadingDecks.delete(entry)
        releaseDeck(deck)
      }, Math.ceil((seconds + .1) * 1000)),
    }
    fadingDecks.add(entry)
  }

  function stopAllDecks(seconds = .35) {
    if (activeDeck) {
      fadeOutDeck(activeDeck, seconds)
      activeDeck = undefined
    }
  }

  function loadTrack(trackId: string) {
    const cached = buffers.get(trackId)
    if (cached) return Promise.resolve(cached)
    const existing = loading.get(trackId)
    if (existing) return existing
    const track = musicTrack(trackId)
    const activeContext = context
    if (!track || !activeContext || disposed) return Promise.resolve(undefined)
    const promise = loadAudio(track.src, activeContext).then(buffer => {
      loading.delete(trackId)
      if (!disposed && context === activeContext) buffers.set(trackId, buffer)
      return buffer
    }).catch(() => {
      loading.delete(trackId)
      return undefined
    })
    loading.set(trackId, promise)
    return promise
  }

  function startTrack(trackId: string, buffer: AudioBuffer) {
    if (!context || !duckGain || disposed || context.state !== "running" || !masterLevel()) return
    const previous = activeDeck
    if (previous) fadeOutDeck(previous, crossfadeSeconds)
    const source = context.createBufferSource()
    const gain = context.createGain()
    source.buffer = buffer
    source.loop = true
    const now = context.currentTime
    const fadeIn = previous ? crossfadeSeconds : .35
    gain.gain.setValueAtTime(0, now)
    gain.gain.setTargetAtTime(1, now, fadeIn / 4)
    source.connect(gain).connect(duckGain)
    source.start(now)
    activeDeck = { trackId, source, gain }
  }

  function sync() {
    if (disposed) return
    const level = masterLevel()
    if (context && master) {
      master.gain.setTargetAtTime(level, context.currentTime, .08)
    }
    applyDuckGain(false)
    if (!level) {
      requestToken += 1
      stopAllDecks(.35)
      return
    }
    if (interacted) openDevice()
    if (!context || context.state !== "running") return

    const target = desiredTrackId()
    if (!target) {
      requestToken += 1
      stopAllDecks(.35)
      return
    }
    if (activeDeck?.trackId === target) return

    const token = ++requestToken
    const cached = buffers.get(target)
    if (cached) {
      startTrack(target, cached)
      return
    }
    void loadTrack(target).then(buffer => {
      if (!buffer || disposed || token !== requestToken) return
      if (!context || context.state !== "running" || desiredTrackId() !== target) return
      startTrack(target, buffer)
    })
  }

  function deviceReady() {
    if (context?.state === "running") sync()
  }

  function openDevice() {
    if (disposed || context?.state === "running") return
    if (!context) {
      try {
        context = open()
        if (!context) return
        master = context.createGain()
        master.gain.value = masterLevel()
        duckGain = context.createGain()
        duckGain.gain.value = read().readingFocus ? readingDuckFactor : 1
        duckGain.connect(master)
        master.connect(context.destination)
        context.addEventListener("statechange", deviceReady)
      } catch { return }
    }
    if (context.state === "running") sync()
    else if (context.state !== "closed") void context.resume().catch(() => {})
  }

  function activate(event: Event) {
    if (!event.isTrusted || page.hidden) return
    if (event.type === "pointerdown" && (event as PointerEvent).pointerType !== "mouse") return
    interacted = true
    if (masterLevel()) {
      openDevice()
      sync()
    }
  }

  const gestures = ["pointerdown", "pointerup", "keydown", "click"]
  for (const type of gestures) page.addEventListener(type, activate, true)
  page.addEventListener("visibilitychange", sync)

  return {
    sync,
    duck,
    clearDuck,
    dispose() {
      disposed = true
      requestToken += 1
      clearCueDuckTimer()
      for (const type of gestures) page.removeEventListener(type, activate, true)
      page.removeEventListener("visibilitychange", sync)
      context?.removeEventListener("statechange", deviceReady)
      if (activeDeck) {
        try { activeDeck.source.stop() } catch {}
        releaseDeck(activeDeck)
        activeDeck = undefined
      }
      for (const entry of fadingDecks) {
        clearTimeout(entry.timer)
        try { entry.deck.source.stop() } catch {}
        releaseDeck(entry.deck)
      }
      fadingDecks.clear()
      buffers.clear()
      loading.clear()
      duckGain?.disconnect()
      master?.disconnect()
      void context?.close().catch(() => {})
    },
  }
}

export function readMusicSnapshot(store: GameStore): MusicSnapshot {
  const snapshot = store.getSnapshot()
  const run = visibleRunState(snapshot.scene)
  const { scene } = snapshot
  const readingFocus = scene.kind === "decision"
    || ((scene.kind === "campaign" || scene.kind === "preview") && scene.panel === "news")
  return {
    music: snapshot.music,
    night: snapshot.layers.night,
    researchBps: run?.researchBps ?? 0,
    readingFocus,
  }
}

export function attachGameMusic(
  store: GameStore,
  output = createMusicOutput(() => readMusicSnapshot(store)),
) {
  output.sync()
  const unsubscribe = store.subscribe(() => output.sync())
  const offPlay = store.on("play-sound", ({ cue }) => {
    const profile = cueDuckProfile[cue]
    if (profile) output.duck(profile.durationMs, profile.factor)
  })
  const offMute = store.on("set-sound-muted", ({ muted }) => {
    if (muted) output.clearDuck()
  })
  return () => {
    unsubscribe()
    offPlay()
    offMute()
    output.dispose()
  }
}
