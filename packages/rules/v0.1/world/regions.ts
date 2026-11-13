/** Stable IDs for v0.1. Coordinates [longitude, latitude] aim the camera inside each market. */
export const regions = {
  na: { name: "北美", center: [-99, 39] },
  we: { name: "西欧", center: [3, 47] },
  nordic: { name: "北欧", center: [15, 61] },
  ee: { name: "东欧及北亚", center: [75, 58] },
  ea: { name: "东亚", center: [107, 32] },
  sa: { name: "南亚", center: [78, 22] },
  sea: { name: "东南亚", center: [104, 13] },
  mena: { name: "中东及北非", center: [36, 29] },
  ssa: { name: "撒哈拉以南非洲", center: [23, -10] },
  latam: { name: "拉丁美洲", center: [-62, -14] },
  ca: { name: "中亚", center: [65, 43] },
  oc: { name: "大洋洲", center: [134, -24] },
} as const satisfies Record<string, { name: string; center: readonly [number, number] }>

export type RegionId = keyof typeof regions
export const regionIds = Object.keys(regions) as RegionId[]
