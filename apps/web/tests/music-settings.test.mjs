import assert from "node:assert/strict"
import test from "node:test"
import { musicCatalog, musicTrack, musicTrackTitle, resolveAutoMusicTrackId, resolveMusicTrackId } from "../src/audio/music.ts"
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
  assert.equal(resolveMusicTrackId("act1-day-a", musicCatalog), undefined)
  assert.equal(resolveMusicTrackId("act1-day-b", musicCatalog), "act1-day-b")
  assert.equal(resolveMusicTrackId("act2-night-b", musicCatalog), "act2-night-b")
  assert.equal(resolveMusicTrackId("faction-claude", musicCatalog), "faction-claude")
})

test("music catalog exposes unique tracks with localized titles and auto resolution", () => {
  assert.equal(musicCatalog.length, 10)
  const ids = new Set(musicCatalog.map(track => track.id))
  assert.equal(ids.size, 10)
  for (const track of musicCatalog) {
    assert.ok(track.src.startsWith("/assets/audio/bgm-") && track.src.endsWith(".mp3"))
    assert.ok(musicTrackTitle(track, "zh-CN").length > 0)
    assert.ok(musicTrackTitle(track, "en").length > 0)
  }
  assert.equal(resolveAutoMusicTrackId(false, 0), "act1-day-b")
  assert.equal(resolveAutoMusicTrackId(false, 7500), "project-human")
  assert.equal(resolveAutoMusicTrackId(true, 0), "act2-night")
  assert.equal(musicTrack("act2-night")?.src, "/assets/audio/bgm-act2-night.mp3")
})

test("music preferences stay separate from sound effects, accept catalog tracks, and reject unknown tracks", () => {
  const store = createGameStore()
  const initial = store.getSnapshot()
  assert.deepEqual(initial.music, { enabled: true, volume: 70, trackId: null })
  for (const volume of [-1, 101, 1.5, "70"]) store.dispatch({ type: "set-music-volume", volume })
  store.dispatch({ type: "set-music-enabled", enabled: "yes" })
  store.dispatch({ type: "set-music-enabled", enabled: true })
  store.dispatch({ type: "set-music-track", trackId: "dawn" })
  store.dispatch({ type: "set-music-track", trackId: null })
  assert.strictEqual(store.getSnapshot(), initial)

  store.dispatch({ type: "set-music-track", trackId: "faction-claude" })
  assert.equal(store.getSnapshot().music.trackId, "faction-claude")
  store.dispatch({ type: "set-music-track", trackId: null })
  assert.equal(store.getSnapshot().music.trackId, null)

  store.dispatch({ type: "set-music-enabled", enabled: false })
  store.dispatch({ type: "set-music-volume", volume: 40 })
  const next = store.getSnapshot()
  assert.deepEqual(next.music, { enabled: false, volume: 40, trackId: null })
  assert.deepEqual(next.sound, initial.sound)
  assert.strictEqual(next.scene, initial.scene)
})
