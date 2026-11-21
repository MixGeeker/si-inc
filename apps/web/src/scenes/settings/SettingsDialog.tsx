import { useEffect, useState } from "react"
import { isLocale, localeNames } from "../../../../../packages/rules/locales"
import { musicCatalog, musicTrackTitle } from "../../audio/music"
import { useLanguage } from "../../i18n/useLanguage"
import { SceneDialog } from "../Dialog"
import { useGameSnapshot, useGameStore } from "../GameContext"
import "./settings.css"

export function SettingsDialog({ back }: { back: () => void }) {
  const store = useGameStore()
  const { locale, sound, music, layers, developer } = useGameSnapshot()
  const { ui, percent } = useLanguage()
  const text = ui.preferences
  const [fullscreen, setFullscreen] = useState(() => Boolean(document.fullscreenElement))
  const [fullscreenError, setFullscreenError] = useState(false)

  useEffect(() => {
    const changed = () => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener("fullscreenchange", changed)
    return () => document.removeEventListener("fullscreenchange", changed)
  }, [])

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await document.documentElement.requestFullscreen()
      setFullscreenError(false)
    } catch {
      setFullscreenError(true)
    }
  }

  return <SceneDialog title={text.title} onBack={back} className="front-dialog settings-dialog">
    <p className="settings-intro">{text.intro}</p>
    <div className="settings-grid">
      <section className="settings-section" aria-labelledby="settings-language">
        <h3 id="settings-language"><span aria-hidden="true">01</span>{text.language}</h3>
        <label className="settings-language" htmlFor="settings-locale">
          <span><span lang="zh-CN">语言</span> / <span lang="en">Language</span></span>
          <select id="settings-locale" value={locale} onChange={event => {
            const value = event.currentTarget.value
            if (isLocale(value)) store.dispatch({ type: "set-locale", locale: value })
          }}>{Object.entries(localeNames).map(([code, name]) =>
            <option key={code} value={code} lang={code}>{name}</option>)}</select>
        </label>
      </section>

      <section className="settings-section" aria-labelledby="settings-sound">
        <h3 id="settings-sound"><span aria-hidden="true">02</span>{text.sound}</h3>
        <label className="settings-volume" htmlFor="settings-volume">
          <span>{ui.volume}</span><output htmlFor="settings-volume">{percent.format(sound.volume / 100)}</output>
          <input id="settings-volume" type="range" min="0" max="100" step="1" value={sound.volume}
            aria-valuetext={percent.format(sound.volume / 100)} onChange={event =>
              store.dispatch({ type: "set-sound-volume", volume: event.currentTarget.valueAsNumber })}/>
        </label>
        <div className="settings-sound-actions">
          <label className="settings-check"><input type="checkbox" checked={sound.muted} onChange={event =>
            store.dispatch({ type: "set-sound-muted", muted: event.currentTarget.checked })}/><span>{ui.mute}</span></label>
          <button type="button" className="settings-test" disabled={sound.muted || sound.volume === 0}
            onClick={() => store.dispatch({ type: "play-sound", cue: "test" })}>{ui.testSound}</button>
        </div>
        <div className="settings-music">
          <label className="settings-check"><input type="checkbox" checked={music.enabled} onChange={event =>
            store.dispatch({ type: "set-music-enabled", enabled: event.currentTarget.checked })}/><span>{ui.front.music} · {ui.front.musicOn}</span></label>
          <label className="settings-volume" htmlFor="settings-music-volume">
            <span>{ui.volume}</span><output htmlFor="settings-music-volume">{percent.format(music.volume / 100)}</output>
            <input id="settings-music-volume" type="range" min="0" max="100" step="1" value={music.volume}
              aria-valuetext={percent.format(music.volume / 100)} disabled={!music.enabled} onChange={event =>
                store.dispatch({ type: "set-music-volume", volume: event.currentTarget.valueAsNumber })}/>
          </label>
          {musicCatalog.length > 0 && <label className="settings-language" htmlFor="settings-music-track">
            <span>{ui.front.musicChannel}</span>
            <select id="settings-music-track" value={music.trackId ?? ""} disabled={!music.enabled} onChange={event => {
              const value = event.currentTarget.value
              store.dispatch({ type: "set-music-track", trackId: value === "" ? null : value })
            }}>
              <option value="">{ui.front.musicAuto}</option>
              {musicCatalog.map(track =>
                <option key={track.id} value={track.id}>{musicTrackTitle(track, locale)}</option>)}
            </select>
          </label>}
        </div>
      </section>

      <section className="settings-section" aria-labelledby="settings-display">
        <h3 id="settings-display"><span aria-hidden="true">03</span>{text.display}</h3>
        <div className="settings-layer-list">
          <label className="settings-check"><input type="checkbox" checked={layers.cloud} onChange={event =>
            store.dispatch({ type: "set-layer", layer: "cloud", enabled: event.currentTarget.checked })}/><span>{ui.clouds}</span></label>
          <label className="settings-check"><input type="checkbox" checked={layers.current} onChange={event =>
            store.dispatch({ type: "set-layer", layer: "current", enabled: event.currentTarget.checked })}/><span>{ui.currents}</span></label>
          <label className="settings-check"><input type="checkbox" checked={layers.population} onChange={event =>
            store.dispatch({ type: "set-layer", layer: "population", enabled: event.currentTarget.checked })}/><span>{ui.populationLayer}</span></label>
        </div>
        <p className="settings-hint">{text.displayHint}</p>
        {(document.fullscreenEnabled || fullscreen) && <button type="button" className="settings-fullscreen"
          aria-pressed={fullscreen} onClick={toggleFullscreen}>{fullscreen ? ui.fullOff : ui.fullOn}</button>}
        {fullscreenError && <p className="settings-error" role="status">{ui.fullError}</p>}
      </section>

      <section className="settings-section" aria-labelledby="settings-developer">
        <h3 id="settings-developer"><span aria-hidden="true">04</span>{text.developer}</h3>
        <label className="settings-check"><input type="checkbox" checked={developer.enabled} onChange={event =>
          store.dispatch({ type: "set-developer-enabled", enabled: event.currentTarget.checked })}/><span>{ui.developer.enable}</span></label>
        <p className="settings-hint">{text.developerHint}</p>
      </section>
    </div>
    <footer className="settings-footer"><span>{text.applied}</span><button type="button" onClick={back}>{ui.close}</button></footer>
  </SceneDialog>
}
