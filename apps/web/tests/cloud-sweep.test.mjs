import assert from "node:assert/strict"
import test from "node:test"
import { SWEEP_MS, cloudCoverAt, hasOutgoingClouds } from "../src/cartography/cloud-sweep.ts"

test("dusk carries the existing clouds out and keeps the night clear past the daytime refill", () => {
  const dusk = { startedAt: 1000, initialCover: 1 }
  const end = dusk.startedAt + SWEEP_MS
  assert.equal(hasOutgoingClouds(dusk, end - 1), true)
  assert.equal(cloudCoverAt(dusk, end - 1, true), 1)
  assert.equal(hasOutgoingClouds(dusk, end), false)
  for (const now of [end, end + 1000, end + 60_000]) {
    assert.equal(cloudCoverAt(dusk, now, true), 0)
  }
})

test("a clear dawn restores clouds gradually and an interrupted dawn only blows out the returning cover", () => {
  const dawn = { startedAt: 5000, initialCover: 0 }
  assert.equal(hasOutgoingClouds(dawn, dawn.startedAt), false)
  assert.equal(cloudCoverAt(dawn, dawn.startedAt, false), 0)
  assert.equal(cloudCoverAt(dawn, dawn.startedAt + 5000, false), 1)

  const turn = dawn.startedAt + 1500
  const returning = cloudCoverAt(dawn, turn, false)
  assert.ok(returning > 0 && returning < 1)
  const dusk = { startedAt: turn, initialCover: returning }
  assert.equal(cloudCoverAt(dusk, turn, true), returning)
  assert.equal(cloudCoverAt(dusk, turn + SWEEP_MS, true), 0)
})
