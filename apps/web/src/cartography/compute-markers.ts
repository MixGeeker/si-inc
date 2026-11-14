import placesFile from "../../../../packages/rules/v0.1/world/compute-places.json" with { type: "json" }

export type ComputeKind = "current" | "planned" | "unknown"

/** Muted compute-globe hues: warm orange for capacity, steel blue when power is unknown. */
export const computeColors = {
  current: "#c56b3a",
  planned: "#9a7a52",
  unknown: "#6f96ae",
} as const

export const computeKindLabel = {
  current: "建成",
  planned: "宣称",
  unknown: "未知",
} as const

function megawatts(value: number) {
  return String(Math.round(value * 100) / 100)
}

export const computeLegendKinds = ["current"] as const

export const computePlaces = placesFile.places

export function computePlaceLabel(place: (typeof computePlaces)[number]) {
  const where = place.name === place.countryName ? place.name : `${place.countryName} · ${place.name}`
  return `${computeKindLabel.current} · ${where} · ${place.sites} 座 · ${megawatts(place.realMw)} MW`
}
