import { regionIds, regions, type RegionId } from "../../../../../packages/rules/v0.1/world/regions"

/** Static drill-down for the campaign strip. Only Japan's population is filled in. */
export type PlaceNav = { marketId?: RegionId; countryId?: string }

const eastAsia = [
  { id: "JPN", name: "日本", lon: 138.44217, lat: 36.142538 },
  { id: "CHN", name: "中国", lon: 106.337289, lat: 32.498178 },
  { id: "KOR", name: "韩国", lon: 128.129504, lat: 36.384924 },
  { id: "PRK", name: "朝鲜", lon: 126.444516, lat: 39.885252 },
  { id: "MNG", name: "蒙古", lon: 104.150405, lat: 45.997488 },
] as const

const japanShare: Record<string, number> = { gpt: 60, claude: 40, grok: 0 }

export function marketOfCountry(countryId: string): RegionId | undefined {
  return eastAsia.some(country => country.id === countryId) ? "ea" : undefined
}

export function fixtureCountry(countryId: string) {
  return eastAsia.find(country => country.id === countryId)
}

function playerShare(factionId: string) {
  const share = japanShare[factionId]
  return share === undefined ? "—" : `${share}%`
}

export type MarketChip = { id: RegionId; name: string; share: string; reward: string }
export type CountryChip = { id: string; name: string; lon: number; lat: number; share: string; detail: string }

export function worldMarkets(factionId: string): MarketChip[] {
  return regionIds.map(id => ({
    id,
    name: regions[id].name,
    share: id === "ea" ? playerShare(factionId) : "—",
    reward: id === "ea" ? "30% 未领 · 70% 未领" : "30% 未记 · 70% 未记",
  }))
}

export function marketCountries(marketId: RegionId, factionId: string): CountryChip[] {
  if (marketId !== "ea") return []
  return eastAsia.map(country => ({
    id: country.id,
    name: country.name,
    lon: country.lon,
    lat: country.lat,
    share: country.id === "JPN" ? playerShare(factionId) : "—",
    detail: country.id === "JPN" ? "可启用计划" : "暂无试玩人口",
  }))
}

export function countryLines(countryId: string, factionId: string): { lines: [string, string][]; footer: string } {
  if (countryId !== "JPN") {
    return {
      lines: [["未沉浸", "—"], ["我方沉浸", "—"], ["对手沉浸", "—"], ["我方合成", "—"]],
      footer: "空槽 — · 建设额度 —",
    }
  }
  const mine = japanShare[factionId]
  const quota = factionId === "gpt" ? "50%" : factionId === "claude" ? "25%" : factionId === "grok" ? "未开放" : "—"
  return {
    lines: [
      ["未沉浸", "0"],
      ["我方沉浸", mine === undefined ? "—" : `${mine}%`],
      ["对手沉浸", mine === undefined ? "—" : `${100 - mine}%`],
      ["我方合成", "—"],
    ],
    footer: `空槽 1/2 · 建设额度 ${quota} · 可启用计划`,
  }
}

export function marketCenter(marketId: RegionId) {
  const [lon, lat] = regions[marketId].center
  return { lon, lat, name: regions[marketId].name }
}
