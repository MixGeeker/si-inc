import assert from "node:assert/strict"
import test from "node:test"
import { musicCatalog, resolveMusicTrackId } from "../src/audio/music.ts"
import { createGameStore } from "../src/scenes/store.ts"

const sample = [
  { id: "dawn", title: "Dawn", src: "/music/dawn.mp3" },
  { id: "night", title: "Night", src: "/music/night.mp3" },
]

test("a music track id must be null or one of the provided tracks", () => {
  assert.equal(resolveMusicTrackId(null, sample), null)
  assert.equal(resolveMusicTrackId("dawn", sample), "dawn")
  for (const value of ["missing", "", 1, true, undefined, ["dawn"]]) {
    assert.equal(resolveMusicTrackId(value, sample), undefined)
  }
  assert.equal(resolveMusicTrackId("dawn", musicCatalog), undefined)
})

test("music preferences stay separate from sound effects and reject unknown tracks", () => {
  const store = createGameStore()
  const initial = store.getSnapshot()
  assert.deepEqual(initial.music, { enabled: true, volume: 70, trackId: null })
  for (const volume of [-1, 101, 1.5, "70"]) store.dispatch({ type: "set-music-volume", volume })
  store.dispatch({ type: "set-music-enabled", enabled: "yes" })
  store.dispatch({ type: "set-music-enabled", enabled: true })
  store.dispatch({ type: "set-music-track", trackId: "dawn" })
  store.dispatch({ type: "set-music-track", trackId: null })
  assert.strictEqual(store.getSnapshot(), initial)

  store.dispatch({ type: "set-music-enabled", enabled: false })
  store.dispatch({ type: "set-music-volume", volume: 40 })
  const next = store.getSnapshot()
  assert.deepEqual(next.music, { enabled: false, volume: 40, trackId: null })
  assert.deepEqual(next.sound, initial.sound)
  assert.strictEqual(next.scene, initial.scene)
})
