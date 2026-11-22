import { btoken } from "../../../../../packages/rules/v0.1/economy/btoken"
import { decisions } from "../../../../../packages/rules/v0.1/events/decisions"
import { actions } from "../../../../../packages/rules/v0.1/evolution/actions"
import { channelTechnologies, type Channel } from "../../../../../packages/rules/v0.1/evolution/market-effects"
import {
  corpusYieldBreakdown,
  currentAlertLevel,
  currentPhase,
  totalCenters,
  victoryProgress,
} from "../../../../../packages/game/operations"
import { completedLevel, researchAttributes, researchState } from "../../../../../packages/game/research"
import { decisionChoiceForRun, decisionChoiceStatus, decisionEffectForRun, type RunState } from "../../../../../packages/game/run"
import { projectHuman } from "../../../../../packages/rules/v0.1/opposition/project-human"
import { phases } from "../../../../../packages/rules/v0.1/progression/phases"
import { standardScenario } from "../../../../../packages/rules/v0.1/scenario"
import { useLanguage } from "../../i18n/useLanguage"
import { SceneDialog } from "../Dialog"
import type { Scene } from "../machine"
import { EventEffects } from "./EventEffects"
import { FactionStandings } from "./FactionStandings"
import { formatCompactPeople } from "./hudContent"
import "./narrative-events.css"

export function MarketPanel({ run }: { run: RunState }) {
  const { setup } = run
  const { ui, scenario, locale, percent, number } = useLanguage()
  const ability = scenario.factions[setup.factionId].ability
  const { income } = btoken
  const alertId = currentAlertLevel(run.exposureBps)
  const phaseId = currentPhase(run.adoptionBps ?? 0)
  const yieldInfo = corpusYieldBreakdown(run)
  const victory = victoryProgress(run)
  const globalSynthMet = victory.globalSyntheticBps >= victory.globalSyntheticTargetBps
  const playerShareMet = victory.playerHasMajority
  return <>
    <p>{ui.startMarket} · {scenario.regions[setup.startRegionId]} · {scenario.phases[phaseId].name}</p>
    <dl className="readings">
      <div><dt>{ui.ops.globalAdoption}</dt><dd>{percent.format((run.adoptionBps ?? 0) / 10000)}</dd></div>
      <div><dt>{ui.ops.syntheticGlobal}</dt><dd>{percent.format(run.syntheticBps / 10000)}</dd></div>
      <div><dt>{ui.ops.exposure}</dt><dd>{percent.format(run.exposureBps / 10000)} · {scenario.alerts[alertId]}</dd></div>
      <div><dt>{ui.ops.playerCenters}</dt><dd>{totalCenters(run)} · {ui.ops.ownedCards(run.buildCards)}</dd></div>
      <div><dt>{ui.ops.rawCorpus}</dt><dd>{ui.ops.rawCorpusUnit(formatCompactPeople(yieldInfo.rawPeopleCorpus, locale, number))}</dd></div>
      <div><dt>{ui.ops.corpusFlywheel}</dt><dd>{ui.ops.corpusBreakdown(yieldInfo.fixed, yieldInfo.populationCapped, yieldInfo.throughputCap)}</dd></div>
    </dl>
    <FactionStandings run={run}/>
    <details open><summary>{ui.ops.victoryGoal}</summary>
      <ul className="victory-list">
        <li className={globalSynthMet ? "met" : undefined}>{globalSynthMet ? "✓ " : "○ "}{ui.ops.victoryGlobalSynthetic(percent.format(victory.globalSyntheticBps / 10000), percent.format(victory.globalSyntheticTargetBps / 10000))}</li>
        <li className={playerShareMet ? "met" : undefined}>{playerShareMet ? "✓ " : "○ "}{ui.ops.victoryPlayerShare(percent.format(victory.playerSyntheticBps / 10000), percent.format(victory.playerSyntheticTargetBps / 10000))}</li>
      </ul>
    </details>
    <details><summary>{standardScenario.factions[setup.factionId].name} · {ability.name}</summary><p>{ability.description}</p></details>
    <details><summary>{ui.activeAbilities}</summary>
      <dl className="readings">{actions.map(action => <div key={action.id}>
        <dt>{scenario.actions[action.id].name}<br/><small>{scenario.actions[action.id].description}</small></dt><dd>{ui.tokens(action.cost)}</dd>
      </div>)}</dl>
    </details>
    <details><summary>{ui.income}</summary>
      <p>{ui.firstMarket(btoken.newMarketReward)} {btoken.adoptionMilestones.map(m => ui.milestone(percent.format(m.adoptionBps / 10000), m.reward)).join(" ")}</p>
      <p>{ui.incomeRule(income.everyDays, ui.tokens(income.base), percent.format(income.adoptionStepBps / 10000), ui.tokens(income.maximum))}</p>
      <p>{ui.profitFactor(number.format(researchAttributes(run).profit / 100))}</p>
    </details>
    <details><summary>{ui.phases}</summary>
      <ul>{phases.map(p => <li key={p.id}><strong>{scenario.phases[p.id].name} · {ui.phaseThreshold(percent.format(p.minAdoptionBps / 10000))}</strong> {scenario.phases[p.id].focus}</li>)}</ul>
    </details>
    <details><summary>{ui.channels}</summary>
      <ul>{(Object.keys(channelTechnologies) as Channel[]).map(id => {
        const c = scenario.channels[id], tech = channelTechnologies[id]
        return <li key={id}><strong>{c.name}</strong> · {completedLevel(run, tech) ? ui.lab.status.completed : ui.lab.requires}
          {" · "}{scenario.skills[tech]}<br/>{c.description}</li>
      })}</ul>
    </details>
    <details><summary>{projectHuman.name} · {scenario.humanSubtitle}</summary>
      <dl className="readings">{projectHuman.alertLevels.map(level => <div key={level.id}>
        <dt>{scenario.alerts[level.id]}</dt><dd>{ui.exposure} ≥ {percent.format(level.minExposureBps / 10000)}</dd>
      </div>)}</dl>
    </details>
  </>
}

