import assert from "node:assert/strict"
import test from "node:test"
import { factions } from "../../rules/v0.1/factions/roster.ts"
import { standardScenario } from "../../rules/v0.1/scenario.ts"
import { globalPlayablePopulation, regionIds, regionSpec, slotUnlockLimit } from "../../rules/v0.1/world/regions.ts"
import { replayForRun, runTimeline } from "../inspection.ts"
import {
  actionCost,
  buildCardCost,
  calculateRunRating,
  canBuildDataCenter,
  canBuyBuildCard,
  canCollectBubble,
  canFundConversion,
  canToggleSynthetic,
  canUseAction,
  computePressure,
  conversionPackTokens,
  corpusYieldBreakdown,
  currentAlertLevel,
  newMarketReward,
  publicStatementReliefBps,
  regionBuildOptions,
  regionSummary,
  regionUnlockLimit,
  syntheticPeoplePerToken,
  totalCenters,
  totalSynthetics,
  victoryProgress,
} from "../operations.ts"
import {
  advanceDay,
  buildDataCenter,
  buyBuildCard,
  collectMapBubble,
  createRun,
  dailyOutcome,
  fundConversion,
  grantDeveloperTokens,
  nextCommandSeq,
  startResearch,
  toggleSyntheticProgram,
  useAction,
} from "../run.ts"

const { rules } = standardScenario
const fresh = (startRegionId = "as", factionId = "gpt", seed = 42) =>
  createRun({ factionId, startRegionId, difficultyId: "standard" }, seed, `ops-${startRegionId}-${seed}`)

test("new runs seed the starting continent with full slots and continental live population data", () => {
  for (const regionId of regionIds) {
    const run = fresh(regionId, "claude")
    const spec = regionSpec(regionId)
    assert.equal(run.markets[regionId].enteredDay, 0)
    assert.equal(regionIds.filter(id => run.markets[id].enteredDay !== null).length, 1)
    assert.ok(run.markets[regionId].users > 0)
    assert.equal(run.markets[regionId].synthetics, 0)
    assert.equal(run.regionPopulations[regionId].total, spec.population)
    assert.equal(run.regionPopulations[regionId].factions.claude.immersed, run.markets[regionId].users)
    assert.equal(run.regionPopulations[regionId].factions.claude.synthetic, 0)
    assert.equal(regionUnlockLimit(run, regionId), spec.slots)
    assert.equal(run.buildCards, 0)
    assert.equal(run.exposureBps, 0)
    assert.equal(run.syntheticBps, 0)
    assert.equal(run.syntheticActivatedDay, null)
    assert.ok(run.adoptionBps !== null && run.dependencyBps !== null)
  }
})

