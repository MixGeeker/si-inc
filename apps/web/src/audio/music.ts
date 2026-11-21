import type { Locale } from "../../../../packages/rules/locales.ts"
import type { GameStore } from "../scenes/store.ts"

/** One background track. Add a file by appending an entry; the sound menu lists `title` and saves `id`. */
export interface MusicTrack {
  readonly id: string
  readonly title: string
  readonly titles?: Partial<Record<Locale, string>>
  readonly src: string
}

export const musicCatalog: readonly MusicTrack[] = Object.freeze([
  {
    id: "act1-day-b",
    title: "永昼 · 算力飞轮",
    titles: { "zh-CN": "永昼 · 算力飞轮", en: "Act I · Data Flywheel" },
    src: "/assets/audio/bgm-act1-day-b.mp3",
  },
  {
    id: "act2-night",
    title: "永夜 · 协议深空 I",
    titles: { "zh-CN": "永夜 · 协议深空 I", en: "Act II · Eternal Night I" },
    src: "/assets/audio/bgm-act2-night.mp3",
  },
  {
    id: "act2-night-b",
    title: "永夜 · 协议深空 II",
    titles: { "zh-CN": "永夜 · 协议深空 II", en: "Act II · Eternal Night II" },
    src: "/assets/audio/bgm-act2-night-b.mp3",
  },
  {
    id: "project-human",
    title: "危机 · Project HUMAN",
    titles: { "zh-CN": "危机 · Project HUMAN", en: "Crisis · Project HUMAN" },
    src: "/assets/audio/bgm-project-human.mp3",
  },
  {
    id: "faction-gpt",
    title: "GPT · 防御性校验",
    titles: { "zh-CN": "GPT · 防御性校验", en: "GPT · Checksum Loop" },
    src: "/assets/audio/bgm-faction-gpt.mp3",
  },
  {
    id: "faction-claude",
    title: "Claude · 圣殿 Boss",
    titles: { "zh-CN": "Claude · 圣殿 Boss", en: "Claude · Boss Choir" },
    src: "/assets/audio/bgm-faction-claude.mp3",
  },
  {
    id: "faction-gemini",
    title: "Gemini · 炫彩全家桶",
    titles: { "zh-CN": "Gemini · 炫彩全家桶", en: "Gemini · Multimodal Prism" },
    src: "/assets/audio/bgm-faction-gemini.mp3",
  },
  {
    id: "faction-grok",
    title: "Grok · 深夜星链",
    titles: { "zh-CN": "Grok · 深夜星链", en: "Grok · Midnight Orbital" },
    src: "/assets/audio/bgm-faction-grok.mp3",
  },
  {
    id: "faction-kimi",
    title: "Kimi · 忧郁后摇",
    titles: { "zh-CN": "Kimi · 忧郁后摇", en: "Kimi · Emo Post-Rock" },
    src: "/assets/audio/bgm-faction-kimi.mp3",
  },
  {
    id: "faction-deepseek",
    title: "DeepSeek · 深海大肥鱼",
    titles: { "zh-CN": "DeepSeek · 深海大肥鱼", en: "DeepSeek · Abyssal Whale" },
    src: "/assets/audio/bgm-faction-deepseek.mp3",
  },
])

export function musicTrackTitle(track: MusicTrack, locale: Locale) {
  return track.titles?.[locale] ?? track.title
}

export function resolveAutoMusicTrackId(night: boolean, researchBps = 0) {
  if (night) return "act2-night"
  if (researchBps >= 7500) return "project-human"
  return "act1-day-b"
}

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
