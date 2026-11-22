import {
  canUseAction,
  computePressure,
  corpusYieldBreakdown,
  currentAlertLevel,
  estimatedDailyTokenIncome,
  factionStandings,
  regionBuildOptions,
  regionSummary,
  totalCenters,
  type ComputeStatus,
  type RegionSummary,
} from "../../../../../packages/game/operations.ts"
import {
  headResearchProject,
  isProjectWaitingCorpus,
  projectRemainingDays,
  queuedResearchProjects,
  researchState,
} from "../../../../../packages/game/research.ts"
import type { RunState } from "../../../../../packages/game/run.ts"
import type { FactionId } from "../../../../../packages/rules/v0.1/factions/roster.ts"
import { standardScenario } from "../../../../../packages/rules/v0.1/scenario.ts"
import {
  globalPlayablePopulation,
  regionCapacity,
  regionIds,
  regionOfCountry,
  regionSpec,
  type RegionId,
} from "../../../../../packages/rules/v0.1/world/regions.ts"
import { computePlaces } from "../../cartography/compute-markers.ts"
import { languages, type Language } from "../../i18n/languages.ts"
import { previewSpeeds, type MapPanel } from "../machine.ts"

const empty = "—"
const globalReferenceSlots = regionIds.reduce((sum, id) => sum + regionCapacity(id), 0)
const globalComputeSites = computePlaces.reduce((sum, place) => sum + place.sites, 0)
const factionTotal = Object.keys(standardScenario.factions).length

export interface FactionBarSegment {
  readonly factionId: FactionId
  readonly isPlayer: boolean
  readonly immersedBps: number
  readonly syntheticBps: number
  readonly totalBps: number
  readonly centers: number
}

export interface FactionBarData {
  readonly segments: readonly FactionBarSegment[]
  readonly playerAdoptionBps: number
  readonly playerSyntheticBps: number
  readonly totalSyntheticBps: number
  readonly uncoveredBps: number
}

function buildBarData(run: RunState, regionId?: RegionId): FactionBarData {
  const denominator = regionId ? regionSpec(regionId).population : globalPlayablePopulation
  const standings = factionStandings(run, regionId)
  // Place player faction first (leftmost) so own growth reads cleanly left-to-right.
  const ordered = [...standings].sort((a, b) => Number(b.isPlayer) - Number(a.isPlayer) || (b.immersed + b.synthetics) - (a.immersed + a.synthetics))
  let usedBps = 0
  let playerAdoptionBps = 0
  let playerSyntheticBps = 0
  let totalSyntheticBps = 0
  const segments: FactionBarSegment[] = ordered.map(row => {
    const total = row.immersed + row.synthetics
    const synBps = denominator > 0 ? Math.min(10000, Math.round(row.synthetics * 10000 / denominator)) : 0
    const totBps = denominator > 0 ? Math.min(10000, Math.round(total * 10000 / denominator)) : 0
    const immBps = Math.max(0, totBps - synBps)
    usedBps += totBps
    totalSyntheticBps += synBps
    if (row.isPlayer) {
      playerAdoptionBps = totBps
      playerSyntheticBps = synBps
    }
    return {
      factionId: row.factionId,
      isPlayer: row.isPlayer,
      immersedBps: immBps,
      syntheticBps: synBps,
      totalBps: totBps,
      centers: row.centers,
    }
  })
  return {
    segments,
    playerAdoptionBps,
    playerSyntheticBps,
    totalSyntheticBps: Math.min(10000, totalSyntheticBps),
    uncoveredBps: Math.max(0, 10000 - usedBps),
  }
}

export function formatCompactPeople(count: number, locale: "zh-CN" | "en", number: Intl.NumberFormat): string {
  if (count <= 0) return "0"
  if (locale === "zh-CN") {
    if (count >= 1e8) return `${(count / 1e8).toFixed(count >= 1e9 ? 1 : 2)} 亿`
    if (count >= 1e4) return `${(count / 1e4).toFixed(count >= 1e6 ? 0 : 1)} 万`
    return number.format(count)
  }
  if (count >= 1e9) return `${(count / 1e9).toFixed(2)}B`
  if (count >= 1e6) return `${(count / 1e6).toFixed(count >= 1e8 ? 0 : 1)}M`
  if (count >= 1e3) return `${(count / 1e3).toFixed(0)}K`
  return number.format(count)
}

