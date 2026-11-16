import assert from "node:assert/strict"
import test from "node:test"
import { createRun } from "../../../packages/game/run.ts"
import { campaignNews, previewNews, tickerText, weekNews } from "../src/scenes/world/newsFeed.ts"

test("campaign news starts with the opening bulletin and week lists stay inside that week", () => {
  const run = createRun({ factionId: "gpt", startRegionId: "ea", difficultyId: "standard" }, 1)
  const items = campaignNews(run)
  assert.equal(items.length, 1)
  assert.equal(items[0].id, "opening")
  assert.equal(items[0].week, 0)
  assert.equal(items[0].title, "GPT 进入亚洲市场")
  assert.deepEqual(weekNews(items, 0), items)
  assert.deepEqual(weekNews(items, 1), [])
  assert.equal(tickerText(items[0], true), `第 0 周 · ${items[0].title}`)
})

test("preview news is the single map bulletin", () => {
  const items = previewNews()
  assert.equal(items.length, 1)
  assert.equal(items[0].id, "preview")
  assert.equal(tickerText(items[0], false), items[0].title)
})
