import { useMemo, useRef, useState } from "react"
import { replayForRun, runTimeline, type RunTraceEntry } from "../../../../../packages/game/inspection"
import { corpusYieldBreakdown, totalCenters } from "../../../../../packages/game/operations"
import { canGrantTokens, nextCommandSeq, nextEventDay, type RunState } from "../../../../../packages/game/run"
import { actionById } from "../../../../../packages/rules/v0.1/evolution/actions"
import { researchNode } from "../../../../../packages/rules/v0.1/evolution/trees"
import { decisions } from "../../../../../packages/rules/v0.1/events/decisions"
import { isRegionId, standardScenario } from "../../../../../packages/rules/v0.1/scenario"
import type { Language } from "../../i18n/languages"
import { useLanguage } from "../../i18n/useLanguage"
import { useGameSnapshot, useGameStore } from "../GameContext"
import { stepDeveloperRun } from "../developer"
import { visibleRunState } from "../machine"
import { forkDeveloperStore, selectedPlace, type GameStore } from "../store"
import { DecisionChoices } from "./CampaignPanels"

function traceTitle(row: RunTraceEntry, { ui, scenario }: Language) {
  const { command, event } = row
  if (command?.kind === "devGrantTokens") return ui.developer.grantEntry
  if (command?.kind === "unlockResearchSlot") return ui.lab.unlock(command.slot)
  if (command?.kind === "buySkill") {
    const node = researchNode(command.skillId)
    if (node) return scenario.skills[node.skill.id]
  }
  if (command?.kind === "buyBuildCard") return ui.ops.buildCardCommand
  if (command?.kind === "buildDataCenter") return ui.ops.buildCenterCommand(command.countryId)
  if (command?.kind === "fundConversion") return ui.ops.fundConversionCommand(command.tokens)
  if (command?.kind === "toggleSynthetic") {
    const regionLabel = isRegionId(command.regionId) ? scenario.regions[command.regionId] : command.regionId
    return ui.ops.toggleSyntheticCommand(regionLabel, command.enabled)
  }
  if (command?.kind === "useAbility") {
    const action = actionById(command.abilityId)
    if (action) {
      const target = command.targetRegionId && isRegionId(command.targetRegionId) ? ` · ${scenario.regions[command.targetRegionId]}` : ""
      return `${scenario.actions[action.id].name}${target}`
    }
    const factionEntry = Object.values(standardScenario.factions).find(f => f.ability.id === command.abilityId)
    if (factionEntry) return factionEntry.ability.name
  }
  if (command?.kind === "collectBubble") {
    return ui.ops.bubbles.collectCommand(command.bubbleId.split(":").at(-1) ?? command.bubbleId)
  }
  if (command?.kind === "chooseEvent" && event?.content.kind === "decision") {
    const choice = decisions[event.content.id].choices.find(c => c.id === command.choiceId)
    if (choice) return scenario.choices[event.content.id][choice.id].label
  }
  if (row.before === null) return ui.kinds.bulletin
  if (row.after > row.before) return event ? `${ui.income} · ${ui.kinds[event.content.kind]}` : ui.income
  return event ? scenario.events[event.content.id].title : ui.developer.step
}