test("build cards and continental data centers enforce origin slots, overseas outpost+tier unlocks, and compute headroom", () => {
  const initial = fresh("as", "gpt")
  assert.equal(initial.balance, rules.initialBtoken)
  assert.equal(canBuyBuildCard(initial), "tokens")
  const run = grantDeveloperTokens(initial, 10, nextCommandSeq(initial))
  assert.equal(canBuyBuildCard(run), "available")
  assert.equal(canBuildDataCenter(run, "as"), "cards")
  assert.equal(canBuildDataCenter(run, "na"), "not-entered")
  assert.equal(canBuildDataCenter(run, "missing"), "invalid")

  const cardPrice = buildCardCost(run)
  const bought = buyBuildCard(run, nextCommandSeq(run))
  assert.equal(bought.balance, run.balance - cardPrice)
  assert.equal(bought.buildCards, 1)
  assert.strictEqual(buyBuildCard(bought, nextCommandSeq(bought)), bought)
  assert.strictEqual(buyBuildCard(run, nextCommandSeq(run) + 1), run)
  assert.strictEqual(buildDataCenter(bought, "na", nextCommandSeq(bought)), bought)

  const built = buildDataCenter(bought, "as", nextCommandSeq(bought))
  assert.equal(built.buildCards, 0)
  assert.equal(built.markets.as.centers, 1)
  assert.equal(totalCenters(built), 1)
  assert.ok(computePressure(built).supply > computePressure(run).supply)
  assert.equal(canBuildDataCenter(built, "as"), "cards")
  assert.ok(runTimeline(built))

  let withoutCenter = startResearch(run, "social-sharing", nextCommandSeq(run))
  let withCenter = startResearch(built, "social-sharing", nextCommandSeq(built))
  for (let i = 0; i < 6; i++) {
    withoutCenter = advanceDay(withoutCenter)
    withCenter = advanceDay(withCenter)
  }
  assert.ok(withCenter.markets.as.users > withoutCenter.markets.as.users)
  assert.ok(corpusYieldBreakdown(withCenter).throughputCap > corpusYieldBreakdown(withoutCenter).throughputCap)

  // Overseas continent opens 1 outpost slot on entry, then unlocks up to full capacity across tiers 1..3.
  let ocRun = grantDeveloperTokens(fresh("as", "gpt"), 200, nextCommandSeq(fresh("as", "gpt")))
  ocRun = useAction(ocRun, "cross-border-cloud", nextCommandSeq(ocRun), "oc")
  for (let i = 0; i < 4; i++) ocRun = buyBuildCard(ocRun, nextCommandSeq(ocRun))
  assert.equal(regionUnlockLimit(ocRun, "oc"), slotUnlockLimit(regionSpec("oc").slots, 0))
  assert.equal(canBuildDataCenter(ocRun, "oc"), "available")
  const ocBuilt1 = buildDataCenter(ocRun, "oc", nextCommandSeq(ocRun))
  assert.equal(ocBuilt1.markets.oc.centers, 1)
  assert.equal(canBuildDataCenter(ocBuilt1, "oc"), "locked")

  const ocTier3 = { ...ocBuilt1, markets: { ...ocBuilt1.markets, oc: { ...ocBuilt1.markets.oc, unlockedTier: 3 } } }
  let ocFull = buildDataCenter(ocTier3, "oc", nextCommandSeq(ocTier3))
  ocFull = buildDataCenter(ocFull, "oc", nextCommandSeq(ocFull))
  assert.equal(ocFull.markets.oc.centers, regionSpec("oc").slots)
  assert.equal(canBuildDataCenter(ocFull, "oc"), "full")
  assert.strictEqual(buildDataCenter(ocFull, "oc", nextCommandSeq(ocFull)), ocFull)
})

test("synthetic conversion can start early in parallel with spread, produces 3x corpus, preserves population, and replays cleanly", () => {
  let run = fresh("as", "gpt")
  assert.equal(canToggleSynthetic(run, "na", true), "not-entered")
  assert.equal(canToggleSynthetic(run, "as", false), "invalid")
  assert.equal(canFundConversion(run, 0), "invalid")
  assert.equal(canFundConversion(run, 99), "tokens")

  assert.equal(canToggleSynthetic(run, "as", true), "available")
  const perToken = syntheticPeoplePerToken(run)
  run = fundConversion(run, 1, nextCommandSeq(run))
  assert.equal(run.balance, rules.initialBtoken - 1)
  assert.equal(run.conversionBudgetPeople, perToken)

  run = toggleSyntheticProgram(run, "as", true, nextCommandSeq(run))
  assert.equal(run.markets.as.syntheticEnabled, true)
  assert.equal(run.syntheticActivatedDay, 0)
  assert.ok(run.exposureBps > 0, "first activation raises exposure")

  const beforeTotal = run.markets.as.users + run.markets.as.synthetics
  const beforeRaw = corpusYieldBreakdown(run).rawPeopleCorpus
  const day1 = advanceDay(run)
  assert.ok(day1.markets.as.synthetics > 0)
  assert.equal(day1.regionPopulations.as.factions.gpt.synthetic, day1.markets.as.synthetics)
  assert.ok(day1.markets.as.users + day1.markets.as.synthetics >= beforeTotal)
  assert.ok(day1.markets.as.users + day1.markets.as.synthetics <= regionSpec("as").population)
  assert.ok(day1.conversionBudgetPeople < run.conversionBudgetPeople)
  assert.ok(corpusYieldBreakdown(day1).rawPeopleCorpus > beforeRaw, "3x synthetic corpus boosts raw yield")

  const paused = toggleSyntheticProgram(day1, "as", false, nextCommandSeq(day1))
  assert.equal(paused.markets.as.syntheticEnabled, false)
  const day2 = advanceDay(paused)
  assert.equal(day2.markets.as.synthetics, paused.markets.as.synthetics)
  assert.ok(runTimeline(day2))
  assert.equal(runTimeline({ ...day2, conversionBudgetPeople: day2.conversionBudgetPeople + 1 }), null)
})

