import { sampleRate, soundBank, type SoundCue } from "./cues.ts"
import type { SoundSettings } from "./settings.ts"

export interface SoundOutput {
  play(cue: SoundCue): void
  syncSettings(): void
  dispose(): void
}

const openBrowserContext = () => typeof AudioContext === "undefined"
  ? undefined : new AudioContext({ latencyHint: "interactive" })

/** One mixer per application root. Only a real interaction can open the audio device. */
export function createSoundOutput(read: () => SoundSettings, page = document, open = openBrowserContext): SoundOutput {
  let context: AudioContext | undefined, master: GainNode | undefined
  let interacted = false, disposed = false
  let pending: { cue: SoundCue; until: number } | undefined
  const buffers = new Map<SoundCue, AudioBuffer>()
  let stopActive: (() => void) | undefined

  function level() {
    const { muted, volume } = read()
    return muted || page.hidden ? 0 : (volume / 100) ** 1.5
  }

  function quiet() {
    pending = undefined
    stopActive?.()
    stopActive = undefined
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
      return
    }
    quiet()
    let buffer = buffers.get(cue)
    if (!buffer) {
      const samples = soundBank[cue]()
      buffer = context.createBuffer(1, samples.length, sampleRate)
      buffer.copyToChannel(samples, 0)
      buffers.set(cue, buffer)
    }
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

  function deviceReady() {
    if (context?.state !== "running") return
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
      master?.disconnect()
      void context?.close().catch(() => {})
    },
  }
}
