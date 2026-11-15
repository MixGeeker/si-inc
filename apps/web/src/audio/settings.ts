export interface SoundSettings {
  readonly muted: boolean
  readonly volume: number // whole percent, 0–100
}

export const defaultSound: SoundSettings = Object.freeze({ muted: false, volume: 65 })
const storageKey = "singularity-inc.sound.v1"

export function validVolume(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 100
}

export function readSoundSettings(): SoundSettings {
  try {
    const raw = window.localStorage.getItem(storageKey)
    const parsed = raw === null ? null : JSON.parse(raw)
    if (typeof parsed?.muted === "boolean" && validVolume(parsed.volume)) {
      return { muted: parsed.muted, volume: parsed.volume }
    }
  } catch { /* Storage can be disabled or contain an older, invalid value. */ }
  return defaultSound
}

export function saveSoundSettings(settings: SoundSettings) {
  try { window.localStorage.setItem(storageKey, JSON.stringify(settings)) }
  catch { /* The current session still uses the committed settings. */ }
}
