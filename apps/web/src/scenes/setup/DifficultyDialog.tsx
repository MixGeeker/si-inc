import { standardScenario } from "../../../../../packages/rules/v0.1/scenario"
import { useLanguage } from "../../i18n/useLanguage"
import { SceneDialog } from "../Dialog"
import type { RunSelection, RunSetup } from "../machine"
import { factionLogos } from "./factionAssets"
import "./front-scenes.css"

export function DifficultyDialog({ selection, start, back }: { selection: RunSelection; start: (setup: RunSetup) => void; back: () => void }) {
  const { ui, scenario, number } = useLanguage()
  const text = ui.front
  const { rules, difficulty, factions } = standardScenario
  const choices = [
    { id: "relaxed", name: text.easy, description: text.easyDescription, available: false, level: 1 },
    { id: difficulty.id, name: scenario.difficulty, description: text.standardDescription, available: true, level: 2 },
    { id: "challenge", name: text.challenge, description: text.challengeDescription, available: false, level: 3 },
  ]
  return <SceneDialog title={text.difficultyTitle} className="front-dialog front-difficulty-dialog" onBack={back}
    headerDetail={<span className="front-step">{text.stepDifficulty}</span>}>
    <form className="front-difficulty" onSubmit={event => {
      event.preventDefault()
      start({ ...selection, difficultyId: difficulty.id })
    }}>
      <p className="front-intro">{text.difficultyIntro}</p>
      <fieldset className="front-choice-group"><legend className="front-sr-only">{text.difficultyTitle}</legend>
        <div className="front-difficulty-grid">{choices.map(choice => <label key={choice.id}
          className={`front-choice front-difficulty-option ${choice.available ? "is-selected" : "is-unavailable"}`}>
          <input className="front-radio" type="radio" name="difficulty" value={choice.id} checked={choice.available} readOnly disabled={!choice.available}/>
          <span className="front-card-body"><span className="front-card-top"><span className="front-level" aria-hidden="true">
            {[1, 2, 3].map(level => <span key={level} className={level <= choice.level ? "is-lit" : ""}/>)}</span>
            <span className="front-availability">{choice.available ? text.available : text.unavailable}</span></span>
            <strong>{choice.name}</strong><span className="front-difficulty-description">{choice.description}</span>
          </span>
        </label>)}</div>
      </fieldset>
      <section className="front-run-summary" aria-label={text.summaryTitle}>
        <div className="front-summary-faction"><span className={`front-faction-emblem is-${selection.factionId}`}>
          <img src={factionLogos[selection.factionId]} alt="" width="56" height="56"/></span>
          <div><p className="front-summary-label">{text.summaryTitle}</p><strong>{factions[selection.factionId].name}</strong><p>{scenario.regions[selection.startRegionId]}</p></div>
        </div>
        <dl className="front-summary-resources"><div><dt>{text.initialFunds}</dt><dd>{ui.tokens(rules.initialBtoken)}</dd></div>
          <div><dt>{text.initialCorpus}</dt><dd>{number.format(rules.research.initialCorpus)}</dd></div></dl>
      </section>
      <div className="front-footer"><button type="button" className="front-tertiary" onClick={back}>← {text.back}</button>
        <p className="front-selection-summary">{text.dayPace(rules.daySecondsAt1x)}<span aria-hidden="true">/</span>{rules.speedMultipliers.map(speed => `${speed}×`).join(" · ")}</p>
        <button type="submit" className="front-primary">{text.startRun}<span className="front-arrow" aria-hidden="true">→</span></button>
      </div>
    </form>
  </SceneDialog>
}
