import { useEffect, useId, useState, type AnimationEvent, type KeyboardEvent, type ReactNode } from "react"
import { computePressure, computePressureWithSkill, corpusYieldBreakdown } from "../../../../../packages/game/operations"
import {
  canCancelResearch,
  canMoveResearch,
  canQueueResearch,
  cancelCascadeSlots,
  completedLevel,
  firstIdleSlot,
  isProjectRunning,
  isProjectWaitingCorpus,
  nextQueuedResearchCost,
  projectQueueEstimatedDays,
  projectRemainingDays,
  projectWorkDone,
  projectWorkRequired,
  queuedProjectExpectedCost,
  queuedResearchProjects,
  queuedSlotsForSkill,
  researchAttributes,
  researchLevels,
  researchState,
  researchStatus,
  slotProject,
  type ResearchProject,
} from "../../../../../packages/game/research"
import { researchExample } from "../../../../../packages/game/market-research"
import { nextCommandSeq, type RunState } from "../../../../../packages/game/run"
import { attributeIds, researchNode, researchNodes, trees, type ResearchNode, type SkillId, type SkillTree } from "../../../../../packages/rules/v0.1/evolution/trees"
import { standardScenario } from "../../../../../packages/rules/v0.1/scenario"
import { useLanguage } from "../../i18n/useLanguage"
import { SceneDialog } from "../Dialog"
import { useGameSnapshot, useGameStore } from "../GameContext"
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

function TreePanel({ run, node, select, enqueue }: {
  run: RunState; node: ResearchNode; select: SelectSkill; enqueue: (id: SkillId) => void
}) {
  const { ui, scenario } = useLanguage()
  const { lab } = ui
  const shortcuts = useGameSnapshot(state => state.shortcuts)
  const prefix = useId()
  function changeTree(tree: SkillTree) {
    if (tree.id === node.tree.id) return
    const pool = tree.skills
    const first = (["active", "queued", "available", "upgradable"] as const).map(status =>
      pool.find(s => researchStatus(run, researchNode(s.id)) === status)).find(Boolean)
    select((first ?? pool[0]).id)
  }
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return
      const target = event.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return
      if (event.code === "BracketLeft" || event.code === "BracketRight") {
        if (Object.values(shortcuts).includes(event.code)) return
        event.preventDefault()
        const index = trees.findIndex(tree => tree.id === node.tree.id)
        const delta = event.code === "BracketRight" ? 1 : -1
        changeTree(trees[(index + delta + trees.length) % trees.length])
        return
      }
      if (event.key === "Enter" && canQueueResearch(run, node.skill.id)) {
        const isSelectedHex = target?.matches?.(`button.lab-node[data-skill="${node.skill.id}"]`)
        const isInteractive = tag === "BUTTON" || tag === "A" || tag === "SUMMARY"
        if (!isInteractive || isSelectedHex) {
          event.preventDefault()
          enqueue(node.skill.id)
        }
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  })
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
      <span className="lab-tab-hint" aria-hidden="true">{ui.shortcuts.dialogTabHint}</span>
    </div>
    <div className="lab-chart" id={`${prefix}-panel`} role="tabpanel" aria-labelledby={`${prefix}-${node.tree.id}`}>
      <div className="lab-chart-head"><h3>{lab.treeTitle(scenario.trees[node.tree.id])}</h3>
        <div className="lab-legend">{(["available", "active", "queued", "completed", "locked"] as const).map(s =>
          <span key={s} className={`key-${s}`}><i/>{lab.status[s]}</span>)}
          {node.tree.skills.some(s => researchStatus(run, researchNode(s.id)) === "excluded") &&
            <span className="key-excluded"><i/>{lab.status.excluded}</span>}</div>
      </div>
      <TechMap run={run} node={node} select={select} enqueue={enqueue}/>
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

