import type { Locale } from "../../../../packages/rules/locales.ts"
import names from "./data/country-names.en.json" with { type: "json" }

export const spratlyIslands = "spratly-islands"
const englishNames: Readonly<Record<string, string>> = names

export function countryName(country: { id: string; name: string } | null | undefined, locale: Locale) {
  if (!country) return undefined
  return locale === "en" ? englishNames[country.id] ?? country.name : country.name
}
