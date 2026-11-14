import { computeSnapshot } from "../../../../packages/rules/v0.1/world/compute.ts"

export type ComputeKind = "current" | "planned" | "unknown"

/** High-contrast marks for the terrain map: magenta, yellow, violet. */
export const computeColors = {
  current: "#ff3d8a",
  planned: "#ffe14a",
  unknown: "#c9a6ff",
} as const

export const computeKindLabel = {
  current: "建成",
  planned: "宣称",
  unknown: "未知",
} as const

const paintOrder = { unknown: 0, planned: 1, current: 2 } as const

function kindOf(realMw: number | null, envMw: number | null): ComputeKind {
  if (realMw != null && realMw > 0) return "current"
  if (envMw != null && envMw > 0) return "planned"
  return "unknown"
}

function megawatts(value: number) {
  return String(Math.round(value * 100) / 100)
}

export const computeSites = computeSnapshot.sites
  .map(site => ({
    id: site.id,
    name: site.name,
    lon: site.lon,
    lat: site.lat,
    kind: kindOf(site.realMw, site.envMw),
    realMw: site.realMw,
    envMw: site.envMw,
  }))
  .sort((a, b) => paintOrder[a.kind] - paintOrder[b.kind] || (a.realMw ?? 0) - (b.realMw ?? 0))

export function computeSiteLabel(site: (typeof computeSites)[number]) {
  const power = site.kind === "current" && site.realMw != null
    ? `${megawatts(site.realMw)} MW`
    : site.kind === "planned" && site.envMw != null
      ? `包络 ${megawatts(site.envMw)} MW`
      : "功率未记录"
  return `${computeKindLabel[site.kind]} · ${site.name} · ${power}`
}