function ProjectDetail({ run, node, start, cancel, move, select }: {
  run: RunState; node: ResearchNode; start: () => void; cancel: (slot: number) => void
  move: (fromSlot: number, toSlot: number) => void; select: SelectSkill
}) {
  const { ui: { lab, ops }, scenario, number, percent } = useLanguage()
  const { skill, tree } = node, status = researchStatus(run, node)
  const research = researchState(run)
  const nextCost = nextQueuedResearchCost(run, node)
  const compute = computePressure(run)
  const previewCompute = computePressureWithSkill(run, skill.id)
  const level = completedLevel(run, skill.id)
  const idle = firstIdleSlot(run)
  const queueSlots = queuedSlotsForSkill(run, skill.id)
  const queuedMatches = queuedResearchProjects(run).filter(p => p.skillId === skill.id)
  const firstMatch = queuedMatches[0]
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
  if (firstMatch && skill.repeatCostStep === undefined) {
    const running = isProjectRunning(run, firstMatch)
    const waiting = isProjectWaitingCorpus(run, firstMatch)
    const expectedCost = queuedProjectExpectedCost(run, firstMatch)
    const cascade = cancelCascadeSlots(run, firstMatch.slot).length - 1
    const eta = projectQueueEstimatedDays(run, firstMatch.slot, compute.researchWorkPerDay)
    const canPrioritize = firstMatch.slot > 1 && canMoveResearch(run, firstMatch.slot, 1)
    action = <>
      <div className="lab-detail-queue-state">
        <strong>{running ? `${lab.inSlot(1)} · ${lab.runningBadge}` : waiting ? lab.waitingCorpus(Math.max(1, expectedCost - research.corpus)) : `${lab.inSlot(firstMatch.slot)} · ${lab.etaDays(eta)}`}</strong>
        {running && <ProjectProgress run={run} project={firstMatch} workPerDay={compute.researchWorkPerDay}/>}
        <p>{running
          ? (compute.researchWorkPerDay < 100 ? lab.computeSlowdown(compute.researchWorkPerDay) : lab.resumeHint)
          : waiting
            ? lab.waitingAutoHint
            : lab.queuedWillAutoPay(expectedCost)}</p>
      </div>
      <div className="lab-detail-queue-btns">
        {canPrioritize && <button type="button" className="lab-secondary" onClick={() => move(firstMatch.slot, 1)}>⤒ {lab.moveTop}</button>}
        <button type="button" className="lab-danger-btn" title={cascade > 0 ? lab.cancelCascade(cascade) : undefined}
          onClick={() => cancel(firstMatch.slot)}>
          {firstMatch.paidCost ? lab.cancelRefund(firstMatch.paidCost) : lab.cancelSlot}
        </button>
      </div>
      {cascade > 0 && <p className="lab-cascade-warn">{lab.cancelCascade(cascade)}</p>}
    </>
  } else {
    const plannedLevel = level + queueSlots.length + 1
    const canEnqueue = ready && idle !== null
    const label = status === "locked" ? lab.needPrerequisite
      : status === "excluded" ? lab.branchClosed
        : status === "completed" ? lab.status.completed
          : idle === null ? lab.queueFull
            : skill.repeatCostStep !== undefined && plannedLevel > 1
              ? lab.enqueueUpgrade(plannedLevel, idle)
              : lab.enqueue(idle)
    const waitingHint = canEnqueue && idle === 1 && research.corpus < nextCost
      ? lab.waitingCorpus(nextCost - research.corpus) + " · " + lab.waitingAutoHint
      : canEnqueue && idle > 1
        ? lab.queuedWillAutoPay(nextCost)
        : null
    action = <>
      {queueSlots.length > 0 && <p className="lab-queue-note">{lab.inQueue(queueSlots)}</p>}
      <button type="button" className="lab-primary" disabled={!canEnqueue} onClick={start}>
        <LabIcon name={canEnqueue ? "flask" : status === "completed" ? "lab-check" : "lab-lock"}/>{label}
      </button>
      {waitingHint && <p>{waitingHint}</p>}
    </>
  }

  const willOverload = ready && (previewCompute.status === "overloaded" || previewCompute.status === "critical")
  return <aside className="lab-detail" aria-label={scenario.skills[skill.id]}>
    <div className="lab-detail-scroll" key={skill.id}>
      <div className={`lab-detail-hero is-${status}`}><div className="lab-detail-id"><span>{code}</span><span>{scenario.trees[tree.id]} · {lab.tier(researchTier(skill))}</span></div>
        <TechHex skill={skill} status={status} queueSlots={queueSlots}/><span className={`lab-status is-${status}`}>{lab.status[status]}</span></div>
      <h3>{scenario.skills[skill.id]}</h3><p className="lab-description">{scenario.skillDescriptions[skill.id]}</p>
      <dl className="lab-specs"><div><dt>{lab.cost}</dt><dd>{lab.corpusCount(nextCost)}</dd></div>
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
        <p>{lab.riskRule(number.format(skill.dangerBps / 100), percent.format(1))}</p></div>}
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