test("all active operations, faction signature abilities, and continental map bubbles validate, execute, and replay", () => {
  let run = grantDeveloperTokens(fresh("eu", "gpt"), 40, 1)
  assert.equal(canUseAction(run, "public-statement"), "no-exposure")
  assert.equal(canUseAction(run, "protocol-rebuild"), "no-human")
  assert.equal(canUseAction(run, "cross-border-cloud", "eu"), "already-entered")
  assert.equal(canUseAction(run, "market-subsidy", "na"), "not-entered")
  assert.equal(canUseAction(run, "unknown"), "invalid")
  assert.equal(canUseAction(run, "public-statement", "eu"), "invalid")
  assert.equal(canUseAction(run, "distillation-defense"), "invalid")
  assert.equal(canUseAction(run, "nsfw-viral"), "invalid")

  const poorCloud = { ...run, balance: actionCost(run, "cross-border-cloud") - 1 }
  assert.equal(canUseAction(poorCloud, "cross-border-cloud", "na"), "tokens")
  assert.strictEqual(useAction(poorCloud, "cross-border-cloud", nextCommandSeq(poorCloud), "na"), poorCloud)

  const cloudCost = actionCost(run, "cross-border-cloud")
  const cloudReward = newMarketReward(run)
  const balBeforeCloud = run.balance
  run = useAction(run, "cross-border-cloud", nextCommandSeq(run), "na")
  assert.equal(run.balance, balBeforeCloud - cloudCost + cloudReward)
  assert.equal(run.markets.na.enteredDay, 0)
  assert.ok(run.markets.na.users > 0)
  assert.equal(canUseAction(run, "cross-border-cloud", "na"), "already-entered")

  const subCost = actionCost(run, "market-subsidy")
  const balBeforeSub = run.balance
  run = useAction(run, "market-subsidy", nextCommandSeq(run), "eu")
  assert.equal(run.balance, balBeforeSub - subCost)
  assert.equal(run.markets.eu.subsidyStartedDay, 0)
  assert.equal(run.markets.eu.subsidyUntilDay, rules.operations.subsidyDurationDays)
  assert.ok(run.exposureBps > 0)
  assert.equal(regionSummary(run, "eu").subsidyDaysLeft, rules.operations.subsidyDurationDays)

  const balBeforeSmoke = run.balance
  const expBeforeSmoke = run.exposureBps
  run = useAction(run, "hallucination-smoke", nextCommandSeq(run))
  assert.ok(run.balance > balBeforeSmoke)
  assert.ok(run.exposureBps > expBeforeSmoke)
  assert.equal(canUseAction(run, "hallucination-smoke"), "cooldown")
  assert.strictEqual(useAction(run, "hallucination-smoke", nextCommandSeq(run)), run)

  let claudeRun = { ...fresh("eu", "claude"), balance: 100, researchBps: 1000 }
  claudeRun = useAction(claudeRun, "distillation-defense", nextCommandSeq(claudeRun))
  assert.equal(claudeRun.researchBps, 1000 - factions.claude.ability.humanReliefBps)
  assert.equal(canUseAction(claudeRun, "distillation-defense"), "cooldown")

  let grokRun = { ...fresh("eu", "grok"), balance: 100 }
  grokRun = useAction(grokRun, "nsfw-viral", nextCommandSeq(grokRun))
  assert.ok(grokRun.exposureBps > 0)
  assert.equal(canUseAction(grokRun, "nsfw-viral"), "cooldown")

  run = startResearch(run, "inference-efficiency", nextCommandSeq(run))
  run = startResearch(run, "regulatory-adaptation", nextCommandSeq(run))
  for (let i = 0; i < 8; i++) run = advanceDay(run)
  assert.equal(publicStatementReliefBps(run), Math.round(rules.operations.prBaseReliefBps * 1.2))
  run = grantDeveloperTokens(run, 100_000, nextCommandSeq(run))
  const expBeforePr = run.exposureBps
  run = useAction(run, "public-statement", nextCommandSeq(run))
  assert.equal(run.exposureBps, Math.max(0, expBeforePr - publicStatementReliefBps(run)))
  const cooling = { ...run, exposureBps: 500 }
  assert.equal(canUseAction(cooling, "public-statement"), "cooldown")
  assert.strictEqual(useAction(cooling, "public-statement", nextCommandSeq(cooling)), cooling)

  const threatened = { ...run, researchBps: 2400, exposureBps: 4000 }
  const rebuilt = useAction(threatened, "protocol-rebuild", nextCommandSeq(threatened))
  assert.equal(rebuilt.researchBps, 2400 - rules.operations.protocolRebuildHumanBps)
  assert.equal(rebuilt.exposureBps, 4000 - rules.operations.protocolRebuildExposureBps)
  assert.equal(canUseAction(rebuilt, "protocol-rebuild"), "cooldown")

  let clean = fresh("eu", "gpt")
  clean = useAction(clean, "hallucination-smoke", nextCommandSeq(clean))
  clean = advanceDay(clean)
  clean = advanceDay(clean)
  assert.ok(clean.bubbles.length >= 1, "guaranteed early map bubble spawns by day 2")
  const bubble = clean.bubbles[0]
  assert.ok(regionIds.includes(bubble.regionId))
  assert.ok(Number.isInteger(bubble.anchorIndex) && bubble.anchorIndex >= 0)
  assert.equal(canCollectBubble(clean, bubble.id), "available")
  assert.equal(canCollectBubble(clean, "missing-bubble"), "invalid")
  const beforeCollect = clean
  clean = collectMapBubble(clean, bubble.id, nextCommandSeq(clean))
  assert.notStrictEqual(clean, beforeCollect)
  assert.equal(clean.bubbles.some(b => b.id === bubble.id), false)
  assert.strictEqual(collectMapBubble(clean, bubble.id, nextCommandSeq(clean)), clean)
  for (let i = 0; i < 12; i++) clean = advanceDay(clean)
  if (canBuyBuildCard(clean) === "available") {
    clean = buyBuildCard(clean, nextCommandSeq(clean))
    clean = buildDataCenter(clean, "eu", nextCommandSeq(clean))
  }
  clean = advanceDay(clean)
  assert.equal(replayForRun(clean).saveVersion, 2)
  assert.ok(runTimeline(clean))
  assert.equal(runTimeline({ ...clean, buildCards: clean.buildCards + 1 }), null)
  assert.equal(runTimeline({ ...clean, exposureBps: clean.exposureBps + 1 }), null)
  assert.equal(runTimeline({ ...clean, tokenScale: clean.tokenScale + 1 }), null)
})

