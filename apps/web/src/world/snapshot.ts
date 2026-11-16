import type { RegionState } from "../../../../packages/game/types"
import type { RegionId } from "../../../../packages/rules/v0.1/world/regions"

export { regions, regionIds, type RegionId } from "../../../../packages/rules/v0.1/world/regions"

type Metric = keyof Pick<RegionState, "adoptionBps" | "dependencyBps" | "lockdownBps">
export const layers = {
  adoptionBps: { label: "普及率", description: "当地人口中使用 AI 的比例", color: "#65d9be" },
  dependencyBps: { label: "用户依赖度", description: "当地 AI 用户中形成依赖的比例", color: "#bca4fa" },
  lockdownBps: { label: "封锁度", description: "该地区的反制与封锁强度", color: "#f2a17d" },
} as const satisfies Record<Metric, { label: string; description: string; color: string }>
export type Layer = keyof typeof layers
export const layerKeys = Object.keys(layers) as Layer[]

// Illustrative snapshot only. Values use the same 10,000-basis-point scale as the simulation.
const values = (adoptionBps: number, dependencyBps: number, lockdownBps: number) =>
  ({ adoptionBps, dependencyBps, lockdownBps })
export const snapshot = {
  // Earlier samples are weighted by playable population, and dependency by AI users.
  na: values(6652, 3871, 3681), sam: values(5900, 2800, 1800),
  eu: values(5081, 3318, 5780), as: values(6003, 3801, 2414),
  af: values(1990, 1365, 1333), oc: values(4100, 3200, 3100),
} satisfies Record<RegionId, Pick<RegionState, Metric>>

export const exampleRoutes = [
  ["as", "oc"], ["as", "eu"], ["eu", "na"], ["sam", "na"], ["as", "af"],
] as const satisfies ReadonlyArray<readonly [RegionId, RegionId]>
