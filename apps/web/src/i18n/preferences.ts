import { defaultLocale, isLocale, type Locale } from "../../../../packages/rules/locales.ts"
import type { GameStore } from "../scenes/store.ts"
import { languages } from "./languages.ts"

const storageKey = "singularity-inc.locale.v1"

export function resolveLocale(stored: unknown, preferred: readonly string[]): Locale {
  if (isLocale(stored)) return stored
  for (const tag of preferred) {
    const language = tag.toLowerCase().split("-")[0]
    if (language === "en") return "en"
    if (language === "zh") return "zh-CN"
  }
  return defaultLocale
}

export function readLocale() {
  let stored: string | null = null
  try { stored = window.localStorage.getItem(storageKey) }
  catch { /* Browser preferences are still available when storage is disabled. */ }
  return resolveLocale(stored, navigator.languages)
}

function displayLocale(locale: Locale) {
  document.documentElement.lang = locale
  document.title = `${languages[locale].ui.worldMap} · Singularity Inc.`
}

export function attachLocale(store: GameStore) {
  displayLocale(store.getSnapshot().locale)
  return store.on("set-locale", (_, { locale }) => {
    displayLocale(locale)
    try { window.localStorage.setItem(storageKey, locale) }
    catch { /* The committed preference still applies to this page. */ }
  })
}
