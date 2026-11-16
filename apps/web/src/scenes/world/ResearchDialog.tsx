import { useId, type KeyboardEvent, type ReactNode } from "react"
import { completedLevel, completionWeek, firstIdleSlot, researchAttributes, researchCost, researchLevels, researchState, researchStatus,
  slotProject, weeklyCorpus, type ResearchProject } from "../../../../../packages/game/research"
import { researchExample } from "../../../../../packages/game/market-research"
import { canUnlockSlot, nextCommandSeq, type RunState } from "../../../../../packages/game/run"
import { researchBuild, researchBuilds, type BuildId, type ResearchBuild } from "../../../../../packages/rules/v0.1/evolution/builds"
import { attributeIds, researchNode, researchNodes, trees, type ResearchNode, type SkillId, type SkillTree } from "../../../../../packages/rules/v0.1/evolution/trees"
import { standardScenario } from "../../../../../packages/rules/v0.1/scenario"
import { useLanguage } from "../../i18n/useLanguage"
import { SceneDialog } from "../Dialog"
import { useGameStore } from "../GameContext"
import { attributeIcons, LabIcon, TechHex, TechMap, treeIcons } from "./ResearchMap"
import { researchTier } from "./researchLayout"
import "./research.css"

const rules = standardScenario.rules.research
type SelectSkill = (id: SkillId) => void
const signed = (n: number) => n > 0 ? "+" + n : "−" + Math.abs(n)

function ModelReadout({ run }: { run: RunState }) {
  const { ui: { lab } } = useLanguage()
  const values = researchAttributes(run)
  return <section className="lab-model" aria-label={lab.model}>
    <h3>{lab.model}</h3>
    <dl>{attributeIds.map(id => <div key={id} className={`model-${id}`} title={lab.attrNotes[id]}>
      <dt><LabIcon name={attributeIcons[id]}/>{lab.attributes[id]}</dt><dd>{values[id]}</dd>
    </div>)}</dl>
  </section>
}

