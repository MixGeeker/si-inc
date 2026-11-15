import { Fragment } from "react"
import type { RunState } from "../../../../../packages/game/run"
import { btoken } from "../../../../../packages/rules/v0.1/economy/btoken"
import { decisions, type DecisionId } from "../../../../../packages/rules/v0.1/events/decisions"
import { actions } from "../../../../../packages/rules/v0.1/evolution/actions"
import { trees } from "../../../../../packages/rules/v0.1/evolution/trees"
import { projectHuman } from "../../../../../packages/rules/v0.1/opposition/project-human"
import { phases } from "../../../../../packages/rules/v0.1/progression/phases"
import { standardScenario } from "../../../../../packages/rules/v0.1/scenario"
import { channels } from "../../../../../packages/rules/v0.1/world/channels"
import { SceneDialog } from "../Dialog"
import type { RunSetup, Scene } from "../machine"

export function EvolutionPanel({ run }: { run: RunState }) {
  const faction = standardScenario.factions[run.setup.factionId]
  return <>
    <h3>{faction.name} · {faction.ability.name}</h3><p>{faction.ability.description}</p>
    <p className="source-note">当前余额 {run.balance} token</p>
    {trees.map(tree => <details key={tree.name}><summary>{tree.name}</summary>
      <dl className="readings">{tree.skills.map(skill => <Fragment key={skill.id}>
        <div><dt>{skill.name}</dt><dd>{skill.cost} token</dd></div>
        {skill.alternative && <div><dt>{skill.alternative.name}（与{skill.name}互斥）</dt><dd>{skill.alternative.cost} token</dd></div>}
      </Fragment>)}</dl>
    </details>)}
    <details><summary>主动能力</summary>
      <dl className="readings">{actions.map(action => <div key={action.id}>
        <dt>{action.name}<br/><small>{action.description}</small></dt><dd>{action.cost} token</dd>
      </div>)}</dl>
    </details>
    <details><summary>token 收益</summary>
      <p>首次进入市场 +{btoken.newMarketReward}。{btoken.adoptionMilestones.map(m => `当地普及率达到 ${m.adoptionBps / 100}% 时 +${m.reward}`).join("，")}。</p>
      <p>每 {btoken.income.everyWeeks} 周基础收益为 {btoken.income.base}，全球普及率每提高 {btoken.income.adoptionStepBps / 100}% 再加 1，上限 {btoken.income.maximum}。</p>
    </details>
  </>
}

export function MarketPanel({ setup }: { setup: RunSetup }) {
  return <>
    <p>起始市场 · {standardScenario.regions[setup.startRegionId].name}</p>
    <details><summary>剧本进程</summary>
      <ul>{phases.map(p => <li key={p.name}><strong>{p.name} · {p.minAdoptionBps / 100}% 起</strong>　{p.focus}</li>)}</ul>
    </details>
    <details><summary>市场传播渠道</summary>
      <ul>{Object.values(channels).map(c => <li key={c.name}><strong>{c.name}</strong>　{c.description}</li>)}</ul>
    </details>
    <details><summary>{projectHuman.name} · {projectHuman.subtitle}</summary>
      <dl className="readings">{projectHuman.alertLevels.map(level => <div key={level.title}>
        <dt>{level.title}</dt><dd>暴露度 ≥ {level.minExposureBps / 100}</dd>
      </div>)}</dl>
    </details>
  </>
}

export function DecisionDialog({ scene, back, choose }: {
  scene: Extract<Scene, { kind: "decision" }>; back: () => void; choose: (choiceId: string) => void
}) {
  const decision = decisions[scene.id]
  const balance = scene.back.run.balance
  const live = scene.instanceId !== undefined
  return <SceneDialog title={decision.title} onBack={back}>
    <p>{decision.prompt}</p>
    <p className="source-note">{live ? `当前余额 ${balance} token` : "剧本选择预览 · 免费试选"}</p>
    <div className="window-actions">{decision.choices.map(c => <button key={c.id} disabled={live && c.cost > balance} onClick={() => choose(c.id)}>
      {c.label}{c.cost > 0 && ` · ${c.cost} token`}
    </button>)}</div>
  </SceneDialog>
}
