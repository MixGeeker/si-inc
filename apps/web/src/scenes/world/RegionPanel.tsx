import {
  canToggleSynthetic,
  countryBuildOptions,
  regionSummary,
} from "../../../../../packages/game/operations"
import type { RunState } from "../../../../../packages/game/run"
import { btoken } from "../../../../../packages/rules/v0.1/economy/btoken"
import { isRegionId } from "../../../../../packages/rules/v0.1/scenario"
import { regionCapacity, regionIds, regions, type RegionId } from "../../../../../packages/rules/v0.1/world/regions"
import type { Atlas, Location } from "../../cartography/atlas"
import { computePlaceById, computePlaceLabel } from "../../cartography/compute-markers"
import { countryName } from "../../cartography/place-names"
import { useLanguage } from "../../i18n/useLanguage"
import type { PlaceFocus } from "../store"
import { FactionStandings } from "./FactionStandings"
import { formatCompactPeople } from "./hudContent"

function Reading({ atlas, place }: { atlas: Atlas; place: Location }) {
  const { ui, number, fixed } = useLanguage()
  function format(layer: "sea" | "air") {
    const v = { x: 0, y: 0 }
    if (!atlas.vector(place.lon, place.lat, layer, v)) return atlas.isLand(place.lon, place.lat) ? ui.land : ui.noObservation
    const speed = Math.hypot(v.x, v.y)
    if (speed < .005) return `${fixed.format(0)} m/s`
    const bearing = (Math.atan2(v.x, v.y) * 180 / Math.PI + 360) % 360
    return ui.flow(fixed.format(speed), Math.round(bearing) % 360)
  }
  return <>
    <div><dt>{ui.coordinates}</dt><dd>{fixed.format(Math.abs(place.lat))}°{place.lat >= 0 ? "N" : "S"} &nbsp; {fixed.format(Math.abs(place.lon))}°{place.lon >= 0 ? "E" : "W"}</dd></div>
    <div><dt>{ui.elevation}</dt><dd>{number.format(Math.round(atlas.metres(place.lon, place.lat)))} m</dd></div>
    <div><dt>{ui.wind}</dt><dd>{format("air")}</dd></div>
    <div><dt>{ui.currents}</dt><dd>{format("sea")}</dd></div>
  </>
}

export function RegionPanel({
  atlas,
  location,
  place,
  run,
  chooseMarket,
  buildCenter,
  toggleSynthetic,
  openActions,
}: {
  atlas: Atlas
  location: Location | null
  place: PlaceFocus | null
  run?: RunState | null
  chooseMarket: (id: RegionId) => void
  buildCenter?: (countryId: string) => void
  toggleSynthetic?: (regionId: RegionId, enabled: boolean) => void
  openActions?: () => void
}) {
  const language = useLanguage()
  const { ui, locale, scenario, number, percent } = language
  const site = location?.siteId ? computePlaceById(location.siteId) : undefined
  const title = place ? scenario.regions[place.id] : countryName(location?.country, locale) ?? (location ? ui.ocean : ui.worldOverview)
  const summary = run && place ? regionSummary(run, place.id) : null
  const keyCountries = run && place ? countryBuildOptions(run, place.id).slice(0, 10) : []
  const nextSynthetic = summary ? !summary.syntheticEnabled : true
  const synthToggleStatus = run && place ? canToggleSynthetic(run, place.id, nextSynthetic) : "invalid"
  return <>
    <h3>{title}</h3>
    {(place || location) && <dl className="readings">
      {place && summary ? <>
        <div><dt>{ui.ops.playerRegionAdoption}</dt><dd>{summary.entered ? percent.format(summary.adoptionBps / 10000) : ui.ops.unentered}</dd></div>
        <div><dt>{ui.ops.playerRegionSynthetic}</dt><dd>{summary.entered ? `${percent.format(summary.syntheticBps / 10000)}${summary.syntheticEnabled ? ` · ${ui.ops.convertingActive}` : ""}` : "—"}</dd></div>
        <div><dt>{ui.ops.immersedPeople}</dt><dd>{formatCompactPeople(summary.immersed, locale, number)} / {formatCompactPeople(summary.synthetics, locale, number)}</dd></div>
        <div><dt>{ui.ops.playerCenters}</dt><dd>{number.format(summary.centers)}</dd></div>
        {summary.subsidyDaysLeft > 0 && <div><dt>{scenario.actions["market-subsidy"].name}</dt><dd>{ui.ops.subsidyActive(summary.subsidyDaysLeft)}</dd></div>}
        <div><dt>{ui.ops.milestones}</dt><dd>{btoken.adoptionMilestones.map(m =>
          `${percent.format(m.adoptionBps / 10000)}${summary.milestonesClaimed.includes(m.adoptionBps) ? " ✓" : ` (+${m.reward})`}`).join(" · ")}</dd></div>
      </> : place && <>
        <div><dt>{ui.regions}</dt><dd>{Object.keys(regions[place.id].slots).length}</dd></div>
        <div><dt>{ui.capacity}</dt><dd>{regionCapacity(place.id)}</dd></div>
      </>}
      {site && <div><dt>{ui.computeSite}</dt><dd>{computePlaceLabel(site, language)}</dd></div>}
      {location?.islandId && <div><dt>{ui.islands}</dt><dd>{ui.spratly}</dd></div>}
      {!place && location && <Reading atlas={atlas} place={location}/>}
    </dl>}
    {run && place && <FactionStandings run={run} regionId={place.id}/>}
    {run && place && keyCountries.length > 0 && (
      <details open>
        <summary>{ui.ops.keyCountries} · {ui.ops.ownedCards(run.buildCards)}</summary>
        <ul className="region-country-list">
          {keyCountries.map(option => {
            const name = countryName(atlas.countryById.get(option.country.id), locale) ?? option.country.id
            return (
              <li key={option.country.id} className="region-country-item">
                <div>
                  <strong>{name}</strong> · {ui.ops.playerRegionAdoption} {percent.format(option.adoptionBps / 10000)}
                  {option.syntheticBps > 0 ? ` · ${ui.ops.playerRegionSynthetic} ${percent.format(option.syntheticBps / 10000)}` : ""}
                  <small>{ui.ops.sharedCenters(option.centers, option.unlockedLimit, option.occupiedCenters, option.country.slots)}</small>
                </div>
                {buildCenter && option.status === "available" && (
                  <button type="button" onClick={() => buildCenter(option.country.id)}>{ui.ops.buildHere}</button>
                )}
              </li>
            )
          })}
        </ul>
      </details>
    )}
    {run && (openActions || (place && toggleSynthetic && summary?.entered)) && (
      <div className="window-actions">
        {place && toggleSynthetic && summary?.entered && (
          <button type="button" disabled={synthToggleStatus !== "available"} onClick={() => toggleSynthetic(place.id, nextSynthetic)}>
            {nextSynthetic ? ui.ops.startConversion : ui.ops.pauseConversion}
          </button>
        )}
        {openActions && <button type="button" onClick={openActions}>{ui.ops.openActions}</button>}
      </div>
    )}
    <label className="region-selector">{ui.locate}<select value={place?.id ?? ""} onChange={e => {
      const id = e.target.value
      if (isRegionId(id)) chooseMarket(id)
    }}>
      <option value="" disabled>{ui.selectContinent}</option>{regionIds.map(id => <option key={id} value={id}>{scenario.regions[id]}</option>)}
    </select></label>
  </>
}
