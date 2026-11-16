import { regionCapacity, regionIds, regions, type RegionId } from "../../../../../packages/rules/v0.1/world/regions"
import { isRegionId } from "../../../../../packages/rules/v0.1/scenario"
import { computePlaceById, computePlaceLabel } from "../../cartography/compute-markers"
import { countryName } from "../../cartography/place-names"
import { useLanguage } from "../../i18n/useLanguage"
import type { Atlas, Location } from "../../cartography/atlas"
import type { PlaceFocus } from "../store"

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

export function RegionPanel({ atlas, location, place, chooseMarket }: {
  atlas: Atlas; location: Location | null; place: PlaceFocus | null
  chooseMarket: (id: RegionId) => void
}) {
  const language = useLanguage()
  const { ui, locale, scenario } = language
  const site = location?.siteId ? computePlaceById(location.siteId) : undefined
  const title = place ? scenario.regions[place.id] : countryName(location?.country, locale) ?? (location ? ui.ocean : ui.worldOverview)
  return <>
    <h3>{title}</h3>
    {(place || location) && <dl className="readings">
      {place && <>
        <div><dt>{ui.regions}</dt><dd>{Object.keys(regions[place.id].slots).length}</dd></div>
        <div><dt>{ui.capacity}</dt><dd>{regionCapacity(place.id)}</dd></div>
      </>}
      {site && <div><dt>{ui.computeSite}</dt><dd>{computePlaceLabel(site, language)}</dd></div>}
      {location?.islandId && <div><dt>{ui.islands}</dt><dd>{ui.spratly}</dd></div>}
      {!place && location && <Reading atlas={atlas} place={location}/>}
    </dl>}
    <label className="region-selector">{ui.locate}<select value={place?.id ?? ""} onChange={e => {
      const id = e.target.value
      if (isRegionId(id)) chooseMarket(id)
    }}>
      <option value="" disabled>{ui.selectContinent}</option>{regionIds.map(id => <option key={id} value={id}>{scenario.regions[id]}</option>)}
    </select></label>
  </>
}
