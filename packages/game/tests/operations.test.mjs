import assert from "node:assert/strict"
import test from "node:test"
import { btoken } from "../../rules/v0.1/economy/btoken.ts"
import { factions } from "../../rules/v0.1/factions/roster.ts"
import { standardScenario } from "../../rules/v0.1/scenario.ts"
import { countrySpec, globalPlayablePopulation, originCountries } from "../../rules/v0.1/world/countries.ts"
import { regionIds } from "../../rules/v0.1/world/regions.ts"
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
  countryBuildOptions,
  countryUnlockLimit,
  currentAlertLevel,
  newMarketReward,
  publicStatementReliefBps,
  regionSummary,
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
  unlockResearchSlot,
  useAction,
} from "../run.ts"

const { rules } = standardScenario
const fresh = (startRegionId = "as", factionId = "gpt", seed = 42) =>
  createRun({ factionId, startRegionId, difficultyId: "standard" }, seed, `ops-${startRegionId}-${seed}`)

test("new runs seed the origin country with full local slots and live population map data", () => {
  for (const regionId of regionIds) {
    const run = fresh(regionId, "claude")
    const originId = originCountries[regionId]
    const spec = countrySpec(originId)
    assert.equal(run.markets[regionId].enteredDay, 0)
    assert.equal(regionIds.filter(id => run.markets[id].enteredDay !== null).length, 1)
    assert.ok(run.countries[originId].users > 0)
    assert.equal(run.countries[originId].synthetics, 0)
    assert.equal(run.countryPopulations[originId].total, spec.population)
    assert.equal(run.countryPopulations[originId].factions.claude.immersed, run.countries[originId].users)
    assert.equal(run.countryPopulations[originId].factions.claude.synthetic, 0)
    assert.equal(countryUnlockLimit(run, originId), spec.slots)
    assert.equal(run.buildCards, 0)
    assert.equal(run.exposureBps, 0)
    assert.equal(run.syntheticBps, 0)
    assert.equal(run.syntheticActivatedDay, null)
    assert.ok(run.adoptionBps !== null && run.dependencyBps !== null)
  }
})

test("build cards and data centers enforce origin slots, overseas 25/50/75 thresholds, compute headroom, and full-speed local capacity", () => {
  const initial = fresh("as", "gpt")
  assert.equal(initial.balance, rules.initialBtoken)
  assert.equal(canBuyBuildCard(initial), "tokens")
  const run = grantDeveloperTokens(initial, 10, nextCommandSeq(initial))
  assert.equal(canBuyBuildCard(run), "available")
  assert.equal(canBuildDataCenter(run, "CHN"), "cards")
  assert.equal(canBuildDataCenter(run, "JPN"), "locked")
  assert.equal(canBuildDataCenter(run, "USA"), "not-entered")
  assert.equal(canBuildDataCenter(run, "missing"), "invalid")

  const cardPrice = buildCardCost(run)
  const bought = buyBuildCard(run, nextCommandSeq(run))
  assert.equal(bought.balance, run.balance - cardPrice)
  assert.equal(bought.buildCards, 1)
  assert.strictEqual(buyBuildCard(bought, nextCommandSeq(bought)), bought)
  assert.strictEqual(buyBuildCard(run, nextCommandSeq(run) + 1), run)
  assert.strictEqual(buildDataCenter(bought, "JPN", nextCommandSeq(bought)), bought)
  assert.strictEqual(buildDataCenter(bought, "USA", nextCommandSeq(bought)), bought)

  const built = buildDataCenter(bought, "CHN", nextCommandSeq(bought))
  assert.equal(built.buildCards, 0)
  assert.equal(built.countries.CHN.centers, 1)
  assert.equal(totalCenters(built), 1)
  assert.ok(computePressure(built).supply > computePressure(run).supply)
  assert.equal(canBuildDataCenter(built, "CHN"), "cards")
  assert.ok(runTimeline(built))

  let withoutCenter = unlockResearchSlot(run, 1, nextCommandSeq(run))
  withoutCenter = startResearch(withoutCenter, "social-sharing", nextCommandSeq(withoutCenter))
  let withCenter = unlockResearchSlot(built, 1, nextCommandSeq(built))
  withCenter = startResearch(withCenter, "social-sharing", nextCommandSeq(withCenter))
  for (let i = 0; i < 6; i++) {
    withoutCenter = advanceDay(withoutCenter)
    withCenter = advanceDay(withCenter)
  }
  assert.ok(withCenter.countries.CHN.users > withoutCenter.countries.CHN.users)
  assert.ok(corpusYieldBreakdown(withCenter).throughputCap > corpusYieldBreakdown(withoutCenter).throughputCap)

  let jpRun = grantDeveloperTokens(fresh("as", "gpt"), 100, nextCommandSeq(fresh("as", "gpt")))
  jpRun = buyBuildCard(jpRun, nextCommandSeq(jpRun))
  jpRun = buyBuildCard(jpRun, nextCommandSeq(jpRun))
  jpRun = buyBuildCard(jpRun, nextCommandSeq(jpRun))
  const jpnPop = countrySpec("JPN").population
  const jp25 = {
    ...jpRun,
    countries: {
      ...jpRun.countries,
      JPN: { users: Math.ceil(jpnPop * 0.25), synthetics: 0, newlyConverted: 0, prevUsers: 0, retainedDays: 1, centers: 0, unlockedTier: 1, carry: 0, dependencyBps: 1000 },
    },
  }
  assert.equal(countryUnlockLimit(jp25, "JPN"), 1)
  assert.equal(canBuildDataCenter(jp25, "JPN"), "available")
  const jpBuilt1 = buildDataCenter(jp25, "JPN", nextCommandSeq(jp25))
  assert.equal(jpBuilt1.countries.JPN.centers, 1)
  assert.equal(canBuildDataCenter(jpBuilt1, "JPN"), "locked")
  const jp75 = { ...jpBuilt1, countries: { ...jpBuilt1.countries, JPN: { ...jpBuilt1.countries.JPN, unlockedTier: 3 } } }
  const jpBuilt2 = buildDataCenter(jp75, "JPN", nextCommandSeq(jp75))
  assert.equal(jpBuilt2.countries.JPN.centers, 2)
  assert.equal(canBuildDataCenter(jpBuilt2, "JPN"), "full")
  assert.strictEqual(buildDataCenter(jpBuilt2, "JPN", nextCommandSeq(jpBuilt2)), jpBuilt2)
})

