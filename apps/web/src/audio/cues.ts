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

export const audioCueFiles = Object.freeze({
  news_breaking: "/assets/audio/sfx-news-breaking.mp3",
  enter_eternal_night: "/assets/audio/sfx-enter-eternal-night.mp3",
  project_human_alert: "/assets/audio/sfx-project-human-alert.mp3",
  skill_evolve: "/assets/audio/sfx-skill-evolve.mp3",
  datacenter_deploy: "/assets/audio/sfx-datacenter-deploy.mp3",
  faction_ability: "/assets/audio/sfx-faction-ability.mp3",
  endgame_victory: "/assets/audio/sfx-endgame-victory.mp3",
  endgame_defeat: "/assets/audio/sfx-endgame-defeat.mp3",
  compliance_stinger_a: "/assets/audio/stinger-compliance-a.mp3",
  compliance_stinger_b: "/assets/audio/stinger-compliance-b.mp3",
})

export type SampledSoundCue = keyof typeof audioCueFiles
export type SoundCue = keyof typeof soundBank | SampledSoundCue

export function isSoundCue(value: unknown): value is SoundCue {
  return typeof value === "string" && (Object.hasOwn(soundBank, value) || Object.hasOwn(audioCueFiles, value))
}
