import { useEffect, useMemo, useState } from "react"
import {
  canBuyBuildCard,
  canFundConversion,
  canToggleSynthetic,
  canUseAction,
  corpusYieldBreakdown,
  countryBuildOptions,
  currentAlertLevel,
  publicStatementReliefBps,
  regionSummary,
  syntheticActivationExposureBps,
  syntheticPeoplePerToken,
  totalCenters,
  type ActionAvailability,
} from "../../../../../packages/game/operations"
import { nextCommandSeq, type RunState } from "../../../../../packages/game/run"
import { btoken } from "../../../../../packages/rules/v0.1/economy/btoken"
import { actions, type ActionId } from "../../../../../packages/rules/v0.1/evolution/actions"
import { standardScenario } from "../../../../../packages/rules/v0.1/scenario"
import { regionIds, type RegionId } from "../../../../../packages/rules/v0.1/world/regions"
import type { Atlas } from "../../cartography/atlas"
import { countryName } from "../../cartography/place-names"
import { useLanguage } from "../../i18n/useLanguage"
import { SceneDialog } from "../Dialog"
import { useGameStore } from "../GameContext"
import { formatCompactPeople } from "./hudContent"
import "./actions.css"

const { rules } = standardScenario
type OpsTab = "actions" | "synthetic" | "centers"