test("synthetic conversion can start early in parallel with spread, produces 3x corpus, preserves population, and replays cleanly", () => {
  let run = fresh("as", "gpt")
  assert.equal(canToggleSynthetic(run, "na", true), "not-entered")
  assert.equal(canToggleSynthetic(run, "as", false), "invalid")
  assert.equal(canFundConversion(run, 0), "invalid")
  assert.equal(canFundConversion(run, 99), "tokens")

  // Start conversion immediately on Day 0 (well below 100% adoption) just like Plague Inc. early lethality.
  assert.equal(canToggleSynthetic(run, "as", true), "available")
  const perToken = syntheticPeoplePerToken(run)
  run = fundConversion(run, 1, nextCommandSeq(run))
  assert.equal(run.balance, rules.initialBtoken - 1)
  assert.equal(run.conversionBudgetPeople, perToken)

  run = toggleSyntheticProgram(run, "as", true, nextCommandSeq(run))
  assert.equal(run.markets.as.syntheticEnabled, true)
  assert.equal(run.syntheticActivatedDay, 0)
  assert.ok(run.exposureBps > 0, "first activation raises exposure")

  const beforeTotal = run.countries.CHN.users + run.countries.CHN.synthetics
  const beforeRaw = corpusYieldBreakdown(run).rawPeopleCorpus
  const day1 = advanceDay(run)
  assert.ok(day1.countries.CHN.synthetics > 0)
  assert.equal(day1.countryPopulations.CHN.factions.gpt.synthetic, day1.countries.CHN.synthetics)
  assert.ok(day1.countries.CHN.users + day1.countries.CHN.synthetics >= beforeTotal)
  assert.ok(day1.countries.CHN.users + day1.countries.CHN.synthetics <= countrySpec("CHN").population)
  assert.ok(day1.conversionBudgetPeople < run.conversionBudgetPeople)
  assert.ok(corpusYieldBreakdown(day1).rawPeopleCorpus > beforeRaw, "3x synthetic corpus boosts raw yield")

  // Pausing stops further conversion while preserving existing synthetics.
  const paused = toggleSyntheticProgram(day1, "as", false, nextCommandSeq(day1))
  assert.equal(paused.markets.as.syntheticEnabled, false)
  const day2 = advanceDay(paused)
  assert.equal(day2.countries.CHN.synthetics, paused.countries.CHN.synthetics)
  assert.ok(runTimeline(day2))
  assert.equal(runTimeline({ ...day2, conversionBudgetPeople: day2.conversionBudgetPeople + 1 }), null)
})

