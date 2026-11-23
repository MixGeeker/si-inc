import {
  actionCost,
  canUseAction,
  factionAbilityCooldownLeft,
  factionAbilityEffectDaysLeft,
  hallucinationWindfallTokens,
  newMarketReward,
  publicStatementReliefBps,
  regionSummary,
  type ActionAvailability,
} from "../../../../../packages/game/operations.ts"
import type { RunState } from "../../../../../packages/game/run.ts"
import type { ActionId } from "../../../../../packages/rules/v0.1/evolution/actions.ts"
import { factions, type FactionAbilityId } from "../../../../../packages/rules/v0.1/factions/roster.ts"
import { standardScenario } from "../../../../../packages/rules/v0.1/scenario.ts"
import { regionIds, type RegionId } from "../../../../../packages/rules/v0.1/world/regions.ts"
import { languages, type Language } from "../../i18n/languages.ts"
import { formatCompactTokens } from "./hudContent.ts"

export type SkillSlotShortcut = "skillSlot1" | "skillSlot2" | "skillSlot3" | "skillSlot4" | "skillSlot5"
export type RegionTargetedAbilityId = "market-subsidy" | "cross-border-cloud"
export type SkillBarAbilityId = FactionAbilityId | ActionId

export interface SkillSlotTarget {
  readonly regionId: RegionId
  readonly name: string
  readonly status: ActionAvailability
  readonly detail: string
  readonly subsidized: boolean
}

export interface SkillBarSlot {
  readonly slotIndex: 0 | 1 | 2 | 3 | 4
  readonly shortcutAction: SkillSlotShortcut
  readonly abilityId: SkillBarAbilityId
  readonly kind: "faction" | "global" | "region"
  readonly name: string
  readonly shortName: string
  readonly description: string
  readonly cost: number
  readonly costText: string
  readonly status: ActionAvailability
  readonly reason: string | null
  readonly cooldownDays: number
  readonly cooldownTotalDays: number
  readonly activeDays: number
  readonly targets: readonly SkillSlotTarget[]
}

const { rules } = standardScenario

export function isRegionTargetedAbility(id: SkillBarAbilityId): id is RegionTargetedAbilityId {
  return id === "market-subsidy" || id === "cross-border-cloud"
}

export function skillAbilityForSlot(run: RunState, slotIndex: 0 | 1 | 2 | 3 | 4): SkillBarAbilityId {
  if (slotIndex === 0) return factions[run.setup.factionId].ability.id
  if (slotIndex === 1) return "public-statement"
  if (slotIndex === 2) return "protocol-rebuild"
  if (slotIndex === 3) return "market-subsidy"
  return "cross-border-cloud"
}

function reasonForStatus(status: ActionAvailability, cooldownDays: number, language: Language): string | null {
  if (status === "available") return null
  if (status === "cooldown" && cooldownDays > 0) return language.ui.ops.cooldownDays(cooldownDays)
  return language.ui.ops.unavailable[status]
}