function TreePanel({ run, node, build, select, selectBuild }: {
  run: RunState; node: ResearchNode; build?: ResearchBuild; select: SelectSkill; selectBuild: (id: BuildId | null) => void
}) {
  const { ui: { lab }, scenario } = useLanguage()
  const prefix = useId()
  function changeTree(tree: SkillTree) {
    if (tree.id === node.tree.id) return
    const route: readonly SkillId[] | undefined = build?.path
    const routeSkills = tree.skills.filter(s => route?.includes(s.id))
    const pool = routeSkills.length ? routeSkills : tree.skills
    const first = (["active","available","upgradable"] as const).map(status =>
      pool.find(s => researchStatus(run, researchNode(s.id)) === status)).find(Boolean)
    select((first ?? pool[0]).id)
  }
  function moveTab(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = trees.length - 1
    const destination: Record<string, number> = { ArrowRight: (index + 1) % trees.length,
      ArrowLeft: (index + last) % trees.length, Home: 0, End: last }
    if (!Object.hasOwn(destination, e.key)) return
    e.preventDefault()
    const tree = trees[destination[e.key]]
    changeTree(tree)
    document.getElementById(`${prefix}-${tree.id}`)?.focus()
  }
  const remaining = build?.path.filter(id => !completedLevel(run, id))
  const blocked = remaining?.find(id => researchStatus(run, researchNode(id)) === "excluded")
  return <section className="lab-tree" aria-label={lab.tree}>
    <div className="lab-tree-head">
      <div className="lab-tabs" role="tablist" aria-label={lab.tree}>
        {trees.map((tree, i) => <button key={tree.id} id={`${prefix}-${tree.id}`} type="button" role="tab"
          aria-selected={tree.id === node.tree.id} tabIndex={tree.id === node.tree.id ? 0 : -1}
          aria-controls={`${prefix}-panel`} onKeyDown={e => moveTab(e, i)} onClick={() => changeTree(tree)}>
          <LabIcon name={treeIcons[tree.id]}/><span>{scenario.trees[tree.id]}</span>
          <small>{tree.skills.filter(s => completedLevel(run, s.id) > 0).length}/{tree.skills.length}</small>
        </button>)}
      </div>
      <label className="lab-build"><LabIcon name="lab-fork"/><span className="lab-sr">{lab.builds}</span>
        <select value={build?.id ?? ""} onChange={e => selectBuild(researchBuild(e.target.value)?.id ?? null)}>
          <option value="">{lab.allBuilds}</option>
          {researchBuilds.map(b => <option key={b.id} value={b.id}>{scenario.builds[b.id]}</option>)}
        </select></label>
    </div>
    <div className="lab-chart" id={`${prefix}-panel`} role="tabpanel" aria-labelledby={`${prefix}-${node.tree.id}`}>
      <div className="lab-chart-head"><h3>{lab.treeTitle(scenario.trees[node.tree.id])}</h3>
        <div className="lab-legend">{(["available", "active", "completed", "locked"] as const).map(s =>
          <span key={s} className={`key-${s}`}><i/>{lab.status[s]}</span>)}
          {node.tree.skills.some(s => researchStatus(run, researchNode(s.id)) === "excluded") &&
            <span className="key-excluded"><i/>{lab.status.excluded}</span>}</div>
      </div>
      <TechMap run={run} node={node} build={build} select={select}/>
      <div className="lab-map-foot">
        {build && remaining ? <><span className="lab-route-progress">{scenario.builds[build.id]} · {lab.routeProgress(build.path.length-remaining.length, build.path.length)}</span>
          {remaining.length > 0 && <button type="button" onClick={() => select(blocked ?? remaining[0])}>{blocked ? lab.status.excluded : lab.nextStudy} · {scenario.skills[blocked ?? remaining[0]]} ↗</button>}</>
        : <><span className="lab-repeat"><LabIcon name="lab-cycle"/>{lab.repeatable}</span><span className="lab-danger"><LabIcon name="lab-danger"/>{lab.dangerous}</span>
          <span className="lab-tier-key"><b aria-hidden="true">I / II</b>{lab.tierKey}</span></>}
        <span className="lab-pan-hint">↔ {lab.pan}</span>
      </div>
    </div>
    <ModelReadout run={run}/>
  </section>
}

function ProjectProgress({ run, project }: { run: RunState; project: ResearchProject }) {
  const { ui: { lab } } = useLanguage()
  return <span className="lab-progress"><span>{lab.remaining(completionWeek(project) - run.completedWeek)}</span>
    <progress aria-label={lab.status.active} value={run.completedWeek - project.startedWeek} max={researchNode(project.skillId).skill.weeks}/>
  </span>
}