/** Compact inflated token display spanning single digits -> thousands -> millions -> billions -> trillions. */
export function formatCompactTokens(count: number, locale: "zh-CN" | "en", number: Intl.NumberFormat): string {
  const abs = Math.abs(count)
  const sign = count < 0 ? "−" : ""
  if (abs < 10_000) return `${sign}${number.format(abs)}`
  if (locale === "zh-CN") {
    if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(abs >= 1e14 ? 1 : 2)} 万亿`
    if (abs >= 1e8) return `${sign}${(abs / 1e8).toFixed(abs >= 1e10 ? 1 : 2)} 亿`
    return `${sign}${(abs / 1e4).toFixed(abs >= 1e6 ? 0 : 1)} 万`
  }
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(abs >= 1e14 ? 1 : 2)}T`
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(abs >= 1e11 ? 1 : 2)}B`
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(abs >= 1e8 ? 1 : 2)}M`
  return `${sign}${(abs / 1e3).toFixed(1)}K`
}

export interface CampaignAdvisor {
  readonly text: string
  readonly panel: MapPanel
  readonly urgent: boolean
}

export function advisorTargetPanel(run: RunState, computeStatus: ComputeStatus = computePressure(run).status): MapPanel {
  const queue = queuedResearchProjects(run)

  if (computeStatus === "critical" || computeStatus === "overloaded") return "actions"
  if (run.researchBps >= 4500 && canUseAction(run, "protocol-rebuild") === "available") return "actions"
  if (run.exposureBps >= 4000 && canUseAction(run, "public-statement") === "available") return "actions"
  if (queue.length === 0) return "overview"
  if (run.buildCards > 0 && regionBuildOptions(run).some(o => o.status === "available")) return "actions"
  const unentered = regionIds.find(id => run.markets[id].enteredDay === null)
  if (unentered && canUseAction(run, "cross-border-cloud", unentered) === "available") return "actions"
  if (run.syntheticActivatedDay !== null) return "world"
  return "actions"
}

function buildAdvisor(run: RunState, language: Language, computeLoadText: string, computeStatus: ComputeStatus): CampaignAdvisor {
  const { ui, percent } = language
  const research = researchState(run)
  const queue = queuedResearchProjects(run)

  if (computeStatus === "critical" || computeStatus === "overloaded") {
    return { text: ui.ops.advisor.overload(computeLoadText), panel: "actions", urgent: true }
  }
  if (run.researchBps >= 4500 && canUseAction(run, "protocol-rebuild") === "available") {
    return { text: ui.ops.advisor.highHuman(percent.format(run.researchBps / 10000)), panel: "actions", urgent: true }
  }
  if (run.exposureBps >= 4000 && canUseAction(run, "public-statement") === "available") {
    return { text: ui.ops.advisor.highExposure(percent.format(run.exposureBps / 10000)), panel: "actions", urgent: true }
  }
  if (queue.length === 0) {
    return { text: ui.ops.advisor.idleSlot(research.unlockedSlots), panel: "overview", urgent: false }
  }
  if (run.buildCards > 0 && regionBuildOptions(run).some(o => o.status === "available")) {
    return { text: ui.ops.advisor.deployCard(run.buildCards), panel: "actions", urgent: false }
  }
  const unentered = regionIds.find(id => run.markets[id].enteredDay === null)
  if (unentered && canUseAction(run, "cross-border-cloud", unentered) === "available") {
    return { text: ui.ops.advisor.expandMarket, panel: "actions", urgent: false }
  }
  if (run.syntheticActivatedDay !== null) {
    return {
      text: ui.ops.advisor.syntheticRace(percent.format(run.playerSyntheticBps / 10000), percent.format(run.syntheticBps / 10000)),
      panel: "world",
      urgent: false,
    }
  }
  if ((run.adoptionBps ?? 0) >= 2200) {
    return { text: ui.ops.advisor.trySynthetic, panel: "actions", urgent: false }
  }
  return { text: ui.ops.advisor.expandAndBuild, panel: "actions", urgent: false }
}

