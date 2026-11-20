import type { GameStore } from "../scenes/store.ts"

/** One background track. Add a file by appending an entry; the sound menu lists `title` and saves `id`. */
export interface MusicTrack {
  readonly id: string
  readonly title: string
  readonly src: string
}

export const musicCatalog: readonly MusicTrack[] = []

/** Playback preference. This is separate from the sound-effect volume and mute. */
export interface MusicSettings {
  readonly enabled: boolean
  readonly volume: number
  readonly trackId: string | null
}

export const defaultMusic: MusicSettings = Object.freeze({ enabled: true, volume: 70, trackId: null })
const storageKey = "singularity-inc.music.v1"

export function musicTrack(id: string) {
  return musicCatalog.find(track => track.id === id)
}

export function resolveMusicTrackId(trackId: unknown, catalog: readonly MusicTrack[] = musicCatalog) {
  if (trackId === null) return null
  return typeof trackId === "string" && catalog.some(track => track.id === trackId) ? trackId : undefined
}

export function readMusicSettings(): MusicSettings {
  try {
    const raw = window.localStorage.getItem(storageKey)
    const parsed = raw === null ? null : JSON.parse(raw)
    const trackId = resolveMusicTrackId(parsed?.trackId)
    if (typeof parsed?.enabled === "boolean" && Number.isInteger(parsed.volume)
      && parsed.volume >= 0 && parsed.volume <= 100 && trackId !== undefined) {
      return { enabled: parsed.enabled, volume: parsed.volume, trackId }
    }
  } catch { /* Storage can be disabled or contain an older value. */ }
  return defaultMusic
}

export function saveMusicSettings(settings: MusicSettings) {
  try { window.localStorage.setItem(storageKey, JSON.stringify(settings)) }
  catch { /* The current session still uses the committed preference. */ }
}

export function attachMusicPreference(store: GameStore, persist = saveMusicSettings) {
  const save = () => persist(store.getSnapshot().music)
  return [
    store.on("set-music-enabled", save),
    store.on("set-music-volume", save),
    store.on("set-music-track", save),
  ]
}
