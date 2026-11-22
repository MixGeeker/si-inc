/**
 * Continental market specifications (the sole simulation & infrastructure granularity).
 * Country ISO codes are retained strictly as map-geometry membership for SVG picking and map shading.
 */
export interface RegionSpec {
  readonly id: RegionId
  readonly name: string
  readonly center: readonly [number, number]
  readonly population: number
  /** Population-weighted internet penetration in basis points (0..10000). */
  readonly internetBps: number
  /** Shared continental data-center slots contested by all factions. */
  readonly slots: number
  /** Rated people served at full speed by one local data center. */
  readonly slotCapacity: number
  /** Inland anchor points (lon, lat) used to place live map bubbles cleanly on land. */
  readonly bubblePoints: readonly (readonly [number, number])[]
  /** Country SVG path IDs belonging to this continent (for map picking & contour projection). */
  readonly countries: readonly string[]
}

const rawRegions = {
  na: {
    name: "北美",
    center: [-97, 38] as const,
    population: 608_273_903,
    internetBps: 8780,
    slots: 6,
    bubblePoints: [[-122.4, 37.8], [-74.0, 40.7], [-87.6, 41.9], [-99.1, 19.4], [-79.4, 43.7]] as const,
    countries: [
      "ABW", "AIA", "ATG", "BHS", "BLM", "BLZ", "BMU", "BRB", "CAN", "CRI", "CUB", "CUW", "CYM", "DMA",
      "DOM", "GRD", "GRL", "GTM", "HND", "HTI", "JAM", "KNA", "LCA", "MAF", "MEX", "MSR", "NIC", "PAN",
      "PRI", "SLV", "SPM", "SXM", "TCA", "TTO", "USA", "VCT", "VGB", "VIR",
    ] as const,
  },
  sam: {
    name: "南美",
    center: [-60, -15] as const,
    population: 435_293_764,
    internetBps: 8376,
    slots: 4,
    bubblePoints: [[-46.6, -23.5], [-58.4, -34.6], [-74.1, 4.7], [-77.0, -12.0], [-70.7, -33.4]] as const,
    countries: [
      "ARG", "BOL", "BRA", "CHL", "COL", "ECU", "FLK", "GUY", "PER", "PRY", "SGS", "SUR", "URY", "VEN",
    ] as const,
  },
  eu: {
    name: "欧洲",
    center: [12, 51] as const,
    population: 599_014_319,
    internetBps: 9141,
    slots: 6,
    bubblePoints: [[2.3, 48.9], [13.4, 52.5], [-0.1, 51.5], [12.5, 41.9], [21.0, 52.2]] as const,
    countries: [
      "ALB", "ALD", "AND", "AUT", "BEL", "BGR", "BIH", "BLR", "CHE", "CZE", "DEU", "DNK", "ESP", "EST",
      "FIN", "FRA", "FRO", "GBR", "GGY", "GRC", "HRV", "HUN", "IMN", "IRL", "ISL", "ITA", "JEY", "KOS",
      "LIE", "LTU", "LUX", "LVA", "MCO", "MDA", "MKD", "MLT", "MNE", "NLD", "NOR", "POL", "PRT", "ROU",
      "SMR", "SRB", "SVK", "SVN", "SWE", "UKR", "VAT",
    ] as const,
  },
  as: {
    name: "亚洲",
    center: [89, 36] as const,
    population: 4_915_752_861,
    internetBps: 7613,
    slots: 12,
    bubblePoints: [[116.4, 39.9], [121.5, 31.2], [77.2, 28.6], [139.7, 35.7], [103.8, 1.3], [37.6, 55.8]] as const,
    countries: [
      "AFG", "ARE", "ARM", "AZE", "BGD", "BHR", "BRN", "BTN", "CHN", "CYN", "CYP", "GEO", "HKG", "IDN",
      "IND", "IOT", "IRN", "IRQ", "ISR", "JOR", "JPN", "KAS", "KAZ", "KGZ", "KHM", "KOR", "KWT", "LAO",
      "LBN", "LKA", "MAC", "MDV", "MMR", "MNG", "MYS", "NPL", "OMN", "PAK", "PHL", "PRK", "PSX", "QAT",
      "RUS", "SAU", "SGP", "SYR", "THA", "TJK", "TKM", "TLS", "TUR", "UZB", "VNM", "YEM",
    ] as const,
  },
  af: {
    name: "非洲",
    center: [21, 1] as const,
    population: 1_512_196_879,
    internetBps: 4126,
    slots: 5,
    bubblePoints: [[3.4, 6.5], [31.2, 30.0], [28.0, -26.2], [36.8, -1.3], [-7.6, 33.6]] as const,
    countries: [
      "AGO", "ATF", "BDI", "BEN", "BFA", "BWA", "CAF", "CIV", "CMR", "COD", "COG", "COM", "CPV", "DJI",
      "DZA", "EGY", "ERI", "ETH", "GAB", "GHA", "GIN", "GMB", "GNB", "GNQ", "KEN", "LBR", "LBY", "LSO",
      "MAR", "MDG", "MLI", "MOZ", "MRT", "MUS", "MWI", "NAM", "NER", "NGA", "RWA", "SAH", "SDN", "SDS",
      "SEN", "SHN", "SLE", "SOL", "SOM", "STP", "SWZ", "SYC", "TCD", "TGO", "TUN", "TZA", "UGA", "ZAF",
      "ZMB", "ZWE",
    ] as const,
  },
  oc: {
    name: "大洋洲",
    center: [143, -23] as const,
    population: 46_616_521,
    internetBps: 7506,
    slots: 3,
    bubblePoints: [[151.2, -33.9], [144.9, -37.8], [174.8, -36.8], [153.0, -27.5], [147.2, -9.4]] as const,
    countries: [
      "ASM", "ATC", "AUS", "COK", "FJI", "FSM", "GUM", "HMD", "IOA", "KIR", "MHL", "MNP", "NCL", "NFK",
      "NIU", "NRU", "NZL", "PCN", "PLW", "PNG", "PYF", "SLB", "TON", "TUV", "VUT", "WLF", "WSM",
    ] as const,
  },
} as const

