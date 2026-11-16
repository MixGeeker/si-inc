import placesFile from "../../../../packages/rules/v0.1/world/compute-places.json" with { type: "json" }
import type { Language } from "../i18n/languages.ts"

export type ComputeKind = "current" | "planned" | "unknown"

/** Muted compute-globe hues: warm orange for capacity, steel blue when power is unknown. */
export const computeColors = {
  current: "#c56b3a",
  planned: "#9a7a52",
  unknown: "#6f96ae",
} as const

export const computeLegendKinds = ["current"] as const
export const computePlaces = placesFile.places
const sites = new Map(computePlaces.map(p => [p.id, p]))

export function computePlaceById(id: string) {
  return sites.get(id)
}

export function computePlaceLabel(place: (typeof computePlaces)[number], { locale, ui, country, number }: Language) {
  const nation = locale === "en" ? country.of(place.country) ?? place.country : place.countryName
  const subdivision = locale === "en" ? place.nameEn : place.name === place.countryName ? undefined : place.name
  const where = subdivision ? `${nation} · ${subdivision}` : nation
  return `${ui.built} · ${where} · ${ui.siteCount(place.sites)} · ${number.format(place.realMw)} MW`
}
