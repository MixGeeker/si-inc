import { regionCapacity, regionIds, regions, type RegionId } from "../../../../../packages/rules/v0.1/world/regions"
import { isRegionId } from "../../../../../packages/rules/v0.1/scenario"
import type { Atlas, Location } from "../../cartography/atlas"
import type { PlaceFocus } from "../store"

function Reading({ atlas, place }: { atlas: Atlas; place: Location }) {
  function format(layer: "sea" | "air") {
    const v = { x: 0, y: 0 }
    if (!atlas.vector(place.lon, place.lat, layer, v)) return atlas.isLand(place.lon, place.lat) ? "陆地" : "无观测值"
    const speed = Math.hypot(v.x, v.y)
    if (speed < .005) return "0.00 m/s"
    const bearing = (Math.atan2(v.x, v.y) * 180 / Math.PI + 360) % 360
    return `${speed.toFixed(2)} m/s · 流向 ${Math.round(bearing) % 360}°`
  }
  return <>
    <div><dt>坐标</dt><dd>{Math.abs(place.lat).toFixed(2)}°{place.lat >= 0 ? "N" : "S"} &nbsp; {Math.abs(place.lon).toFixed(2)}°{place.lon >= 0 ? "E" : "W"}</dd></div>
    <div><dt>地形高度</dt><dd>{Math.round(atlas.metres(place.lon, place.lat)).toLocaleString("zh-CN")} m</dd></div>
    <div><dt>850 hPa 风</dt><dd>{format("air")}</dd></div>
    <div><dt>表层洋流</dt><dd>{format("sea")}</dd></div>
  </>
}

export function RegionPanel({ atlas, location, place, chooseMarket }: {
  atlas: Atlas; location: Location | null; place: PlaceFocus | null
  chooseMarket: (id: RegionId) => void
}) {
  const title = place ? regions[place.id].name : location?.country?.name ?? (location ? "海域" : "世界概况")
  return <>
    <h3>{title}</h3>
    {(place || location) && <dl className="readings">
      {place && <>
        <div><dt>地理选区</dt><dd>{Object.keys(regions[place.id].slots).length}</dd></div>
        <div><dt>参考总槽位</dt><dd>{regionCapacity(place.id)}</dd></div>
      </>}
      {location?.site && <div><dt>算力站</dt><dd>{location.site}</dd></div>}
      {location?.islandName && <div><dt>群岛</dt><dd>{location.islandName}</dd></div>}
      {!place && location && <Reading atlas={atlas} place={location}/>}
    </dl>}
    <label className="region-selector">定位大洲<select value={place?.id ?? ""} onChange={e => {
      const id = e.target.value
      if (isRegionId(id)) chooseMarket(id)
    }}>
      <option value="" disabled>选择大洲</option>{regionIds.map(id => <option key={id} value={id}>{regions[id].name}</option>)}
    </select></label>
  </>
}