export function hudContent(
  run: RunState | null,
  globalView: boolean,
  language: Language = languages["zh-CN"],
  placeId: RegionId | null = null,
  countryId: string | null = null,
) {
  const { ui, scenario, locale, number, percent } = language
  if (run) {
    const { factions, rules } = standardScenario
    const yieldInfo = corpusYieldBreakdown(run)
    const alertId = currentAlertLevel(run.exposureBps)
    const compute = computePressure(run)
    const computeLoadText = percent.format(compute.loadBps / 10000)
    const opponents = Object.values(run.opponents)
    const regionMap = {} as Record<RegionId, RegionSummary>
    const regionBars = {} as Record<RegionId, FactionBarData>
    const rivalsByRegion = {} as Record<RegionId, readonly string[]>
    for (const id of regionIds) {
      regionMap[id] = regionSummary(run, id)
      regionBars[id] = buildBarData(run, id)
      rivalsByRegion[id] = opponents.filter(opponent => opponent.markets[id] !== null)
        .map(opponent => factions[opponent.factionId].name)
    }
    const adoptionText = run.adoptionBps === null ? empty : percent.format(run.adoptionBps / 10000)
    const syntheticText = percent.format(run.syntheticBps / 10000)
    const dailyTokens = estimatedDailyTokenIncome(run)
    const tokenText = formatCompactTokens(run.balance, locale, number)
    const tokenDailyText = ui.ops.tokenDaily(formatCompactTokens(dailyTokens, locale, number))
    const research = researchState(run)
    const queue = queuedResearchProjects(run)
    const head = headResearchProject(run)
    const headWaiting = head ? isProjectWaitingCorpus(run, head) : false
    const headRemainingDays = head ? projectRemainingDays(run, head, compute.researchWorkPerDay) : 0
    const yieldText = queue.length === 0
      ? `${ui.lab.daily(yieldInfo.totalDaily)} · ${ui.lab.idle}`
      : headWaiting
        ? `${ui.lab.daily(yieldInfo.totalDaily)} · ${ui.lab.queueWaitingSummary(queue.length)}`
        : `${ui.lab.daily(yieldInfo.totalDaily)} · ${ui.lab.queueSummary(queue.length, headRemainingDays)}`
    return {
      kind: "campaign" as const,
      playerFactionId: run.setup.factionId,
      date: ui.day(run.completedDay),
      overview: ui.research,
      speeds: rules.speedMultipliers,
      token: tokenText,
      tokenDetail: run.buildCards > 0 ? `${tokenDailyText} · ${ui.cards(number.format(run.buildCards))}` : tokenDailyText,
      cards: number.format(run.buildCards),
      buildCards: run.buildCards,
      centers: totalCenters(run),
      corpus: number.format(research.corpus),
      yieldText,
      adoptionText,
      syntheticText,
      syntheticActive: run.syntheticActivatedDay !== null,
      computeStatus: compute.status,
      computeLoadText,
      computeAlert: compute.status === "overloaded" || compute.status === "critical",
      worldStatus: ui.worldStatus(adoptionText, syntheticText, computeLoadText),
      worldStatusFull: ui.worldStatusFull(adoptionText, syntheticText, computeLoadText),
      advisor: buildAdvisor(run, language, computeLoadText, compute.status),
      dependencyText: run.dependencyBps === null ? empty : percent.format(run.dependencyBps / 10000),
      exposureBps: run.exposureBps,
      alertLabel: scenario.alerts[alertId],
      exposureText: `${ui.exposure} ${percent.format(run.exposureBps / 10000)} · ${scenario.alerts[alertId]}`,
      humanBps: run.researchBps,
      human: run.researchBps ? ui.lab.humanProgress(percent.format(run.researchBps / 10000)) : ui.humanInactive,
      globalBar: buildBarData(run),
      regionBars,
      regions: regionMap,
      rivalsByRegion,
    }
  }

  let siteCount = globalComputeSites
  let slotCount: number | null = globalReferenceSlots
  if (!globalView) {
    if (placeId) {
      siteCount = computePlaces.reduce((sum, p) => regionOfCountry(p.country) === placeId ? sum + p.sites : sum, 0)
      slotCount = regionCapacity(placeId)
    } else if (countryId) {
      siteCount = computePlaces.reduce((sum, p) => p.country === countryId ? sum + p.sites : sum, 0)
      const owner = regionOfCountry(countryId)
      slotCount = owner ? regionCapacity(owner) : null
    } else {
      siteCount = 0
      slotCount = null
    }
  }

  return {
    kind: "preview" as const,
    date: ui.mapPreviewTitle,
    speeds: previewSpeeds,
    marketValue: ui.marketCount(regionIds.length),
    factionDetail: ui.factionCount(factionTotal),
    metrics: [
      { icon: "lab-chip", label: ui.computeSites, value: ui.siteCount(siteCount) },
      { icon: "token", label: ui.capacity, value: slotCount === null ? empty : ui.slots(slotCount) },
    ],
  }
}

export type HudContent = ReturnType<typeof hudContent>
export type CampaignHud = Extract<HudContent, { kind: "campaign" }>
export type PreviewHud = Extract<HudContent, { kind: "preview" }>