function Timeline({ run }: { run: RunState }) {
  const language = useLanguage()
  const { ui, scenario, number } = language
  const rows = useMemo(() => runTimeline(run), [run])
  const [all, setAll] = useState(false)
  if (!rows) return <p>{ui.developer.traceUnavailable}</p>
  return <>
    <ol className="dev-timeline">{(all ? rows : rows.slice(0, 5)).map(row => {
      const researchOrder = row.command?.kind === "buySkill" || row.command?.kind === "unlockResearchSlot"
      const delta = researchOrder ? row.corpusAfter - row.corpusBefore! : row.after - (row.before ?? row.after)
      return <li key={row.command ? `command-${row.command.seq}` : row.event ? `event-${row.event.instanceId}` : `day-${row.day}`}><details>
        <summary><span>{ui.day(row.day)}</span><strong>{traceTitle(row, language)}</strong>
          <span className={delta > 0 ? "dev-credit" : delta < 0 ? "dev-debit" : ""}>{researchOrder ? ui.lab.corpusCount(delta) : delta ? (delta > 0 ? "+" : "") + number.format(delta) : "—"}</span></summary>
        <div className="dev-entry-detail">
          <p>{ui.developer.funds} · {row.before !== null && `${number.format(row.before)} → `}{ui.tokens(row.after)}</p>
          <p>{ui.lab.corpus} · {row.corpusBefore !== null && `${number.format(row.corpusBefore)} → `}{number.format(row.corpusAfter)}</p>
          {row.event && <p>{scenario.events[row.event.content.id].title}<br/>{ui.developer.instance} <code>{row.event.instanceId}</code></p>}
          {row.command && <code>#{row.command.seq} · {row.command.kind}{row.command.kind === "chooseEvent" && ` / ${row.command.choiceId}`}</code>}
        </div>
      </details></li>
    })}</ol>
    {rows.length > 5 && <button type="button" className="dev-link" onClick={() => setAll(!all)}>{all ? ui.developer.less : ui.developer.more}</button>}
  </>
}

function Replay({ run }: { run: RunState }) {
  const { ui } = useLanguage()
  const replay = useMemo(() => replayForRun(run), [run])
  const json = JSON.stringify(replay, null, 2)
  const field = useRef<HTMLTextAreaElement>(null)
  const [result, setResult] = useState<{ json: string; copied: boolean }>()
  async function copy() {
    try {
      await navigator.clipboard.writeText(json)
      setResult({ json, copied: true })
    } catch {
      field.current?.focus()
      field.current?.select()
      setResult({ json, copied: false })
    }
  }
  return <div className="dev-replay">
    <label>{"format" in replay ? ui.developer.debugReplay : "ReplayV2"}
      <textarea ref={field} readOnly rows={6} value={json} spellCheck={false} aria-label={ui.developer.replay}/>
    </label>
    <button type="button" onClick={copy}>{ui.developer.copy}</button>
    <span role="status">{result?.json === json && (result.copied ? ui.developer.copied : ui.developer.manualCopy)}</span>
  </div>
}

function TokenControls({ store }: { store: GameStore }) {
  const { ui: { developer: text } } = useLanguage()
  const [amount, setAmount] = useState("")
  const [error, setError] = useState<"invalidAmount" | "amountTooLarge" | null>(null)
  function grant(value: number) {
    const run = visibleRunState(store.getSnapshot().scene)
    if (!run) return
    if (!canGrantTokens(run, value)) {
      setError(Number.isInteger(value) && value > 0 ? "amountTooLarge" : "invalidAmount")
      return
    }
    setError(null)
    store.dispatch({ type: "dev-grant-token", runId: run.runId, completedDay: run.completedDay, seq: nextCommandSeq(run), amount: value })
  }
  return <fieldset className="dev-grants"><legend>{text.grant} · token</legend>
    <div className="dev-actions">{[10, 100].map(n => <button type="button" key={n} onClick={() => grant(n)} aria-label={text.giveAmount(n)}>+{n}</button>)}
      <form noValidate onSubmit={e => { e.preventDefault(); grant(Number(amount)) }}>
        <input type="number" inputMode="numeric" min="1" step="1" placeholder={text.custom} aria-label={text.custom}
          aria-invalid={error !== null} value={amount} onChange={e => { setAmount(e.target.value); setError(null) }}/>
        <button type="submit">{text.give}</button>
      </form>
    </div>
    {error && <p role="alert">{text[error]}</p>}
  </fieldset>
}

export default function DeveloperPanel({ openSetup, close, hidden }: { openSetup: () => void; close: () => void; hidden: boolean }) {
  const live = useGameStore()
  const map = useGameSnapshot()
  const { ui, scenario, percent, number } = useLanguage()
  const text = ui.developer
  const [trial, setTrial] = useState<GameStore | null>(null)
  const [inTrial, setInTrial] = useState(false)
  const [tab, setTab] = useState<"trace" | "inspect" | "replay">("trace")
  const target = inTrial && trial ? trial : live
  const scene = useGameSnapshot(state => state.scene, target)
  const run = visibleRunState(scene)
  const ended = scene.kind === "ending"
  const next = run && !ended ? nextEventDay(run) : null
  const place = selectedPlace(map.selection)
  const selection = place ? scenario.regions[place.id] : map.selection && "lon" in map.selection
    ? `${number.format(map.selection.lon)}°, ${number.format(map.selection.lat)}°` : ui.worldOverview
  function fork() {
    setTrial(forkDeveloperStore(live.getSnapshot()))
    setInTrial(true)
  }
  return <aside className="dev-drawer" id="developer-panel" aria-label={text.title} hidden={hidden}
    onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); close() } }}>
    <header className="dev-header"><div><h2>{text.title}</h2>
      {run && <small>{standardScenario.factions[run.setup.factionId].name} · {scenario.regions[run.setup.startRegionId]} · {standardScenario.rules.rulesVersion} · {text.seed} {run.seed}</small>}
    </div><button type="button" autoFocus aria-label={text.close} onClick={close}>×</button></header>
    <div className="dev-body">
      {run && <>
        <div className="dev-actions dev-target" role="group" aria-label={text.target}>
          <button type="button" aria-pressed={!inTrial} onClick={() => setInTrial(false)}>{text.live}</button>
          <button type="button" aria-pressed={inTrial} onClick={() => trial ? setInTrial(true) : fork()}>{text.trial}</button>
          {inTrial && <button type="button" className="dev-link" onClick={fork}>{text.refork}</button>}
        </div>
        <dl className="dev-meters">
          <div><dt>{text.completed}</dt><dd>{number.format(run.completedDay)}</dd></div>
          <div><dt>{text.funds}</dt><dd aria-live="polite">{ui.tokens(run.balance)}</dd></div>
          <div><dt>{text.next}</dt><dd>{next === null ? "—" : ui.day(next)}</dd></div>
        </dl>
        <div className="dev-actions"><small>{ended ? text.ended : scene.kind === "decision" ? text.pending : text.manual}</small>
          {scene.kind === "campaign" && <>
            <button type="button" onClick={() => stepDeveloperRun(target)}>{text.step}</button>
            <button type="button" onClick={() => stepDeveloperRun(target, true)}>{text.until}</button>
          </>}
        </div>
      </>}
      <fieldset><legend>{ui.lighting}</legend><div className="dev-actions">
        {[false, true].map(night => <button type="button" key={String(night)} aria-pressed={map.layers.night === night}
          onClick={() => live.dispatch({ type: "set-layer", layer: "night", enabled: night })}>{night ? ui.night : ui.daylight}</button>)}
      </div></fieldset>
      {!run && <><p>{text.needRun}</p><button type="button" onClick={openSetup}>{ui.newRun}</button></>}
      {run && !ended && <TokenControls store={target}/>}
      {scene.kind === "decision" && <section className="dev-decision"><h3>{scenario.events[scene.id].title}</h3>
        <DecisionChoices scene={scene} choose={choiceId => target.dispatch({ type: "choose", id: scene.id, instanceId: scene.instanceId, choiceId })}/>
      </section>}
      {run && <>
        <nav className="dev-tabs" aria-label={text.title}>{(["trace", "inspect", "replay"] as const).map(key =>
          <button type="button" key={key} aria-pressed={tab === key} onClick={() => setTab(key)}>{text[key]}</button>)}</nav>
        {tab === "trace" && <Timeline run={run}/>}
        {tab === "inspect" && <dl className="dev-inspect">
          <div><dt>{text.scene}</dt><dd>{scene.kind === "campaign" || scene.kind === "decision" || scene.kind === "ending" ? text.sceneNames[scene.kind] : scene.kind}</dd></div>
          <div><dt>{text.selection}</dt><dd>{selection}</dd></div>
          <div><dt>{ui.lab.countermeasure}</dt><dd>{percent.format(run.researchBps / 10000)}</dd></div>
          <div><dt>{ui.ops.exposure}</dt><dd>{percent.format(run.exposureBps / 10000)}</dd></div>
          <div><dt>{text.adoption}</dt><dd>{run.adoptionBps === null ? text.notCalculated : percent.format(run.adoptionBps / 10000)}</dd></div>
          <div><dt>{ui.ops.syntheticGlobal}</dt><dd>{percent.format(run.syntheticBps / 10000)} ({ui.ops.syntheticMine} {percent.format(run.playerSyntheticBps / 10000)})</dd></div>
          <div><dt>{text.dependency}</dt><dd>{run.dependencyBps === null ? text.notCalculated : percent.format(run.dependencyBps / 10000)}</dd></div>
          <div><dt>{ui.ops.centersBuilt}</dt><dd>{totalCenters(run)} · {ui.ops.ownedCards(run.buildCards)}</dd></div>
          <div><dt>{ui.ops.corpusFlywheel}</dt><dd>{(() => { const y = corpusYieldBreakdown(run); return ui.ops.corpusBreakdown(y.fixed, y.populationCapped, y.throughputCap) })()}</dd></div>
        </dl>}
        {tab === "replay" && <Replay run={run}/>}
      </>}
    </div>
  </aside>
}
