import { standardScenario } from "../../../../../packages/rules/v0.1/scenario"
import { useLanguage } from "../../i18n/useLanguage"
import { SceneDialog } from "../Dialog"
import "./front-scenes.css"

export function StartScreen({ start, settings, explore }: { start: () => void; settings: () => void; explore: () => void }) {
  const { ui } = useLanguage()
  const text = ui.front
  const { rules } = standardScenario
  return <SceneDialog title={text.title} className="front-dialog front-start-dialog" onBack={explore}>
    <div className="front-start">
      <div className="front-identity">
        <div className="front-orbit" aria-hidden="true"><svg viewBox="0 0 360 360" fill="none">
          <circle cx="180" cy="180" r="146"/><circle cx="180" cy="180" r="108"/>
          <ellipse cx="180" cy="180" rx="65" ry="146"/><path d="M34 180h292M54 107h252M54 253h252M180 18v324"/>
          <path className="front-orbit-track" d="M57 265 129 134 245 102 295 219 180 286Z"/>
          <g className="front-orbit-nodes"><circle cx="129" cy="134" r="4"/><circle cx="245" cy="102" r="4"/><circle cx="295" cy="219" r="4"/></g>
        </svg></div>
        <p className="front-eyebrow">{text.eyebrow}</p>
        <h1 className="front-wordmark"><span>SINGULARITY</span><span>INC<span className="front-wordmark-dot">.</span></span></h1>
        <p className="front-tagline">{text.tagline}</p>
        <p className="front-story">{text.story}</p>
        <dl className="front-readouts">
          <div><dt>{text.pace}</dt><dd>{text.dayPace(rules.daySecondsAt1x)}</dd></div>
          <div><dt>{text.speeds}</dt><dd>{rules.speedMultipliers.map(speed => `${speed}×`).join(" / ")}</dd></div>
        </dl>
      </div>
      <nav className="front-menu" aria-label={text.title}>
        <p className="front-menu-kicker">SINGULARITY INC. <span>{rules.rulesVersion}</span></p>
        <button type="button" className="front-menu-action front-primary" onClick={start}>
          <span className="front-action-index" aria-hidden="true">01</span><span>{text.start}</span><span className="front-arrow" aria-hidden="true">↗</span>
        </button>
        <button type="button" className="front-menu-action front-secondary" onClick={settings}>
          <span className="front-action-index" aria-hidden="true">02</span><span>{text.settings}</span><span className="front-arrow" aria-hidden="true">↗</span>
        </button>
        <button type="button" className="front-menu-action front-tertiary" onClick={explore}>
          <span className="front-action-index" aria-hidden="true">03</span><span>{text.explore}</span><span className="front-arrow" aria-hidden="true">→</span>
        </button>
        <p className="front-menu-note"><span aria-hidden="true"/>{text.noDeadline}</p>
      </nav>
    </div>
  </SceneDialog>
}
