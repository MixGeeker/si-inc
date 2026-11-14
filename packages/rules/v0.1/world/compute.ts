import snapshot from "./compute.json" with { type: "json" }
import { regionIds, type RegionId } from "./regions.ts"

/** Frozen compute-globe snapshot. Markets use the same IDs as the campaign map. */
export const computeSnapshot = snapshot

export function computeMarket(id: RegionId) {
  return snapshot.markets[id]
}

export const computeMarketIds = regionIds.filter(id => id in snapshot.markets)