export function DecisionDialog({ scene, back, choose, inspect }: {
  scene: Extract<Scene, { kind: "decision" }>; back: () => void; choose: (choiceId: string) => void; inspect?: () => void
}) {
  const { ui, scenario } = useLanguage()
  const story = scenario.events[scene.id]
  const decision = decisions[scene.id]
  const live = scene.instanceId !== undefined
  const run = scene.back.run
  const entry = run.events.find(event => event.instanceId === scene.instanceId)
  const detail = scenario.eventDetails[scene.id]
  return <SceneDialog title={story.title} className="narrative-dialog" onBack={back}
    headerDetail={<span className="narrative-status">{live ? ui.narrative.pending : ui.narrative.preview}</span>}>
    <img className="narrative-art" src={decision.image} alt={story.title}/>
    <div className="narrative-context">
      {entry && <span>{ui.day(entry.day)}</span>}
      <span>{ui.narrative.source} · {detail.source}</span>
      <span>{ui.narrative.scope} · {detail.scope}</span>
    </div>
    <p className="narrative-body">{story.body}</p>
    <DecisionChoices scene={scene} choose={choose}/>
    <footer className="narrative-footer">
      <button type="button" className="narrative-later" onClick={back}>{live ? ui.narrative.later : ui.close}</button>
      <span>{live ? ui.narrative.laterHint : ui.previewDecision}</span>
      {inspect && <button type="button" className="narrative-inspect" onClick={inspect}>{ui.developer.open}</button>}
    </footer>
  </SceneDialog>
}

export function DecisionChoices({ scene, choose }: {
  scene: Extract<Scene, { kind: "decision" }>; choose: (choiceId: string) => void
}) {
  const { ui, scenario, percent } = useLanguage()
  const decision = decisions[scene.id]
  const run = scene.back.run
  const live = scene.instanceId !== undefined
  return <>
    <div className="narrative-resources">
      <span>{ui.balance(ui.tokens(run.balance))}</span>
      <span>{ui.lab.corpusCount(researchState(run).corpus)}</span>
      <span>{ui.lab.humanProgress(percent.format(run.researchBps / 10000))}</span>
    </div>
    {!live && <p className="source-note">{ui.previewDecision}</p>}
    <div className="narrative-choices">{decision.choices.map(option => {
      const c = live ? decisionChoiceForRun(run, scene.id, option.id) : option
      if (!c) return null
      const status = live ? decisionChoiceStatus(run, scene.id, c.id) : "available"
      const unavailable = status !== "available"
      const forecast = decisionEffectForRun(run, scene.id, c.id)
      const label = scenario.choices[scene.id][c.id].label
      const endsRun = live && c.effect.humanBps > 0 && run.researchBps + c.effect.humanBps >= 10000
      const canDeliverFollowUp = !endsRun
      return <button type="button" className="narrative-choice" key={c.id} disabled={unavailable} onClick={() => choose(c.id)}>
        <span className="narrative-choice-title">{label}<span aria-hidden="true">↗</span></span>
        <span className="narrative-choice-copy">{scenario.choices[scene.id][c.id].result}</span>
        <span className="narrative-payment">{ui.narrative.cost} · {c.cost || c.corpusCost
          ? [c.cost ? ui.tokens(c.cost) : null, c.corpusCost ? ui.lab.corpusCount(c.corpusCost) : null].filter(Boolean).join(" / ")
          : ui.narrative.free}</span>
        {forecast && <span className="narrative-choice-outcome"><span>{ui.narrative.expected}</span><EventEffects effect={forecast}/></span>}
        {c.followUp && <span className="narrative-follow-up">{canDeliverFollowUp ? ui.narrative.followUpAfter(c.followUp.delayDays) : ui.narrative.followUpUnavailable}</span>}
        {endsRun && <span className="narrative-warning">{ui.narrative.endsRun}</span>}
        {unavailable && <span className="narrative-unavailable">{ui.narrative.unavailable[status]}</span>}
      </button>
    })}</div>
  </>
}
