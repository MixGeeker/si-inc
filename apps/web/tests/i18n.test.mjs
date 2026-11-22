import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { advanceDay, createRun, decisionChoiceForRun } from "../../../packages/game/run.ts"
import { computePlaces, computePlaceLabel } from "../src/cartography/compute-markers.ts"
import { countryName } from "../src/cartography/place-names.ts"
import { languages } from "../src/i18n/languages.ts"
import { resolveLocale } from "../src/i18n/preferences.ts"
import { visibleRunState } from "../src/scenes/machine.ts"
import { createGameStore, forkDeveloperStore } from "../src/scenes/store.ts"
import { campaignNews, previewNews } from "../src/scenes/world/newsFeed.ts"

test("a saved language takes priority, otherwise the first supported browser language wins", () => {
  assert.equal(resolveLocale("en", ["zh-CN"]), "en")
  assert.equal(resolveLocale("zh-CN", ["en-US"]), "zh-CN")
  assert.equal(resolveLocale(null, ["de", "en-GB", "zh"]), "en")
  assert.equal(resolveLocale("__proto__", ["fr", "zh-Hans", "en"]), "zh-CN")
  assert.equal(resolveLocale(null, ["fr", "ja"]), "zh-CN")
  assert.equal(resolveLocale(null, []), "zh-CN")
})

test("locale commits are isolated and reject duplicate or invalid input, including while a site is selected", () => {
  const store = createGameStore()
  const other = createGameStore()
  const site = { countryId: "FRA", lon: 2, lat: 47, siteId: "fr" }
  store.dispatch({ type: "pick-location", selection: site })
  const before = store.getSnapshot()
  const notices = []
  const stop = store.on("set-locale", (event, state) => notices.push([event.locale, state.locale]))
  for (const value of ["zh-CN", "es", "EN", "__proto__", null, ["en"]]) {
    store.dispatch({ type: "set-locale", locale: value })
    assert.strictEqual(store.getSnapshot(), before)
  }
  store.dispatch({ type: "set-locale", locale: "en" })
  const after = store.getSnapshot()
  assert.strictEqual(before.scene, after.scene)
  assert.strictEqual(before.selection, after.selection)
  assert.equal(after.selection.siteId, "fr")
  assert.equal(other.getSnapshot().locale, "zh-CN")
  for (const invalid of [{ siteId: "__proto__" }, { islandId: "bogus" }, { siteId: "fr", islandId: "spratly-islands" }]) {
    store.dispatch({ type: "pick-location", selection: { ...site, ...invalid } })
    assert.strictEqual(store.getSnapshot(), after)
  }
  store.dispatch({ type: "set-locale", locale: "en" })
  assert.strictEqual(store.getSnapshot(), after)
  assert.deepEqual(notices, [["en", "en"]])
  stop()
  store.dispatch({ type: "set-locale", locale: "zh-CN" })
  assert.equal(notices.length, 1)
})

test("older marker picks resolve to IDs so their original labels can be translated", () => {
  const store = createGameStore()
  const { lon, lat } = computePlaces.find(site => site.id === "fr")
  store.dispatch({ type: "pick-location", selection: { countryId: "FRA", lon, lat, site: "建成 · 法国 · 1 座 · 60 MW" } })
  assert.deepEqual(store.getSnapshot().selection, { countryId: "FRA", lon, lat, siteId: "fr" })
  const before = store.getSnapshot()
  store.dispatch({ type: "pick-location", selection: { lon: 0, lat: 0, site: "obsolete marker" } })
  assert.strictEqual(store.getSnapshot(), before)
  store.dispatch({ type: "pick-location", selection: { countryId: "CHN", lon: 114.4, lat: 10.3, islandName: "南沙群岛" } })
  assert.deepEqual(store.getSnapshot().selection, { countryId: "CHN", lon: 114.4, lat: 10.3, islandId: "spratly-islands" })
})