function ProjectDetail({ run, node, start, unlock, select }: {
  run: RunState; node: ResearchNode; start: () => void; unlock: (slot: number) => void; select: SelectSkill
}) {
  const { ui: { lab }, scenario, number, percent } = useLanguage()
  const { skill, tree } = node, status = researchStatus(run, node)
  const research = researchState(run), cost = researchCost(run, node)
  const level = completedLevel(run, skill.id), nextSlot = research.unlockedSlots + 1, idle = firstIdleSlot(run)
  const project = research.projects.find(p => p.skillId === skill.id && completionWeek(p) > run.completedWeek)
  const example = researchExample(researchLevels(run), skill.id)
  const ready = status === "available" || status === "upgradable"
  const opens = researchNodes.filter(n => n.skill.requires.some(group => group.includes(skill.id)))
  const code = { transmission: "TR", behavior: "BH", capabilities: "CP" }[tree.id] + "-" +
    String(tree.skills.indexOf(skill) + 1).padStart(2, "0")

  function link(id: SkillId) {
    return <button type="button" key={id} className="lab-link" onClick={() => select(id)}>
      <LabIcon name={completedLevel(run, id) > 0 ? "lab-check" : treeIcons[researchNode(id).tree.id]}/>{scenario.skills[id]}<span aria-hidden="true">↗</span>
    </button>
  }
  let action: ReactNode
  if (project) {
    action = <><strong>{lab.inSlot(project.slot)}</strong><ProjectProgress run={run} project={project}/><p>{lab.resumeHint}</p></>
  } else if (ready && idle === null && nextSlot <= rules.slotCosts.length) {
    const price = rules.slotCosts[nextSlot - 1]
    action = <button className="lab-primary" type="button" disabled={!canUnlockSlot(run, nextSlot)} onClick={() => unlock(nextSlot)}>
      <LabIcon name="lab-lock"/>{lab.unlock(nextSlot)} · {research.corpus < price ? lab.shortfall(price - research.corpus) : lab.corpusCount(price)}
    </button>
  } else {
    const label = status === "locked" ? lab.needPrerequisite : status === "excluded" ? lab.branchClosed : status === "completed" ? lab.status.completed
      : idle === null ? lab.needSlot : research.corpus < cost ? lab.shortfall(cost-research.corpus) : status === "upgradable" ? lab.upgrade(level+1) : lab.start
    action = <button type="button" className="lab-primary" disabled={!ready || idle === null || research.corpus < cost} onClick={start}>
      <LabIcon name={ready ? "flask" : status === "completed" ? "lab-check" : "lab-lock"}/>{label}</button>
  }
  return <aside className="lab-detail" aria-label={scenario.skills[skill.id]}>
    <div className="lab-detail-scroll" key={skill.id}>
      <div className={`lab-detail-hero is-${status}`}><div className="lab-detail-id"><span>{code}</span><span>{scenario.trees[tree.id]} · {lab.tier(researchTier(skill))}</span></div>
        <TechHex skill={skill} status={status}/><span className={`lab-status is-${status}`}>{lab.status[status]}</span></div>
      <h3>{scenario.skills[skill.id]}</h3><p className="lab-description">{scenario.skillDescriptions[skill.id]}</p>
      <dl className="lab-specs"><div><dt>{lab.cost}</dt><dd>{lab.corpusCount(cost)}</dd></div>
        <div><dt>{lab.duration}</dt><dd>{lab.weeks(skill.weeks)}</dd></div>
        {skill.weeklyCorpusBonus && <div><dt>{lab.yieldBonus}</dt><dd>+{skill.weeklyCorpusBonus}</dd></div>}
      </dl>
      <div className="lab-changes"><h4>{lab.changes}</h4><div>{attributeIds.filter(id => skill.attributes[id]).map(id =>
        <span key={id} className={`model-${id}`}><LabIcon name={attributeIcons[id]}/>{lab.attributes[id]} <b>{signed(skill.attributes[id]!)}</b></span>)}</div></div>
      {skill.repeatCostStep && <div className="lab-trait lab-repeat"><strong><LabIcon name="lab-cycle"/>{lab.repeatable} · {lab.level(level)}</strong><p>{lab.repeatRule(skill.repeatCostStep)}</p></div>}
      {skill.dangerBps && <div className="lab-trait lab-danger"><strong><LabIcon name="lab-danger"/>{lab.dangerous}</strong>
        <p>{lab.riskRule(number.format(skill.dangerBps/100), percent.format(1))}</p></div>}
      <div className="lab-relations"><h4>{lab.requires}</h4>{skill.requires.length === 0 ? <p>{lab.noPrerequisite}</p>
        : skill.requires.map(group => <div className="lab-link-row" key={group[0]}>
          {group.map((id, i) => <span className="lab-link-wrap" key={id}>{i > 0 && <small>{lab.any}</small>}{link(id)}</span>)}</div>)}</div>
      {opens.length > 0 && <div className="lab-relations"><h4>{lab.opens}</h4><div className="lab-link-row">{opens.map(n => link(n.skill.id))}</div></div>}
      {skill.excludes && <div className="lab-relations lab-exclusive"><h4>{lab.exclusive}</h4>{link(skill.excludes)}
        {status === "available" && <p>{lab.excludes(scenario.skills[skill.excludes])}</p>}</div>}
      {example && <details className="lab-example"><summary>{lab.estimate}</summary>
        <p>{lab.sampleBase(lab.measures[example.measure], number.format(example.base))}</p>
        <p>{(example.measure === "remixContacts" || example.measure === "seatReferrals") && lab.nextContacts + " · "}
          {lab.sampleNow} {number.format(example.current)}
          {status !== "completed" && status !== "excluded" && <> → {lab.sampleAfter} {number.format(example.next)}</>}</p>
      </details>}
    </div>
    <div className="lab-detail-action">{action}</div>
  </aside>
}

