import { useMemo } from "react"
import type { Atlas, Country, Location } from "../../cartography/atlas"

function Reading({ atlas, place }: { atlas: Atlas; place: Location }) {
  function format(layer: "sea" | "air") {
    const v = { x: 0, y: 0 }
    if (!atlas.vector(place.lon, place.lat, layer, v)) return atlas.isLand(place.lon, place.lat) ? "陆地" : "无观测值"
    const speed = Math.hypot(v.x, v.y)
    if (speed < .005) return "0.00 m/s"
    const bearing = (Math.atan2(v.x, v.y) * 180 / Math.PI + 360) % 360
    return `${speed.toFixed(2)} m/s · 流向 ${Math.round(bearing) % 360}°`
  }
  return <dl className="readings">
    {place.islandName && <div><dt>群岛</dt><dd>{place.islandName}</dd></div>}
    {place.site && <div><dt>算力站</dt><dd>{place.site}</dd></div>}
    <div><dt>坐标</dt><dd>{Math.abs(place.lat).toFixed(2)}°{place.lat >= 0 ? "N" : "S"} &nbsp; {Math.abs(place.lon).toFixed(2)}°{place.lon >= 0 ? "E" : "W"}</dd></div>
    <div><dt>地形高度</dt><dd>{Math.round(atlas.metres(place.lon, place.lat)).toLocaleString("zh-CN")} m</dd></div>
    <div><dt>850 hPa 风</dt><dd>{format("air")}</dd></div>
    <div><dt>表层洋流</dt><dd>{format("sea")}</dd></div>
  </dl>
}

export function RegionPanel({ atlas, location, locate }: { atlas: Atlas; location: Location | null; locate: (country: Country) => void }) {
  const countries = useMemo(() => [...atlas.countries].sort((a, b) => a.name.localeCompare(b.name, "zh-CN")), [atlas])
  return <>
    <h3>{location?.country?.name ?? (location ? "海域" : "世界概况")}</h3>
    {location ? <Reading atlas={atlas} place={location}/> : <p>点选陆地或海面可读取当地的高度、风速及流速。</p>}
    <label className="country-list">定位地区<select value={location?.country?.id ?? ""} onChange={e => {
      const country = countries.find(c => c.id === e.target.value)
      if (country) locate(country)
    }}><option value="">选择地区</option>{countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
  </>
}