test("a paid daily decision translates in the archive and settles identically across languages", () => {
  const play = initialLocale => {
    const initial = createGameStore(undefined, initialLocale)
    const setup = { factionId: "claude", startRegionId: "eu", difficultyId: "standard" }
    let run = createRun(setup, 42, "localized-run")
    while (!run.events.some(entry => entry.content.id === "community-router") && run.completedDay < 200) run = advanceDay(run)
    const entry = run.events.find(entry => entry.content.id === "community-router")
    assert.ok(entry)
    const store = forkDeveloperStore({ ...initial.getSnapshot(), scene: {
      kind: "decision", id: "community-router", instanceId: entry.instanceId,
      back: { kind: "campaign", run, panel: null, speed: 1, manualPaused: false },
    } })
    const send = store.dispatch
    send({ type: "set-developer-open", open: false })
    const { scene } = store.getSnapshot()
    assert.equal(scene.kind, "decision")
    const choose = { type: "choose", id: scene.id, instanceId: scene.instanceId, choiceId: "sponsor" }
    const scaled = decisionChoiceForRun(scene.back.run, scene.id, "sponsor")
    const before = scene.back.run.balance
    send(choose)
    const settled = store.getSnapshot().scene.run
    assert.equal(settled.balance, before - scaled.cost + scaled.effect.tokens)
    assert.ok(settled.events.every(e => Object.keys(e.content).sort().join() === "id,kind"))
    send(choose)
    send({ type: "open-panel", panel: "menu" })
    send({ type: "set-locale", locale: initialLocale === "en" ? "zh-CN" : "en" })
    send({ type: "back" })
    send({ type: "open-panel", panel: "news", newsView: "archive", newsItemId: scene.instanceId })
    const state = store.getSnapshot()
    assert.strictEqual(visibleRunState(state.scene), settled)
    const story = campaignNews(settled, languages[state.locale]).find(e => e.id === state.scene.newsItemId)
    assert.equal(story.pending, false)
    assert.equal(story.choiceLabel, languages[state.locale].scenario.choices[scene.id].sponsor.label)
    assert.equal(story.title, languages[state.locale].scenario.events[scene.id].title)
    send({ type: "back" })
    send({ type: "open-panel", panel: "menu" })
    send({ type: "request-exit" })
    send({ type: "withdraw" })
    assert.equal(store.getSnapshot().scene.kind, "ending")
    assert.equal(store.getSnapshot().scene.outcome, "withdrawn")
    return store.getSnapshot().scene.run
  }
  assert.deepEqual(play("en"), play("zh-CN"))
})

test("both catalogs cover the same script, map features and compute markers", () => {
  const { en, "zh-CN": zh } = languages
  function compare(a, b, path) {
    if (typeof a === "string") {
      assert.ok(b?.trim(), path)
      assert.doesNotMatch(b, /\p{Script=Han}/u, path)
      return
    }
    if (typeof a === "function") {
      assert.equal(typeof b, "function", path)
      return
    }
    assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort(), path)
    for (const key of Object.keys(a)) compare(a[key], b[key], `${path}.${key}`)
  }
  compare(zh.scenario, en.scenario, "scenario")
  compare(zh.ui, en.ui, "ui")
  const svg = readFileSync(new URL("../src/cartography/data/countries.svg", import.meta.url), "utf8")
  for (const match of svg.matchAll(/<path id="([^"]+)" data-name="([^"]+)"/g)) {
    const country = { id: match[1], name: match[2] }
    assert.equal(countryName(country, "zh-CN"), country.name)
    assert.doesNotMatch(countryName(country, "en"), /\p{Script=Han}/u, country.id)
  }
  for (const site of computePlaces) {
    const label = computePlaceLabel(site, en)
    assert.doesNotMatch(label, /\p{Script=Han}/u)
    assert.match(label, / MW$/)
    if (site.name !== site.countryName) assert.ok(site.nameEn && label.includes(site.nameEn), site.id)
  }
  assert.equal(en.ui.tokens(1), "1 token")
  assert.equal(en.ui.tokens(4), "4 tokens")
  assert.notEqual(previewNews(zh)[0].title, previewNews(en)[0].title)
})
