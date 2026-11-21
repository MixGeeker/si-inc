import { useEffect, useRef, useState } from "react"
import { isLocale, localeNames } from "../../../../../packages/rules/locales"
import { standardScenario } from "../../../../../packages/rules/v0.1/scenario"
import { musicCatalog, musicTrackTitle } from "../../audio/music"
import { useLanguage } from "../../i18n/useLanguage"
import { SceneDialog } from "../Dialog"
import { useGameSnapshot, useGameStore } from "../GameContext"
import "./front-scenes.css"

type StartPanel = "sound" | "language"

export function StartScreen({ start, settings, explore }: { start: () => void; settings: () => void; explore: () => void }) {
  const store = useGameStore()
  const { locale, sound, music } = useGameSnapshot()
  const { ui, percent } = useLanguage()
  const text = ui.front
  const { rules } = standardScenario
  const [panel, setPanel] = useState<StartPanel | null>(null)
  const tools = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!panel) return
    const close = (event: PointerEvent) => {
      if (tools.current?.contains(event.target as Node)) return
      setPanel(null)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.preventDefault()
      event.stopPropagation()
      setPanel(null)
    }
    document.addEventListener("pointerdown", close)
    document.addEventListener("keydown", onKey, true)
    return () => {
      document.removeEventListener("pointerdown", close)
      document.removeEventListener("keydown", onKey, true)
    }
  }, [panel])
  const open = (next: StartPanel) => setPanel(current => current === next ? null : next)
  return <SceneDialog title={text.title} className="front-dialog front-start-dialog" onBack={explore}
    headerDetail={<div className="front-header-tools" ref={tools}>
      <button type="button" className="front-header-button" aria-expanded={panel === "sound"} aria-haspopup="dialog" onClick={() => open("sound")}>{text.soundButton}</button>
      <button type="button" className="front-header-button" aria-expanded={panel === "language"} aria-haspopup="dialog" onClick={() => open("language")}>{text.languageButton}</button>
      {panel === "sound" && <div className="front-popover" role="dialog" aria-label={text.soundPanel}>
        <h3>{text.soundPanel}</h3>
        <label className="front-sound-volume" htmlFor="start-volume">
          <span>{text.voice}</span><output htmlFor="start-volume">{percent.format(sound.volume / 100)}</output>
          <input id="start-volume" type="range" min="0" max="100" step="1" value={sound.volume}
            aria-valuetext={percent.format(sound.volume / 100)} onChange={event =>
              store.dispatch({ type: "set-sound-volume", volume: event.currentTarget.valueAsNumber })}/>
        </label>
        <div className="front-sound-actions">
          <label className="front-sound-check"><input type="checkbox" checked={sound.muted} onChange={event =>
            store.dispatch({ type: "set-sound-muted", muted: event.currentTarget.checked })}/><span>{text.effects} · {ui.mute}</span></label>
          <button type="button" disabled={sound.muted || sound.volume === 0}
            onClick={() => store.dispatch({ type: "play-sound", cue: "test" })}>{ui.testSound}</button>
        </div>
        <div className="front-music">
          <h3>{text.music}</h3>
          <label className="front-sound-check"><input type="checkbox" checked={music.enabled} onChange={event =>
            store.dispatch({ type: "set-music-enabled", enabled: event.currentTarget.checked })}/><span>{text.musicOn}</span></label>
          <label className="front-sound-volume" htmlFor="start-music-volume">
            <span>{ui.volume}</span><output htmlFor="start-music-volume">{percent.format(music.volume / 100)}</output>
            <input id="start-music-volume" type="range" min="0" max="100" step="1" value={music.volume}
              aria-valuetext={percent.format(music.volume / 100)} disabled={!music.enabled} onChange={event =>
                store.dispatch({ type: "set-music-volume", volume: event.currentTarget.valueAsNumber })}/>
          </label>
          {musicCatalog.length === 0 ? <p className="front-music-empty">{text.musicEmpty}</p>
            : <div className="front-language-list" role="listbox" aria-label={text.music}>
              <button type="button" role="option" aria-selected={music.trackId === null} disabled={!music.enabled}
                onClick={() => store.dispatch({ type: "set-music-track", trackId: null })}>{text.musicAuto}</button>
              {musicCatalog.map(track =>
                <button type="button" key={track.id} role="option" aria-selected={music.trackId === track.id} disabled={!music.enabled}
                  onClick={() => store.dispatch({ type: "set-music-track", trackId: track.id })}>{musicTrackTitle(track, locale)}</button>)}
            </div>}
        </div>
      </div>}
      {panel === "language" && <div className="front-popover" role="dialog" aria-label={text.languagePanel}>
        <h3>{text.languagePanel}</h3>
        <div className="front-language-list">{Object.entries(localeNames).map(([code, name]) =>
          <button type="button" key={code} lang={code} aria-pressed={locale === code} onClick={() => {
            if (isLocale(code)) store.dispatch({ type: "set-locale", locale: code })
          }}>{name}</button>)}</div>
      </div>}
    </div>}>
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
