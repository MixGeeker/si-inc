import { btoken } from "../../../../../packages/rules/v0.1/economy/btoken"
import { decisions } from "../../../../../packages/rules/v0.1/events/decisions"
import { actions } from "../../../../../packages/rules/v0.1/evolution/actions"
import { channelTechnologies, type Channel } from "../../../../../packages/rules/v0.1/evolution/market-effects"
import { completedLevel, researchAttributes } from "../../../../../packages/game/research"
import type { RunState } from "../../../../../packages/game/run"
import { projectHuman } from "../../../../../packages/rules/v0.1/opposition/project-human"
import { phases } from "../../../../../packages/rules/v0.1/progression/phases"
import { standardScenario } from "../../../../../packages/rules/v0.1/scenario"
import { useLanguage } from "../../i18n/useLanguage"
import { SceneDialog } from "../Dialog"
import type { Scene } from "../machine"

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
  return <SceneDialog title={story.title} onBack={back}>
    <p>{story.body}</p><DecisionChoices scene={scene} choose={choose}/>
    {inspect && <button type="button" onClick={inspect}>{ui.developer.open}</button>}
  </SceneDialog>
}

export function DecisionChoices({ scene, choose }: {
  scene: Extract<Scene, { kind: "decision" }>; choose: (choiceId: string) => void
}) {
  const { ui, scenario } = useLanguage()
  const decision = decisions[scene.id]
  const balance = scene.back.run.balance
  const live = scene.instanceId !== undefined
  return <>
    <p className="source-note">{live ? ui.balance(ui.tokens(balance)) : ui.previewDecision}</p>
    <div className="window-actions">{decision.choices.map(c => <button key={c.id} disabled={live && c.cost > balance} onClick={() => choose(c.id)}>
      {scenario.choices[scene.id][c.id].label}{c.cost > 0 && ` · ${ui.tokens(c.cost)}`}
    </button>)}</div>
  </>
}
