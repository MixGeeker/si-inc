import { audioCueFiles, sampleRate, soundBank, type SampledSoundCue, type SoundCue } from "./cues.ts"
import type { SoundSettings } from "./settings.ts"

export interface SoundOutput {
  play(cue: SoundCue): void
  syncSettings(): void
  dispose(): void
}

export type AudioLoader = (url: string, context: AudioContext) => Promise<AudioBuffer>

const openBrowserContext = () => typeof AudioContext === "undefined"
  ? undefined : new AudioContext({ latencyHint: "interactive" })

async function fetchAndDecodeAudio(url: string, context: AudioContext) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to load audio ${url}: ${response.status}`)
  return context.decodeAudioData(await response.arrayBuffer())
}

/** One mixer per application root. Only a real interaction can open the audio device. */
export function createSoundOutput(
  read: () => SoundSettings,
  page = document,
  open = openBrowserContext,
  loadAudio: AudioLoader = fetchAndDecodeAudio,
): SoundOutput {
  let context: AudioContext | undefined, master: GainNode | undefined
  let interacted = false, disposed = false
  let pending: { cue: SoundCue; until: number } | undefined
  const buffers = new Map<SoundCue, AudioBuffer>()
  const loading = new Map<SampledSoundCue, Promise<AudioBuffer | undefined>>()
  let stopActive: (() => void) | undefined
  let preloaded = false

  function level() {
    const { muted, volume } = read()
    return muted || page.hidden ? 0 : (volume / 100) ** 1.5
  }

  function quiet() {
    pending = undefined
    stopActive?.()
    stopActive = undefined
  }

  function startBuffer(buffer: AudioBuffer) {
    if (!context || !master || disposed || context.state !== "running" || !level()) return
    quiet()
    const source = context.createBufferSource(), envelope = context.createGain()
    source.buffer = buffer
    source.connect(envelope).connect(master)
    const clock = context
    const stop = () => {
      const t = clock.currentTime
      envelope.gain.setTargetAtTime(0, t, .003)
      source.stop(t + .015)
    }
    source.onended = () => {
      source.disconnect()
      envelope.disconnect()
      if (stopActive === stop) stopActive = undefined
    }
    stopActive = stop
    source.start()
  }

  function loadSampled(cue: SampledSoundCue) {
    const cached = buffers.get(cue)
    if (cached) return Promise.resolve(cached)
    const existing = loading.get(cue)
    if (existing) return existing
    const activeContext = context
    if (!activeContext || disposed) return Promise.resolve(undefined)
    const promise = loadAudio(audioCueFiles[cue], activeContext).then(buffer => {
      loading.delete(cue)
      if (!disposed && context === activeContext) buffers.set(cue, buffer)
      return buffer
    }).catch(() => {
      loading.delete(cue)
      return undefined
    })
    loading.set(cue, promise)
    return promise
  }

  function preloadSamples() {
    if (preloaded || disposed || !context) return
    preloaded = true
    for (const cue of Object.keys(audioCueFiles) as SampledSoundCue[]) {
      void loadSampled(cue)
    }
  }

  function syncSettings() {
    const gain = level()
    if (!gain) quiet()
    else if (interacted) openDevice()
    if (context && master) master.gain.setTargetAtTime(gain, context.currentTime, .008)
  }

  function play(cue: SoundCue) {
    if (!context || !master || disposed || !level()) return
    if (context.state !== "running") {
      pending = { cue, until: performance.now() + 450 }
      if (Object.hasOwn(audioCueFiles, cue)) void loadSampled(cue as SampledSoundCue)
      return
    }
    let buffer = buffers.get(cue)
    if (!buffer && Object.hasOwn(soundBank, cue)) {
      const samples = soundBank[cue as keyof typeof soundBank]()
      buffer = context.createBuffer(1, samples.length, sampleRate)
      buffer.copyToChannel(samples, 0)
      buffers.set(cue, buffer)
    }
    if (buffer) {
      startBuffer(buffer)
      return
    }
    if (Object.hasOwn(audioCueFiles, cue)) {
      quiet()
      const requestedUntil = performance.now() + 1500
      pending = { cue, until: requestedUntil }
      void loadSampled(cue as SampledSoundCue).then(decoded => {
        if (!decoded || disposed || !context || context.state !== "running" || !level()) return
        if (pending?.cue !== cue || performance.now() > pending.until) return
        startBuffer(decoded)
      })
    }
  }

  function deviceReady() {
    if (context?.state !== "running") return
    preloadSamples()
    const next = pending
    pending = undefined
    if (next && performance.now() <= next.until) play(next.cue)
  }

  function openDevice() {
    if (disposed || context?.state === "running") return
    if (!context) {
      try {
        context = open()
        if (!context) return
        master = context.createGain()
        master.gain.value = level()
        master.connect(context.destination)
        context.addEventListener("statechange", deviceReady)
      } catch { return }
    }
    if (context.state === "running") preloadSamples()
    // A blocked request can stay pending. A later trusted gesture must still be able to retry.
    if (context.state !== "closed") void context.resume().catch(() => {})
  }

  function activate(event: Event) {
    if (!event.isTrusted || page.hidden) return
    if (event.type === "pointerdown" && (event as PointerEvent).pointerType !== "mouse") return
    interacted = true
    if (level()) openDevice()
  }

  const gestures = ["pointerdown", "pointerup", "keydown", "click"]
  for (const type of gestures) page.addEventListener(type, activate, true)
  page.addEventListener("visibilitychange", syncSettings)
  return {
    play, syncSettings,
    dispose() {
      disposed = true
      for (const type of gestures) page.removeEventListener(type, activate, true)
      page.removeEventListener("visibilitychange", syncSettings)
      context?.removeEventListener("statechange", deviceReady)
      quiet()
      buffers.clear()
      loading.clear()
      master?.disconnect()
      void context?.close().catch(() => {})
    },
  }
}