test("all active operations and faction signature abilities validate preconditions, apply effects, respect cooldowns, and replay", () => {
  let run = grantDeveloperTokens(fresh("eu", "gpt"), 40, 1)
  assert.equal(canUseAction(run, "public-statement"), "no-exposure")
  assert.equal(canUseAction(run, "protocol-rebuild"), "no-human")
  assert.equal(canUseAction(run, "cross-border-cloud", "eu"), "already-entered")
  assert.equal(canUseAction(run, "market-subsidy", "na"), "not-entered")
  assert.equal(canUseAction(run, "unknown"), "invalid")
  assert.equal(canUseAction(run, "public-statement", "eu"), "invalid")
  // Other factions' signature abilities are rejected.
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
  assert.ok(run.countries.USA.users > 0)
  assert.equal(canUseAction(run, "cross-border-cloud", "na"), "already-entered")

  const subCost = actionCost(run, "market-subsidy")
  const balBeforeSub = run.balance
  run = useAction(run, "market-subsidy", nextCommandSeq(run), "eu")
  assert.equal(run.balance, balBeforeSub - subCost)
  assert.equal(run.markets.eu.subsidyStartedDay, 0)
  assert.equal(run.markets.eu.subsidyUntilDay, rules.operations.subsidyDurationDays)
  assert.ok(run.exposureBps > 0)
  assert.equal(regionSummary(run, "eu").subsidyDaysLeft, rules.operations.subsidyDurationDays)

  // GPT signature ability: Hallucination Smokescreen grants net token windfall, boosts spread, raises exposure, and enters cooldown.
  const balBeforeSmoke = run.balance
  const expBeforeSmoke = run.exposureBps
  run = useAction(run, "hallucination-smoke", nextCommandSeq(run))
  assert.ok(run.balance > balBeforeSmoke)
  assert.ok(run.exposureBps > expBeforeSmoke)
  assert.equal(canUseAction(run, "hallucination-smoke"), "cooldown")
  assert.strictEqual(useAction(run, "hallucination-smoke", nextCommandSeq(run)), run)

  // Claude signature ability pushes back Project HUMAN; Grok signature ability raises exposure.
  let claudeRun = { ...fresh("eu", "claude"), balance: 100, researchBps: 1000 }
  claudeRun = useAction(claudeRun, "distillation-defense", nextCommandSeq(claudeRun))
  assert.equal(claudeRun.researchBps, 1000 - factions.claude.ability.humanReliefBps)
  assert.equal(canUseAction(claudeRun, "distillation-defense"), "cooldown")

  let grokRun = { ...fresh("eu", "grok"), balance: 100 }
  grokRun = useAction(grokRun, "nsfw-viral", nextCommandSeq(grokRun))
  assert.ok(grokRun.exposureBps > 0)
  assert.equal(canUseAction(grokRun, "nsfw-viral"), "cooldown")

  run = unlockResearchSlot(run, 1, nextCommandSeq(run))
  run = startResearch(run, "inference-efficiency", nextCommandSeq(run))
  for (let i = 0; i < 2; i++) run = advanceDay(run)
  run = startResearch(run, "regulatory-adaptation", nextCommandSeq(run))
  for (let i = 0; i < 6; i++) run = advanceDay(run)
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

  // Clean replayable campaign sequence including map bubble collection and faction ability.
  let clean = fresh("eu", "gpt")
  clean = useAction(clean, "hallucination-smoke", nextCommandSeq(clean))
  clean = advanceDay(clean)
  clean = advanceDay(clean)
  assert.ok(clean.bubbles.length >= 1, "guaranteed early map bubble spawns by day 2")
  const bubble = clean.bubbles[0]
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
    clean = buildDataCenter(clean, "DEU", nextCommandSeq(clean))
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
  reckless = unlockResearchSlot(reckless, 1, nextCommandSeq(reckless))
  reckless = unlockResearchSlot(reckless, 2, nextCommandSeq(reckless))
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

  // Strategic spread + data centers + synthetic sweep starts at single-digit tokens and scales into trillions -> ai-victory.
  let run = fresh("as", "gpt")
  assert.ok(run.balance < 10, "starts with single-digit tokens")
  const plan = [
    "social-sharing", "daily-chat", "inference-efficiency", "multilingual", "api-ecosystem",
    "quantization", "request-cache", "edge-deployment", "open-source", "load-balancing",
    "long-memory", "language-communities", "multimodal", "identity-registry",
    "synthetic-interface", "regulatory-adaptation", "batch-conversion",
  ]
  let pi = 0
  run = unlockResearchSlot(run, 1, nextCommandSeq(run))
  run = unlockResearchSlot(run, 2, nextCommandSeq(run))
  while (!dailyOutcome(run) && run.completedDay < 150) {
    for (const bubble of [...run.bubbles]) run = collectMapBubble(run, bubble.id, nextCommandSeq(run))
    if (run.research.unlockedSlots < 3 && run.research.corpus >= 20) {
      run = unlockResearchSlot(run, run.research.unlockedSlots + 1, nextCommandSeq(run))
    }
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
    const ready = countryBuildOptions(run).find(o => o.status === "available")
    if (ready) run = buildDataCenter(run, ready.country.id, nextCommandSeq(run))
    if (run.completedDay >= 30) {
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

  // Verify 1-5 rating monotonicity: faster completion and higher player share both increase rating.
  const actualRating = calculateRunRating(run, "ai-victory")
  assert.ok(actualRating && actualRating.stars >= 1 && actualRating.stars <= 5)
  const fastFull = calculateRunRating({ ...run, completedDay: 70, playerSyntheticBps: 10000 }, "ai-victory")
  const slowFull = calculateRunRating({ ...run, completedDay: 190, playerSyntheticBps: 10000 }, "ai-victory")
  const fastHalf = calculateRunRating({ ...run, completedDay: 70, playerSyntheticBps: 5200 }, "ai-victory")
  assert.equal(fastFull.stars, 5)
  assert.ok(fastFull.stars > slowFull.stars)
  assert.ok(fastFull.stars > fastHalf.stars)
  assert.equal(calculateRunRating(run, "withdrawn"), null)

  // A simultaneous completion still goes to Project HUMAN.
  assert.equal(dailyOutcome({ ...run, researchBps: rules.projectHuman.completionBps }), "human-victory")
})