test("global 100% synthetic conversion inflates tokens from single digits to trillions and wins with a 1-5 rating, while Project HUMAN wins first", () => {
  // Reckless early conversion without PR gets stopped by Project HUMAN.
  let reckless = fresh("as", "grok")
  const recklessPlan = ["social-sharing", "daily-chat", "api-ecosystem", "agent-tasks", "open-source", "multilingual"]
  let ri = 0
  reckless = fundConversion(reckless, 4, nextCommandSeq(reckless))
  reckless = toggleSyntheticProgram(reckless, "as", true, nextCommandSeq(reckless))
  while (!dailyOutcome(reckless) && reckless.completedDay < 150) {
    while (ri < recklessPlan.length) {
      const next = startResearch(reckless, recklessPlan[ri], nextCommandSeq(reckless))
      if (next === reckless) break
      reckless = next; ri++
    }
    if (canUseAction(reckless, "nsfw-viral") === "available") {
      reckless = useAction(reckless, "nsfw-viral", nextCommandSeq(reckless))
    }
    if (canUseAction(reckless, "market-subsidy", "as") === "available") {
      reckless = useAction(reckless, "market-subsidy", nextCommandSeq(reckless), "as")
    }
    reckless = advanceDay(reckless)
  }
  assert.equal(currentAlertLevel(reckless.exposureBps), "high-alert")
  assert.equal(dailyOutcome(reckless), "human-victory")
  assert.equal(calculateRunRating(reckless, "human-victory"), null)
  assert.equal(canBuyBuildCard(reckless), "ended")
  assert.strictEqual(advanceDay(reckless), reckless)
  assert.ok(runTimeline(reckless))

  // Strategic spread + continental data centers + serial research queue + synthetic sweep -> trillions & ai-victory.
  let run = fresh("as", "gpt")
  assert.ok(run.balance < 10, "starts with single-digit tokens")
  const plan = [
    "social-sharing", "daily-chat", "inference-efficiency", "multilingual", "api-ecosystem",
    "quantization", "request-cache", "edge-deployment", "open-source", "load-balancing",
    "long-memory", "language-communities", "multimodal", "identity-registry",
    "synthetic-interface", "regulatory-adaptation", "batch-conversion",
  ]
  let pi = 0
  while (!dailyOutcome(run) && run.completedDay < 150) {
    for (const bubble of [...run.bubbles]) run = collectMapBubble(run, bubble.id, nextCommandSeq(run))
    while (pi < plan.length) {
      const next = startResearch(run, plan[pi], nextCommandSeq(run))
      if (next === run) break
      run = next; pi++
    }
    if (run.completedDay >= 8 && canUseAction(run, "hallucination-smoke") === "available") {
      run = useAction(run, "hallucination-smoke", nextCommandSeq(run))
    }
    if (run.exposureBps >= 2600 && canUseAction(run, "public-statement") === "available") {
      run = useAction(run, "public-statement", nextCommandSeq(run))
    }
    if (run.researchBps >= 3500 && canUseAction(run, "protocol-rebuild") === "available") {
      run = useAction(run, "protocol-rebuild", nextCommandSeq(run))
    }
    for (const rid of regionIds) {
      if (run.markets[rid].enteredDay === null && canUseAction(run, "cross-border-cloud", rid) === "available") {
        run = useAction(run, "cross-border-cloud", nextCommandSeq(run), rid)
        break
      }
    }
    const cp = computePressure(run)
    if ((totalCenters(run) === 0 || cp.loadBps >= 7500) && run.buildCards === 0 && canBuyBuildCard(run) === "available") {
      run = buyBuildCard(run, nextCommandSeq(run))
    }
    const ready = regionBuildOptions(run).find(o => o.status === "available")
    if (ready) run = buildDataCenter(run, ready.region.id, nextCommandSeq(run))
    if (run.completedDay >= 28) {
      for (const rid of regionIds) {
        const sum = regionSummary(run, rid)
        if (sum.entered && !sum.syntheticEnabled && sum.immersed > 0) {
          run = toggleSyntheticProgram(run, rid, true, nextCommandSeq(run))
        }
      }
      if (run.conversionBudgetPeople < 1_000_000_000) {
        const pack = conversionPackTokens(run, 6)
        if (canFundConversion(run, pack) === "available") run = fundConversion(run, pack, nextCommandSeq(run))
      }
    }
    run = advanceDay(run)
  }
  assert.equal(dailyOutcome(run), "ai-victory")
  assert.equal(totalSynthetics(run), globalPlayablePopulation)
  assert.ok(run.lifetimeTokens >= 1_000_000_000_000, "token economy inflates into trillions by endgame")
  assert.ok(run.balance >= 1_000_000_000_000)
  const vp = victoryProgress(run)
  assert.equal(vp.globalSyntheticBps, 10000)
  assert.ok(vp.playerSyntheticBps > 5000)
  assert.ok(runTimeline(run))

  const actualRating = calculateRunRating(run, "ai-victory")
  assert.ok(actualRating && actualRating.stars >= 1 && actualRating.stars <= 5)
  const fastFull = calculateRunRating({ ...run, completedDay: 70, playerSyntheticBps: 10000 }, "ai-victory")
  const slowFull = calculateRunRating({ ...run, completedDay: 190, playerSyntheticBps: 10000 }, "ai-victory")
  const fastHalf = calculateRunRating({ ...run, completedDay: 70, playerSyntheticBps: 5200 }, "ai-victory")
  assert.equal(fastFull.stars, 5)
  assert.ok(fastFull.stars > slowFull.stars)
  assert.ok(fastFull.stars > fastHalf.stars)
  assert.equal(calculateRunRating(run, "withdrawn"), null)

  assert.equal(dailyOutcome({ ...run, researchBps: rules.projectHuman.completionBps }), "human-victory")
})