export type RegionId = keyof typeof rawRegions
export const regionIds = Object.keys(rawRegions) as RegionId[]

function buildRegionSpec<K extends RegionId>(id: K): RegionSpec {
  const entry = rawRegions[id]
  return {
    id,
    ...entry,
    slotCapacity: Math.ceil(entry.population / entry.slots),
  }
}

export const regions: Readonly<Record<RegionId, RegionSpec>> = {
  na: buildRegionSpec("na"),
  sam: buildRegionSpec("sam"),
  eu: buildRegionSpec("eu"),
  as: buildRegionSpec("as"),
  af: buildRegionSpec("af"),
  oc: buildRegionSpec("oc"),
}

const countryToRegion = new Map<string, RegionId>()
for (const id of regionIds) {
  for (const countryId of regions[id].countries) countryToRegion.set(countryId, id)
}

export const globalPlayablePopulation = regionIds.reduce((sum, id) => sum + regions[id].population, 0)

export function regionSpec(id: RegionId): RegionSpec {
  return regions[id]
}

export function regionOfCountry(countryId: string): RegionId | undefined {
  return countryToRegion.get(countryId)
}

export function regionCapacity(id: RegionId): number {
  return regions[id].slots
}

/**
 * Cumulative overseas data-center allowance per continent once entered:
 * - tier 0 (entered, <25%): 1 outpost center
 * - tier 1 (25%+): ~1/3 of slots (at least 2 if slots >= 2)
 * - tier 2 (50%+): ~2/3 of slots
 * - tier 3 (75%+): all slots
 */
export function slotUnlockLimit(slots: number, tier: 0 | 1 | 2 | 3): number {
  if (slots <= 0) return 0
  if (tier === 0) return Math.min(slots, 1)
  if (tier === 3) return slots
  if (tier === 1) return Math.min(slots, Math.max(2, Math.ceil(slots / 3)))
  return Math.min(slots, Math.max(2, Math.ceil(slots * 2 / 3)))
}
