import { useId, useState, type AnimationEvent, type KeyboardEvent, type ReactNode } from "react"
import { computePressure, computePressureWithSkill, corpusYieldBreakdown } from "../../../../../packages/game/operations"
import { completedLevel, firstIdleSlot, isProjectCompleted, projectRemainingDays, projectWorkDone, projectWorkRequired, researchAttributes, researchCost, researchLevels, researchState, researchStatus,
  slotProject, type ResearchProject } from "../../../../../packages/game/research"
import { researchExample } from "../../../../../packages/game/market-research"
import { canUnlockSlot, nextCommandSeq, type RunState } from "../../../../../packages/game/run"
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

function TreePanel({ run, node, select }: {
  run: RunState; node: ResearchNode; select: SelectSkill
}) {
  const { ui: { lab }, scenario } = useLanguage()
  const prefix = useId()
  function changeTree(tree: SkillTree) {
    if (tree.id === node.tree.id) return
    const pool = tree.skills
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
    </div>
    <div className="lab-chart" id={`${prefix}-panel`} role="tabpanel" aria-labelledby={`${prefix}-${node.tree.id}`}>
      <div className="lab-chart-head"><h3>{lab.treeTitle(scenario.trees[node.tree.id])}</h3>
        <div className="lab-legend">{(["available", "active", "completed", "locked"] as const).map(s =>
          <span key={s} className={`key-${s}`}><i/>{lab.status[s]}</span>)}
          {node.tree.skills.some(s => researchStatus(run, researchNode(s.id)) === "excluded") &&
            <span className="key-excluded"><i/>{lab.status.excluded}</span>}</div>
      </div>
      <TechMap run={run} node={node} select={select}/>
      <div className="lab-map-foot">
        <span className="lab-repeat"><LabIcon name="lab-cycle"/>{lab.repeatable}</span>
        <span className="lab-danger"><LabIcon name="lab-danger"/>{lab.dangerous}</span>
        <span className="lab-tier-key"><b aria-hidden="true">I / II</b>{lab.tierKey}</span>
        <span className="lab-pan-hint">↔ {lab.pan}</span>
      </div>
    </div>
    <ModelReadout run={run}/>
  </section>
}

function ProjectProgress({ run, project, workPerDay }: { run: RunState; project: ResearchProject; workPerDay: number }) {
  const { ui: { lab } } = useLanguage()
  return <span className="lab-progress"><span>{lab.remaining(projectRemainingDays(run, project, workPerDay))}</span>
    <progress aria-label={lab.status.active} value={projectWorkDone(run, project)} max={projectWorkRequired(project)}/>
  </span>
}

function ProjectDetail({ run, node, start, unlock, select }: {
  run: RunState; node: ResearchNode; start: () => void; unlock: (slot: number) => void; select: SelectSkill
}) {
  const { ui: { lab, ops }, scenario, number, percent } = useLanguage()
  const { skill, tree } = node, status = researchStatus(run, node)
  const research = researchState(run), cost = researchCost(run, node)
  const compute = computePressure(run)
  const previewCompute = computePressureWithSkill(run, skill.id)
  const level = completedLevel(run, skill.id), nextSlot = research.unlockedSlots + 1, idle = firstIdleSlot(run)
  const project = research.projects.find(p => p.skillId === skill.id && !isProjectCompleted(run, p))
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
    action = <><strong>{lab.inSlot(project.slot)}</strong><ProjectProgress run={run} project={project} workPerDay={compute.researchWorkPerDay}/><p>{compute.researchWorkPerDay < 100 ? lab.computeSlowdown(compute.researchWorkPerDay) : lab.resumeHint}</p></>
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
  const willOverload = ready && (previewCompute.status === "overloaded" || previewCompute.status === "critical")
  return <aside className="lab-detail" aria-label={scenario.skills[skill.id]}>
    <div className="lab-detail-scroll" key={skill.id}>
      <div className={`lab-detail-hero is-${status}`}><div className="lab-detail-id"><span>{code}</span><span>{scenario.trees[tree.id]} · {lab.tier(researchTier(skill))}</span></div>
        <TechHex skill={skill} status={status}/><span className={`lab-status is-${status}`}>{lab.status[status]}</span></div>
      <h3>{scenario.skills[skill.id]}</h3><p className="lab-description">{scenario.skillDescriptions[skill.id]}</p>
      <dl className="lab-specs"><div><dt>{lab.cost}</dt><dd>{lab.corpusCount(cost)}</dd></div>
        <div><dt>{lab.duration}</dt><dd>{lab.days(skill.days)}</dd></div>
        <div><dt>{lab.computeLoad}</dt><dd>{lab.computeUnits(skill.computeLoad)}</dd></div>
        {skill.dailyCorpusBonus && <div><dt>{lab.yieldBonus}</dt><dd>+{skill.dailyCorpusBonus}</dd></div>}
      </dl>
      {ready && (
        <p className={`lab-compute-preview${willOverload ? " is-risk" : ""}`}>
          {lab.computeAfterStart(percent.format(previewCompute.loadBps / 10000), ops.computeStatuses[previewCompute.status])}
        </p>
      )}
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

function ResearchSlots({ run, unlock, select, workPerDay }: { run: RunState; unlock: (slot: number) => void; select: SelectSkill; workPerDay: number }) {
  const { ui: { lab }, scenario } = useLanguage()
  const { unlockedSlots, corpus } = researchState(run)
  const [lit, setLit] = useState<number | null>(null)
  const press = (slot: number, action: () => void) => {
    action()
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    setLit(null)
    requestAnimationFrame(() => setLit(slot))
  }
  return <section className="lab-slots" aria-label={lab.slots}>
    <div className="lab-slots-title"><h3>{lab.slots}</h3><span>{lab.unlocked(unlockedSlots, rules.slotCosts.length)}</span></div>
    <ol>{rules.slotCosts.map((cost, i) => {
      const slot = i + 1, project = slotProject(run, slot), next = slot === unlockedSlots + 1, locked = slot > unlockedSlots
      const heading = <span className="lab-slot-head">{lab.slot(slot)}<LabIcon name={locked ? "lab-lock" : project ? "lab-clock" : "flask"}/></span>
      const end = (event: AnimationEvent<HTMLLIElement>) => {
        if (event.animationName === "lab-flare") setLit(current => current === slot ? null : current)
      }
      const litClass = lit === slot ? " is-lit" : ""
      if (project) return <li key={slot} onAnimationEnd={end}>
        <button type="button" className={`lab-slot working${litClass}`} onClick={() => press(slot, () => select(project.skillId))}>
          {heading}<strong>{scenario.skills[project.skillId]} · {lab.computeUnits(researchNode(project.skillId).skill.computeLoad)}</strong><ProjectProgress run={run} project={project} workPerDay={workPerDay}/>
        </button>
      </li>
      if (!locked) return <li key={slot} onAnimationEnd={end}>
        <div className={`lab-slot idle${litClass}`}>{heading}<strong>{lab.idle}</strong></div>
      </li>
      return <li key={slot} onAnimationEnd={end}>
        <button type="button" className={`lab-slot ${next ? "next" : "locked"}${litClass}`} disabled={!canUnlockSlot(run, slot)}
          title={next ? lab.unlock(slot) : lab.previous(slot - 1)} onClick={() => press(slot, () => unlock(slot))}>
          {heading}<strong>{next ? (corpus >= cost ? lab.unlockShort : lab.shortfall(cost - corpus)) : lab.lockedSlot}</strong><small>{lab.corpusCount(cost)}</small>
        </button>
      </li>
    })}</ol>
  </section>
}

export function ResearchDialog({ run, skillId, back }: { run: RunState; skillId: SkillId; back: () => void }) {
  const { ui, number, percent } = useLanguage()
  const { dispatch } = useGameStore()
  const node = researchNode(skillId)
  const yieldInfo = corpusYieldBreakdown(run)
  const compute = computePressure(run)
  const overloaded = compute.status === "overloaded" || compute.status === "critical"
  const order = { runId: run.runId, completedDay: run.completedDay, seq: nextCommandSeq(run) }
  const unlock = (slot: number) => dispatch({ type: "unlock-research-slot", slot, ...order })
  const select = (id: SkillId) => dispatch({ type: "select-research", skillId: id })
  return <SceneDialog title={ui.lab.title} onBack={back} className={`research-dialog tree-${node.tree.id}`} headerDetail={<>
    <span className="lab-day">{ui.day(run.completedDay)}<small>{ui.lab.paused}</small></span>
    <div className={`lab-compute${overloaded ? " is-overloaded" : ""}`} title={ui.ops.computeBreakdown(compute.inferenceDemand, compute.researchDemand)}>
      <span>{ui.lab.computeHeader(compute.totalDemand, compute.supply, percent.format(compute.loadBps / 10000))}</span>
      {overloaded && <b>{ui.lab.computeSlowdown(compute.researchWorkPerDay)}</b>}
    </div>
    <div className="lab-human" title={ui.lab.countermeasure}><span>Project HUMAN</span><b>{percent.format(run.researchBps / 10000)}</b></div>
    <div className="lab-balance" title={ui.ops.corpusBreakdown(yieldInfo.fixed, yieldInfo.populationCapped, yieldInfo.throughputCap)}><LabIcon name="flask"/><span>{ui.lab.corpus}</span><strong aria-live="polite">{number.format(researchState(run).corpus)}</strong><small>{ui.lab.daily(yieldInfo.totalDaily)}</small></div>
  </>}>
    <div className="lab-workbench"><TreePanel run={run} node={node} select={select}/>
      <ProjectDetail run={run} node={node} unlock={unlock} select={select} start={() => dispatch({ type: "start-research", skillId, ...order })}/>
    </div>
    <ResearchSlots run={run} select={select} unlock={unlock} workPerDay={compute.researchWorkPerDay}/>
  </SceneDialog>
}