export function buildSkillBarSlots(run: RunState, language: Language = languages["zh-CN"]): readonly SkillBarSlot[] {
  const { ui, scenario, locale, number, percent } = language
  const fmtTok = (n: number) => formatCompactTokens(n, locale, number)

  const faction = factions[run.setup.factionId]
  const factionAbility = faction.ability
  const factionStatus = canUseAction(run, factionAbility.id)
  const factionCost = actionCost(run, factionAbility.id)
  const factionCd = factionAbilityCooldownLeft(run)
  const factionActive = factionAbilityEffectDaysLeft(run)
  const factionDesc = factionAbility.id === "hallucination-smoke"
    ? ui.ops.factionAbilityEffects["hallucination-smoke"](fmtTok(hallucinationWindfallTokens(run)), factionAbility.durationDays)
    : factionAbility.id === "distillation-defense"
      ? ui.ops.factionAbilityEffects["distillation-defense"](percent.format(factionAbility.humanReliefBps / 10000), factionAbility.durationDays)
      : ui.ops.factionAbilityEffects["nsfw-viral"](factionAbility.durationDays)

  const prCost = actionCost(run, "public-statement")
  const prStatus = canUseAction(run, "public-statement")
  const prCd = Math.max(0, run.actionCooldowns.publicStatementUntilDay - run.completedDay)

  const rebuildCost = actionCost(run, "protocol-rebuild")
  const rebuildStatus = canUseAction(run, "protocol-rebuild")
  const rebuildCd = Math.max(0, run.actionCooldowns.protocolRebuildUntilDay - run.completedDay)

  const subsidyCost = actionCost(run, "market-subsidy")
  const subsidyTargets: SkillSlotTarget[] = regionIds
    .filter(id => run.markets[id].enteredDay !== null)
    .map(id => {
      const sum = regionSummary(run, id)
      return {
        regionId: id,
        name: scenario.regions[id],
        status: canUseAction(run, "market-subsidy", id),
        detail: sum.subsidyDaysLeft > 0 ? ui.ops.subsidyActive(sum.subsidyDaysLeft) : percent.format(sum.adoptionBps / 10000),
        subsidized: sum.subsidyDaysLeft > 0,
      }
    })
  const subsidyStatus: ActionAvailability = subsidyTargets.length === 0
    ? "not-entered"
    : subsidyTargets.some(t => t.status === "available")
      ? "available"
      : subsidyTargets[0].status

  const cloudCost = actionCost(run, "cross-border-cloud")
  const cloudTargets: SkillSlotTarget[] = regionIds
    .filter(id => run.markets[id].enteredDay === null)
    .map(id => ({
      regionId: id,
      name: scenario.regions[id],
      status: canUseAction(run, "cross-border-cloud", id),
      detail: `+${fmtTok(newMarketReward(run))}`,
      subsidized: false,
    }))
  const cloudStatus: ActionAvailability = cloudTargets.length === 0
    ? "already-entered"
    : cloudTargets.some(t => t.status === "available")
      ? "available"
      : cloudTargets[0].status

  return [
    {
      slotIndex: 0,
      shortcutAction: "skillSlot1",
      abilityId: factionAbility.id,
      kind: "faction",
      name: scenario.factions[run.setup.factionId].ability.name,
      shortName: ui.ops.skillBar.shortNames[factionAbility.id],
      description: factionDesc,
      cost: factionCost,
      costText: fmtTok(factionCost),
      status: factionStatus,
      reason: reasonForStatus(factionStatus, factionCd, language),
      cooldownDays: factionCd,
      cooldownTotalDays: factionAbility.cooldownDays,
      activeDays: factionActive,
      targets: [],
    },
    {
      slotIndex: 1,
      shortcutAction: "skillSlot2",
      abilityId: "public-statement",
      kind: "global",
      name: scenario.actions["public-statement"].name,
      shortName: ui.ops.skillBar.shortNames["public-statement"],
      description: ui.ops.prEffect(percent.format(publicStatementReliefBps(run) / 10000)),
      cost: prCost,
      costText: fmtTok(prCost),
      status: prStatus,
      reason: reasonForStatus(prStatus, prCd, language),
      cooldownDays: prCd,
      cooldownTotalDays: rules.operations.prCooldownDays,
      activeDays: 0,
      targets: [],
    },
    {
      slotIndex: 2,
      shortcutAction: "skillSlot3",
      abilityId: "protocol-rebuild",
      kind: "global",
      name: scenario.actions["protocol-rebuild"].name,
      shortName: ui.ops.skillBar.shortNames["protocol-rebuild"],
      description: ui.ops.rebuildEffect(
        percent.format(rules.operations.protocolRebuildHumanBps / 10000),
        percent.format(rules.operations.protocolRebuildExposureBps / 10000),
      ),
      cost: rebuildCost,
      costText: fmtTok(rebuildCost),
      status: rebuildStatus,
      reason: reasonForStatus(rebuildStatus, rebuildCd, language),
      cooldownDays: rebuildCd,
      cooldownTotalDays: rules.operations.protocolRebuildCooldownDays,
      activeDays: 0,
      targets: [],
    },
    {
      slotIndex: 3,
      shortcutAction: "skillSlot4",
      abilityId: "market-subsidy",
      kind: "region",
      name: scenario.actions["market-subsidy"].name,
      shortName: ui.ops.skillBar.shortNames["market-subsidy"],
      description: ui.ops.subsidyEffect(rules.operations.subsidyDurationDays),
      cost: subsidyCost,
      costText: fmtTok(subsidyCost),
      status: subsidyStatus,
      reason: reasonForStatus(subsidyStatus, 0, language),
      cooldownDays: 0,
      cooldownTotalDays: 0,
      activeDays: 0,
      targets: subsidyTargets,
    },
    {
      slotIndex: 4,
      shortcutAction: "skillSlot5",
      abilityId: "cross-border-cloud",
      kind: "region",
      name: scenario.actions["cross-border-cloud"].name,
      shortName: ui.ops.skillBar.shortNames["cross-border-cloud"],
      description: ui.ops.cloudEffect(fmtTok(newMarketReward(run))),
      cost: cloudCost,
      costText: fmtTok(cloudCost),
      status: cloudStatus,
      reason: cloudTargets.length === 0 ? ui.ops.skillBar.allEntered : reasonForStatus(cloudStatus, 0, language),
      cooldownDays: 0,
      cooldownTotalDays: 0,
      activeDays: 0,
      targets: cloudTargets,
    },
  ]
}
