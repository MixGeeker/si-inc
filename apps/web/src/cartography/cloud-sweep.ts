import { MathUtils } from "three"

export const SWEEP_MS = 1600
const CLEAR_MS = 750
const REFILL_MS = 1500

export type CloudSweep = { startedAt:number; initialCover:number }

export function hasOutgoingClouds(sweep:CloudSweep, now:number) {
  return sweep.initialCover > 0 && now - sweep.startedAt < SWEEP_MS
}

export function cloudCoverAt(sweep:CloudSweep, now:number, night:boolean) {
  if (hasOutgoingClouds(sweep, now)) return sweep.initialCover
  if (night) return 0
  const refillAt = sweep.startedAt + (sweep.initialCover > 0 ? SWEEP_MS : 0) + CLEAR_MS
  return MathUtils.smoothstep(now, refillAt, refillAt + REFILL_MS)
}