export function ActionsDialog({
  run,
  atlas,
  initialRegionId,
  back,
}: {
  run: RunState
  atlas: Atlas
  initialRegionId?: RegionId
  back: () => void
}) {
  const store = useGameStore()
  const { ui, scenario, locale, number, percent } = useLanguage()
  const enteredRegions = useMemo(() => regionIds.filter(id => run.markets[id].enteredDay !== null), [run.markets])
  const unenteredRegions = useMemo(() => regionIds.filter(id => run.markets[id].enteredDay === null), [run.markets])
  const [tab, setTab] = useState<OpsTab>("actions")
  const [filterRegion, setFilterRegion] = useState<RegionId | "all">(
    initialRegionId && run.markets[initialRegionId].enteredDay !== null ? initialRegionId : "all",
  )
  const [cloudTarget, setCloudTarget] = useState<RegionId | "">(unenteredRegions[0] ?? "")
  const [subsidyTarget, setSubsidyTarget] = useState<RegionId | "">(
    initialRegionId && run.markets[initialRegionId].enteredDay !== null ? initialRegionId : (enteredRegions[0] ?? ""),
  )

  useEffect(() => {
    if (!cloudTarget || !unenteredRegions.includes(cloudTarget)) setCloudTarget(unenteredRegions[0] ?? "")
  }, [cloudTarget, unenteredRegions])

  useEffect(() => {
    if (!subsidyTarget || !enteredRegions.includes(subsidyTarget)) setSubsidyTarget(enteredRegions[0] ?? "")
  }, [subsidyTarget, enteredRegions])

  const yieldInfo = corpusYieldBreakdown(run)
  const alertId = currentAlertLevel(run.exposureBps)
  const humanDailyBps = rules.projectHuman.dailyAdvanceBps[alertId]
  const cardStatus = canBuyBuildCard(run)
  const builtTotal = totalCenters(run)
  const perTokenPeople = syntheticPeoplePerToken(run)
  const firstActivationExp = syntheticActivationExposureBps(run)
  const buildOptions = useMemo(
    () => tab === "centers" ? countryBuildOptions(run, filterRegion === "all" ? undefined : filterRegion) : [],
    [run, filterRegion, tab],
  )

  function dispatchBuyCard() {
    store.dispatch({ type: "buy-build-card", runId: run.runId, completedDay: run.completedDay, seq: nextCommandSeq(run) })
  }

  function dispatchBuild(countryId: string) {
    store.dispatch({ type: "build-data-center", countryId, runId: run.runId, completedDay: run.completedDay, seq: nextCommandSeq(run) })
  }

  function dispatchFund(tokens: number) {
    store.dispatch({ type: "fund-conversion", tokens, runId: run.runId, completedDay: run.completedDay, seq: nextCommandSeq(run) })
  }

  function dispatchToggleSynthetic(regionId: RegionId, enabled: boolean) {
    store.dispatch({ type: "toggle-synthetic", regionId, enabled, runId: run.runId, completedDay: run.completedDay, seq: nextCommandSeq(run) })
  }

  function dispatchAction(abilityId: ActionId, targetRegionId?: RegionId) {
    store.dispatch({
      type: "use-action",
      abilityId,
      ...(targetRegionId ? { targetRegionId } : {}),
      runId: run.runId,
      completedDay: run.completedDay,
      seq: nextCommandSeq(run),
    })
  }

  function reasonLabel(status: ActionAvailability, cooldownDays?: number) {
    if (status === "cooldown" && cooldownDays && cooldownDays > 0) return ui.ops.cooldownDays(cooldownDays)
    if (status === "available") return null
    return ui.ops.unavailable[status]
  }

  return (
    <SceneDialog
      title={ui.ops.title}
      className="actions-dialog"
      onBack={back}
      headerDetail={<span className="ops-pill">{ui.tokens(run.balance)} · {ui.ops.ownedCards(run.buildCards)}</span>}
    >
      <dl className="ops-metrics">
        <div>
          <dt>{ui.ops.globalAdoption}</dt>
          <dd>{percent.format((run.adoptionBps ?? 0) / 10000)}</dd>
          <small>{ui.ops.syntheticGlobal} {percent.format(run.syntheticBps / 10000)}</small>
        </div>
        <div>
          <dt>{ui.ops.exposure}</dt>
          <dd>{percent.format(run.exposureBps / 10000)}</dd>
          <small>{scenario.alerts[alertId]}</small>
        </div>
        <div>
          <dt>{ui.lab.countermeasure}</dt>
          <dd>{percent.format(run.researchBps / 10000)}</dd>
          <small>{humanDailyBps > 0 ? ui.ops.humanDaily(percent.format(humanDailyBps / 10000)) : ui.humanInactive}</small>
        </div>
        <div>
          <dt>{ui.ops.rawCorpus}</dt>
          <dd>{ui.ops.rawCorpusUnit(formatCompactPeople(yieldInfo.rawPeopleCorpus, locale, number))}</dd>
          <small>{ui.ops.corpusBreakdown(yieldInfo.fixed, yieldInfo.populationCapped, yieldInfo.throughputCap)}</small>
        </div>
      </dl>

      <nav className="ops-main-tabs" aria-label={ui.ops.title}>
        <button type="button" aria-pressed={tab === "actions"} onClick={() => setTab("actions")}>{ui.ops.actionsSection}</button>
        <button type="button" aria-pressed={tab === "synthetic"} onClick={() => setTab("synthetic")}>{ui.ops.syntheticGlobal} · {percent.format(run.syntheticBps / 10000)}</button>
        <button type="button" aria-pressed={tab === "centers"} onClick={() => setTab("centers")}>{ui.ops.buildSection} ({builtTotal})</button>
      </nav>

      <div className="actions-scroll">
        {tab === "actions" && (
          <section className="ops-section">
            <div className="ops-actions-grid">
              {actions.map(action => {
                const target = action.id === "cross-border-cloud"
                  ? (cloudTarget || undefined)
                  : action.id === "market-subsidy"
                    ? (subsidyTarget || undefined)
                    : undefined
                const status = canUseAction(run, action.id, target)
                const prCooldown = Math.max(0, run.actionCooldowns.publicStatementUntilDay - run.completedDay)
                const rebuildCooldown = Math.max(0, run.actionCooldowns.protocolRebuildUntilDay - run.completedDay)
                const cooldown = action.id === "public-statement" ? prCooldown : action.id === "protocol-rebuild" ? rebuildCooldown : 0
                const effectText = action.id === "public-statement"
                  ? ui.ops.prEffect(percent.format(publicStatementReliefBps(run) / 10000))
                  : action.id === "market-subsidy"
                    ? ui.ops.subsidyEffect(rules.operations.subsidyDurationDays)
                    : action.id === "cross-border-cloud"
                      ? ui.ops.cloudEffect(btoken.newMarketReward)
                      : ui.ops.rebuildEffect(
                        percent.format(rules.operations.protocolRebuildHumanBps / 10000),
                        percent.format(rules.operations.protocolRebuildExposureBps / 10000),
                      )
                const reason = reasonLabel(status, cooldown)
                return (
                  <article className="ops-action-card" key={action.id}>
                    <div>
                      <div className="ops-action-head">
                        <strong>{scenario.actions[action.id].name}</strong>
                        <span className="ops-action-cost">{ui.tokens(action.cost)}</span>
                      </div>
                      <p className="ops-action-desc">{effectText}</p>
                    </div>
                    <div className="ops-action-controls">
                      {action.id === "cross-border-cloud" && (
                        <select
                          aria-label={ui.ops.targetMarket}
                          value={cloudTarget}
                          disabled={!unenteredRegions.length}
                          onChange={e => setCloudTarget(e.target.value as RegionId)}
                        >
                          {!unenteredRegions.length
                            ? <option value="">{ui.ops.noUnenteredMarkets}</option>
                            : unenteredRegions.map(id => (
                              <option key={id} value={id}>{scenario.regions[id]}</option>
                            ))}
                        </select>
                      )}
                      {action.id === "market-subsidy" && (
                        <select
                          aria-label={ui.ops.targetMarket}
                          value={subsidyTarget}
                          disabled={!enteredRegions.length}
                          onChange={e => setSubsidyTarget(e.target.value as RegionId)}
                        >
                          {!enteredRegions.length
                            ? <option value="">{ui.ops.noEnteredMarkets}</option>
                            : enteredRegions.map(id => {
                              const sum = regionSummary(run, id)
                              const extra = sum.subsidyDaysLeft > 0
                                ? ` · ${ui.ops.subsidyActive(sum.subsidyDaysLeft)}`
                                : ` · ${percent.format(sum.adoptionBps / 10000)}`
                              return <option key={id} value={id}>{scenario.regions[id]}{extra}</option>
                            })}
                        </select>
                      )}
                      <button
                        type="button"
                        disabled={status !== "available"}
                        onClick={() => dispatchAction(action.id, target)}
                      >
                        {ui.ops.execute}
                      </button>
                    </div>
                    {reason && <span className="ops-action-note">{reason}</span>}
                  </article>
                )
              })}
            </div>
          </section>
        )}

        {tab === "synthetic" && (
          <section className="ops-section">
            <p className="actions-subtitle">{ui.ops.syntheticHint}</p>
            <div className="ops-card-bar">
              <div>
                <strong>{ui.ops.conversionBudget} · {formatCompactPeople(run.conversionBudgetPeople, locale, number)}</strong>
                <p>{ui.ops.conversionRate(formatCompactPeople(perTokenPeople, locale, number))}</p>
              </div>
              <div className="ops-badges">
                {[1, 5, 10].map(tokens => {
                  const status = canFundConversion(run, tokens)
                  return (
                    <button key={tokens} type="button" disabled={status !== "available"} onClick={() => dispatchFund(tokens)}>
                      {ui.ops.fundTokens(tokens)}
                    </button>
                  )
                })}
              </div>
            </div>

            <ul className="ops-country-list">
              {enteredRegions.map(regionId => {
                const sum = regionSummary(run, regionId)
                const nextEnabled = !sum.syntheticEnabled
                const toggleStatus = canToggleSynthetic(run, regionId, nextEnabled)
                const firstTime = run.markets[regionId].syntheticActivatedDay === null
                return (
                  <li key={regionId} className={`ops-country-row${sum.syntheticEnabled ? " converting" : ""}`}>
                    <div className="ops-country-meta">
                      <div className="ops-country-title">
                        <strong>{scenario.regions[regionId]}</strong>
                        {sum.syntheticEnabled && <span className="ops-pill risk">{ui.ops.convertingActive}</span>}
                      </div>
                      <div className="ops-country-sub">
                        <span>{ui.ops.playerRegionAdoption} {percent.format(sum.adoptionBps / 10000)}</span>
                        <span>{ui.ops.playerRegionSynthetic} {percent.format(sum.syntheticBps / 10000)}</span>
                        <span>{ui.ops.immersedPeople} {formatCompactPeople(sum.immersed, locale, number)} / {formatCompactPeople(sum.synthetics, locale, number)}</span>
                      </div>
                      {firstTime && <span className="ops-action-note">{ui.ops.firstActivationNote(percent.format(firstActivationExp / 10000))}</span>}
                    </div>
                    <div>
                      <button
                        type="button"
                        disabled={toggleStatus !== "available"}
                        onClick={() => dispatchToggleSynthetic(regionId, nextEnabled)}
                      >
                        {nextEnabled ? ui.ops.startConversion : ui.ops.pauseConversion}
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {tab === "centers" && (
          <section className="ops-section">
            <div className="ops-card-bar">
              <p>{ui.ops.buyCardHint}</p>
              <div className="ops-badges">
                {cardStatus !== "available" && <span className="ops-action-note">{ui.ops.unavailable[cardStatus]}</span>}
                <button type="button" disabled={cardStatus !== "available"} onClick={dispatchBuyCard}>
                  {ui.ops.buyCard} · {ui.tokens(btoken.buildCardCost)}
                </button>
              </div>
            </div>

            <div className="ops-tabs" role="group" aria-label={ui.ops.targetMarket}>
              <button type="button" aria-pressed={filterRegion === "all"} onClick={() => setFilterRegion("all")}>
                {ui.ops.allContinents}
              </button>
              {enteredRegions.map(id => (
                <button key={id} type="button" aria-pressed={filterRegion === id} onClick={() => setFilterRegion(id)}>
                  {scenario.regions[id]}
                </button>
              ))}
            </div>

            {!buildOptions.length ? (
              <p className="ops-action-note">{ui.ops.noBuildable}</p>
            ) : (
              <ul className="ops-country-list">
                {buildOptions.slice(0, 24).map(option => {
                  const name = countryName(atlas.countryById.get(option.country.id), locale) ?? option.country.id
                  const { status } = option
                  const canBuild = status === "available"
                  return (
                    <li key={option.country.id} className={`ops-country-row${canBuild ? " ready" : ""}`}>
                      <div className="ops-country-meta">
                        <div className="ops-country-title">
                          <strong>{name}</strong>
                          <span className={`ops-pill${option.isOrigin || option.unlockedTier === 3 ? " gain" : ""}`}>
                            {option.isOrigin ? ui.ops.originBadge : ui.ops.tierBadge(option.unlockedTier)}
                          </span>
                        </div>
                        <div className="ops-country-sub">
                          <span>{scenario.regions[option.country.regionId]}</span>
                          <span>{ui.ops.playerRegionAdoption} {percent.format(option.adoptionBps / 10000)}</span>
                          <span>{ui.ops.playerRegionSynthetic} {percent.format(option.syntheticBps / 10000)}</span>
                          <span>{ui.ops.sharedCenters(option.centers, option.unlockedLimit, option.occupiedCenters, option.country.slots)}</span>
                          <span>{ui.ops.localCap(formatCompactPeople(option.localCapacity, locale, number))}</span>
                        </div>
                      </div>
                      <div>
                        <button type="button" disabled={!canBuild} onClick={() => dispatchBuild(option.country.id)}>
                          {canBuild ? ui.ops.buildHere : ui.ops.unavailable[status]}
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        )}
      </div>
    </SceneDialog>
  )
}