function ResearchSlots({ run, select, cancel, move, workPerDay }: {
  run: RunState; select: SelectSkill; cancel: (slot: number) => void
  move: (fromSlot: number, toSlot: number) => void; workPerDay: number
}) {
  const { ui: { lab }, scenario } = useLanguage()
  const { unlockedSlots, corpus } = researchState(run)
  const queue = queuedResearchProjects(run)
  const [lit, setLit] = useState<number | null>(null)
  const flash = (slot: number) => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    setLit(null)
    requestAnimationFrame(() => setLit(slot))
  }
  return <section className="lab-slots" aria-label={lab.slots}>
    <div className="lab-slots-title">
      <h3>{lab.slots}</h3>
      <span className="lab-slots-hint">{lab.queueHint}</span>
      <span className="lab-slots-count">{lab.queueCount(queue.length, rules.slotCosts.length)}</span>
    </div>
    <ol>{Array.from({ length: unlockedSlots }, (_, i) => {
      const slot = i + 1
      const project = slotProject(run, slot)
      const end = (event: AnimationEvent<HTMLLIElement>) => {
        if (event.animationName === "lab-flare") setLit(current => current === slot ? null : current)
      }
      const litClass = lit === slot ? " is-lit" : ""
      if (!project) {
        return <li key={slot} onAnimationEnd={end}>
          <div className={`lab-slot idle${slot === 1 ? " is-head" : ""}${litClass}`}>
            <span className="lab-slot-head"><span>{lab.slot(slot)}</span><LabIcon name="flask"/></span>
            <strong>{lab.idle}</strong>
          </div>
        </li>
      }

      const running = isProjectRunning(run, project)
      const waiting = isProjectWaitingCorpus(run, project)
      const expectedCost = queuedProjectExpectedCost(run, project)
      const workDone = projectWorkDone(run, project)
      const workRequired = projectWorkRequired(project)
      const savedPct = workDone > 0 ? Math.min(99, Math.round(workDone * 100 / workRequired)) : 0
      const eta = projectQueueEstimatedDays(run, slot, workPerDay)
      const canTop = slot > 1 && canMoveResearch(run, slot, 1)
      const canUp = slot > 1 && canMoveResearch(run, slot, slot - 1)
      const canDown = slot < queue.length && canMoveResearch(run, slot, slot + 1)
      const cascade = cancelCascadeSlots(run, slot).length - 1
      const cancelTip = [
        project.paidCost ? lab.cancelRefund(project.paidCost) : lab.cancelSlot,
        cascade > 0 ? lab.cancelCascade(cascade) : null,
      ].filter(Boolean).join(" · ")
      const stateClass = running ? "working is-head" : waiting ? "waiting is-head" : "queued"
      const badge = running ? lab.runningBadge : waiting ? lab.waitingBadge : lab.etaDays(eta)

      return <li key={`${slot}-${project.skillId}`} onAnimationEnd={end}>
        <div className={`lab-slot ${stateClass}${litClass}`}>
          <div className="lab-slot-top">
            <span className="lab-slot-head">
              <b>{lab.slot(slot)}</b>
              <em className={`lab-slot-badge${running ? " is-running" : waiting ? " is-waiting" : ""}`}>{badge}</em>
            </span>
            <div className="lab-slot-ops">
              {canTop && <button type="button" title={lab.moveTop} aria-label={`${lab.moveTop} ${scenario.skills[project.skillId]}`}
                onClick={() => { flash(1); move(slot, 1) }}>⤒</button>}
              {canUp && <button type="button" title={lab.moveUp} aria-label={`${lab.moveUp} ${scenario.skills[project.skillId]}`}
                onClick={() => { flash(slot - 1); move(slot, slot - 1) }}>‹</button>}
              {canDown && <button type="button" title={lab.moveDown} aria-label={`${lab.moveDown} ${scenario.skills[project.skillId]}`}
                onClick={() => { flash(slot + 1); move(slot, slot + 1) }}>›</button>}
              {canCancelResearch(run, slot) && <button type="button" className="is-cancel" title={cancelTip}
                aria-label={`${cancelTip} · ${scenario.skills[project.skillId]}`}
                onClick={() => cancel(slot)}>×</button>}
            </div>
          </div>
          <button type="button" className="lab-slot-body" onClick={() => { flash(slot); select(project.skillId) }}>
            <strong>{scenario.skills[project.skillId]}</strong>
            {running ? (
              <ProjectProgress run={run} project={project} workPerDay={workPerDay}/>
            ) : waiting ? (
              <small className="lab-slot-wait">{lab.waitingCorpus(Math.max(1, expectedCost - corpus))}</small>
            ) : (
              <small className="lab-slot-meta">
                {savedPct > 0 ? lab.pausedProgress(savedPct) : lab.corpusCount(expectedCost)}
                {" · "}
                {lab.computeUnits(researchNode(project.skillId).skill.computeLoad)}
              </small>
            )}
          </button>
        </div>
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
  const select = (id: SkillId) => dispatch({ type: "select-research", skillId: id })
  const enqueue = (id: SkillId) => dispatch({ type: "start-research", skillId: id, ...order })
  const cancel = (slot: number) => dispatch({ type: "cancel-research", slot, ...order })
  const move = (fromSlot: number, toSlot: number) => dispatch({ type: "move-research", fromSlot, toSlot, ...order })
  return <SceneDialog title={ui.lab.title} onBack={back} className={`research-dialog tree-${node.tree.id}`} headerDetail={<>
    <span className="lab-day">{ui.day(run.completedDay)}<small>{ui.lab.paused}</small></span>
    <div className={`lab-compute${overloaded ? " is-overloaded" : ""}`} title={ui.ops.computeBreakdown(compute.inferenceDemand, compute.researchDemand)}>
      <span>{ui.lab.computeHeader(compute.totalDemand, compute.supply, percent.format(compute.loadBps / 10000))}</span>
      {overloaded && <b>{ui.lab.computeSlowdown(compute.researchWorkPerDay)}</b>}
    </div>
    <div className="lab-human" title={ui.lab.countermeasure}><span>Project HUMAN</span><b>{percent.format(run.researchBps / 10000)}</b></div>
    <div className="lab-balance" title={ui.ops.corpusBreakdown(yieldInfo.fixed, yieldInfo.populationCapped, yieldInfo.throughputCap)}><LabIcon name="flask"/><span>{ui.lab.corpus}</span><strong aria-live="polite">{number.format(researchState(run).corpus)}</strong><small>{ui.lab.daily(yieldInfo.totalDaily)}</small></div>
  </>}>
    <div className="lab-workbench">
      <TreePanel run={run} node={node} select={select} enqueue={enqueue}/>
      <ProjectDetail run={run} node={node} select={select} start={() => enqueue(skillId)} cancel={cancel} move={move}/>
    </div>
    <ResearchSlots run={run} select={select} cancel={cancel} move={move} workPerDay={compute.researchWorkPerDay}/>
  </SceneDialog>
}
