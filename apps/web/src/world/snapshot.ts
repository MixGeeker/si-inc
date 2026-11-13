import type { RegionState } from "../../../../packages/game/types"
import type { RegionId } from "../../../../packages/rules/v0.1/regions"

export { regions, regionIds, type RegionId } from "../../../../packages/rules/v0.1/regions"

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
  na: values(7100, 4400, 4800), we: values(5800, 3600, 6900),
  nordic: values(4600, 3000, 5300), ee: values(3200, 2000, 2800),
  ea: values(8000, 5000, 3400), sa: values(5100, 2400, 1900),
  sea: values(6900, 4200, 1500), mena: values(2400, 1600, 2400),
  ssa: values(1900, 1300, 1100), latam: values(5900, 2800, 1800),
  ca: values(2900, 1900, 2300), oc: values(4100, 3200, 3100),
} satisfies Record<RegionId, Pick<RegionState, Metric>>

export const exampleRoutes = [
  ["ea","sa"], ["ea","sea"], ["sa","mena"], ["sea","oc"], ["ea","ee"], ["sa","ca"],
  ["ee","we"], ["we","na"], ["latam","na"], ["mena","ssa"], ["ca","ee"], ["we","nordic"],
] as const satisfies ReadonlyArray<readonly [RegionId, RegionId]>