function ResearchSlots({ run, unlock, select }: { run: RunState; unlock: (slot: number) => void; select: SelectSkill }) {
  const { ui: { lab }, scenario } = useLanguage()
  const { unlockedSlots, corpus } = researchState(run)
  return <section className="lab-slots" aria-label={lab.slots}>
    <div className="lab-slots-title"><h3>{lab.slots}</h3><span>{lab.unlocked(unlockedSlots, rules.slotCosts.length)}</span></div>
    <ol>{rules.slotCosts.map((cost, i) => {
      const slot = i + 1, project = slotProject(run, slot), next = slot === unlockedSlots + 1, locked = slot > unlockedSlots
      const heading = <span className="lab-slot-head">{lab.slot(slot)}<LabIcon name={locked ? "lab-lock" : project ? "lab-clock" : "flask"}/></span>
      if (project) return <li key={slot}><button type="button" className="lab-slot working" onClick={() => select(project.skillId)}>
        {heading}<strong>{scenario.skills[project.skillId]}</strong><ProjectProgress run={run} project={project}/>
      </button></li>
      if (!locked) return <li key={slot}><div className="lab-slot idle">{heading}<strong>{lab.idle}</strong></div></li>
      return <li key={slot}><button type="button" className={next ? "lab-slot next" : "lab-slot locked"} disabled={!canUnlockSlot(run, slot)}
        title={next ? lab.unlock(slot) : lab.previous(slot - 1)} onClick={() => unlock(slot)}>
        {heading}<strong>{next ? (corpus >= cost ? lab.unlockShort : lab.shortfall(cost - corpus)) : lab.lockedSlot}</strong><small>{lab.corpusCount(cost)}</small>
      </button></li>
    })}</ol>
  </section>
}

export function ResearchDialog({ run, skillId, buildId, back }: { run: RunState; skillId: SkillId; buildId?: BuildId; back: () => void }) {
  const { ui, number, percent } = useLanguage()
  const { dispatch } = useGameStore()
  const node = researchNode(skillId)
  const order = { seed: run.seed, completedWeek: run.completedWeek, seq: nextCommandSeq(run) }
  const unlock = (slot: number) => dispatch({ type: "unlock-research-slot", slot, ...order })
  const select = (id: SkillId) => dispatch({ type: "select-research", skillId: id })
  return <SceneDialog title={ui.lab.title} onBack={back} className={`research-dialog tree-${node.tree.id}`} headerDetail={<>
    <span className="lab-week">{ui.week(run.completedWeek)}<small>{ui.lab.paused}</small></span>
    <div className="lab-human" title={ui.lab.countermeasure}><span>Project HUMAN</span><b>{percent.format(run.researchBps / 10000)}</b></div>
    <div className="lab-balance"><LabIcon name="flask"/><span>{ui.lab.corpus}</span><strong aria-live="polite">{number.format(researchState(run).corpus)}</strong><small>{ui.lab.weekly(weeklyCorpus(run))}</small></div>
  </>}>
    <div className="lab-workbench"><TreePanel run={run} node={node} build={buildId ? researchBuild(buildId) : undefined} select={select}
      selectBuild={id => dispatch({ type: "select-research-build", buildId: id })}/>
      <ProjectDetail run={run} node={node} unlock={unlock} select={select} start={() => dispatch({ type: "start-research", skillId, ...order })}/>
    </div>
    <ResearchSlots run={run} select={select} unlock={unlock}/>
  </SceneDialog>
}
