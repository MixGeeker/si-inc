export const sampleRate = 32000
const frames = (ms: number) => Math.round(ms * sampleRate / 1000)

// The original map ping and its quiet echo form a single test sound.
function renderTestPing(): Float32Array<ArrayBuffer> {
  const pulses = [
    { at: 0, duration: 110, endHz: 830, level: .21 },
    { at: 78, duration: 123, endHz: 880, level: .073 },
  ]
  const samples = new Float32Array(Math.max(...pulses.map(p => frames(p.at) + frames(p.duration))))
  const attack = frames(4), release = frames(8)
  for (const pulse of pulses) {
    const start = frames(pulse.at), length = frames(pulse.duration)
    for (let i = 0; i < length; i++) {
      const progress = i / length
      const phase = 2 * Math.PI * i / sampleRate * (880 + .5 * (pulse.endHz - 880) * progress)
      const wave = .79 * Math.sin(phase) + .21 * Math.sin(2.72 * phase) * Math.exp(-7 * progress)
      const envelope = Math.min(1, i / attack, (length - 1 - i) / release) * Math.exp(-4 * progress)
      samples[start + i] += pulse.level * envelope * wave
    }
  }
  return samples
}

export const soundBank = Object.freeze({ test: renderTestPing })
export type SoundCue = keyof typeof soundBank
