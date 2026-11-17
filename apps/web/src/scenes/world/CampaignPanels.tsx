import { btoken } from "../../../../../packages/rules/v0.1/economy/btoken"
import { decisions } from "../../../../../packages/rules/v0.1/events/decisions"
import { actions } from "../../../../../packages/rules/v0.1/evolution/actions"
import { channelTechnologies, type Channel } from "../../../../../packages/rules/v0.1/evolution/market-effects"
import { completedLevel, researchAttributes, researchState } from "../../../../../packages/game/research"
import { decisionChoiceForRun, decisionChoiceStatus, decisionEffectForRun, type RunState } from "../../../../../packages/game/run"
import { projectHuman } from "../../../../../packages/rules/v0.1/opposition/project-human"
import { phases } from "../../../../../packages/rules/v0.1/progression/phases"
import { standardScenario } from "../../../../../packages/rules/v0.1/scenario"
import { useLanguage } from "../../i18n/useLanguage"
import { SceneDialog } from "../Dialog"
import type { Scene } from "../machine"
import { EventEffects } from "./EventEffects"
import "./narrative-events.css"

export function MarketPanel({ run }: { run: RunState }) {
  const { setup } = run
  const { ui, scenario, percent, number } = useLanguage()
  const ability = scenario.factions[setup.factionId].ability
  const { income } = btoken
  return <>
    <p>{ui.startMarket} · {scenario.regions[setup.startRegionId]}</p>
    <details><summary>{standardScenario.factions[setup.factionId].name} · {ability.name}</summary><p>{ability.description}</p></details>
    <details><summary>{ui.activeAbilities}</summary>
      <dl className="readings">{actions.map(action => <div key={action.id}>
        <dt>{scenario.actions[action.id].name}<br/><small>{scenario.actions[action.id].description}</small></dt><dd>{ui.tokens(action.cost)}</dd>
      </div>)}</dl>
    </details>
    <details><summary>{ui.income}</summary>
      <p>{ui.firstMarket(btoken.newMarketReward)} {btoken.adoptionMilestones.map(m => ui.milestone(percent.format(m.adoptionBps / 10000), m.reward)).join(" ")}</p>
      <p>{ui.incomeRule(income.everyWeeks, ui.tokens(income.base), percent.format(income.adoptionStepBps / 10000), ui.tokens(income.maximum))}</p>
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
  const legacy = live && run.eventVersion !== 1
  const detail = scenario.eventDetails[scene.id]
  return <SceneDialog title={story.title} className="narrative-dialog" onBack={back}
    headerDetail={<span className="narrative-status">{live ? ui.narrative.pending : ui.narrative.preview}</span>}>
    <img className="narrative-art" src={decision.image} alt={story.title}/>
    <div className="narrative-context">
      {entry && <span>{ui.week(entry.week)}</span>}
      <span>{ui.narrative.source} · {legacy ? ui.narrative.legacySource : detail.source}</span>
      <span>{ui.narrative.scope} · {legacy ? ui.narrative.legacyScope : detail.scope}</span>
    </div>
    <p className="narrative-body">{legacy ? ui.narrative.legacyBody : story.body}</p>
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
  const legacy = live && run.eventVersion !== 1
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
      const forecast = decisionEffectForRun(live ? run : { ...run, eventVersion: 1 }, scene.id, c.id)
      const label = legacy ? (c.id === "keep" ? ui.narrative.legacyKeep : ui.narrative.legacyRollback) : scenario.choices[scene.id][c.id].label
      const endsRun = live && !legacy && c.effect.humanBps > 0 && run.researchBps + c.effect.humanBps >= 10000
      const canDeliverFollowUp = !live || (c.followUp !== undefined && run.completedWeek + c.followUp.delayWeeks < standardScenario.rules.maxWeeks && !endsRun)
      return <button type="button" className="narrative-choice" key={c.id} disabled={unavailable} onClick={() => choose(c.id)}>
        <span className="narrative-choice-title">{label}<span aria-hidden="true">↗</span></span>
        {!legacy && <span className="narrative-choice-copy">{scenario.choices[scene.id][c.id].result}</span>}
        <span className="narrative-payment">{ui.narrative.cost} · {c.cost || c.corpusCost
          ? [c.cost ? ui.tokens(c.cost) : null, c.corpusCost ? ui.lab.corpusCount(c.corpusCost) : null].filter(Boolean).join(" / ")
          : ui.narrative.free}</span>
        {forecast && <span className="narrative-choice-outcome"><span>{ui.narrative.expected}</span><EventEffects effect={forecast}/></span>}
        {c.followUp && !legacy && <span className="narrative-follow-up">{canDeliverFollowUp ? ui.narrative.followUpAfter(c.followUp.delayWeeks) : ui.narrative.followUpUnavailable}</span>}
        {endsRun && <span className="narrative-warning">{ui.narrative.endsRun}</span>}
        {unavailable && <span className="narrative-unavailable">{ui.narrative.unavailable[status]}</span>}
      </button>
    })}</div>
  </>
}
