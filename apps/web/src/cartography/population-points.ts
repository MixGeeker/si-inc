import { populationShares, type CountryPopulations } from "../../../../packages/game/population.ts"
import type { FactionId } from "../../../../packages/rules/v0.1/factions/roster.ts"
import { relief, Y_SCALE } from "./layout.ts"

export const populationColors = {
  gpt: ["#398474", "#00e3b8"], claude: ["#a8685e", "#ff9582"], grok: ["#846f9e", "#d7a0ff"],
} as const satisfies Record<FactionId, readonly [string, string]>

export interface PopulationCountryShape {
  readonly id: string
  readonly box: readonly number[]
  readonly d: string
}

export interface PopulationPointCloud {
  readonly positions: Float32Array<ArrayBuffer>
  readonly colors: Uint8Array<ArrayBuffer>
  readonly groups: readonly { readonly color: string; readonly start: number; readonly count: number }[]
}

export type PopulationWorkerRequest =
  | { type: "init"; countries: readonly PopulationCountryShape[]; heights: Int16Array }
  | { type: "update"; version: number; populations: CountryPopulations }

export interface PopulationWorkerResponse {
  readonly version: number
  readonly cloud: PopulationPointCloud
}

const pointLimit = 20_000
const pointLift = .08
const width = 721
const palette = Object.values(populationColors).flat().map(color => {
  const value = parseInt(color.slice(1), 16)
  return { color, rgb: [value >> 16, value >> 8 & 255, value & 255] }
})

interface OutlineEdge {
  readonly top: number
  readonly bottom: number
  readonly x: number
  readonly slope: number
}

interface LandSpan {
  readonly west: number
  readonly east: number
  readonly y: number
  readonly cumulativeArea: number
}

// prepare_map.py emits closed rings with one absolute move and implicit line segments.
function outlineEdges(path: string) {
  const edges: OutlineEdge[] = []
  for (const [, ring] of path.matchAll(/M([^Z]+)Z/g)) {
    const coordinates = ring.trim().split(/[\s,]+/).map(Number)
    if (coordinates.length < 6 || coordinates.length % 2 !== 0 || !coordinates.every(Number.isFinite)) continue
    for (let a = 0, b = coordinates.length - 2; a < coordinates.length; b = a, a += 2) {
      const y1 = coordinates[a + 1], y2 = coordinates[b + 1]
      if (y1 === y2) continue
      const x1 = coordinates[a], x2 = coordinates[b]
      edges.push({ top: Math.min(y1, y2), bottom: Math.max(y1, y2), x: y1 < y2 ? x1 : x2, slope: (x2 - x1) / (y2 - y1) })
    }
  }
  return edges.sort((a, b) => a.top - b.top)
}

function landSpans(path: string) {
  const edges = outlineEdges(path)
  if (edges.length === 0) return []
  const top = edges[0].top
  const bottom = edges.reduce((max, edge) => Math.max(max, edge.bottom), top)
  const rows = Math.min(240, Math.max(8, Math.ceil((bottom - top) * 3)))
  const stride = (bottom - top) / rows
  const spans: LandSpan[] = []
  let active: OutlineEdge[] = []
  let nextEdge = 0, area = 0
  for (let row = 0; row < rows; row++) {
    const y = top + (row + .5) * stride
    active = active.filter(edge => y < edge.bottom)
    while (nextEdge < edges.length && edges[nextEdge].top <= y) {
      const edge = edges[nextEdge++]
      if (y < edge.bottom) active.push(edge)
    }
    const crossings = active.map(edge => edge.x + (y - edge.top) * edge.slope).sort((a, b) => a - b)
    // Pair all crossings of the country, respecting interior holes and detached islands.
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      const west = crossings[i], east = crossings[i + 1]
      if (east <= west) continue
      area += (east - west) * stride
      spans.push({ west, east, y, cumulativeArea: area })
    }
  }
  return spans
}

function terrainPointZ(heights: Int16Array, x: number, y: number) {
  const gridX = Math.max(0, Math.min(720, x * 2)), gridY = Math.max(0, Math.min(360, y * 2))
  const col = Math.min(719, Math.floor(gridX)), row = Math.min(359, Math.floor(gridY))
  const dx = gridX - col, dy = gridY - row
  const top = row * width + col, bottom = top + width
  const east = relief(heights[top + 1]), south = relief(heights[bottom])
  // PlaneGeometry divides each grid cell along its top-right to bottom-left diagonal.
  return pointLift + (dx + dy <= 1
    ? relief(heights[top]) * (1 - dx - dy) + east * dx + south * dy
    : relief(heights[bottom + 1]) * (dx + dy - 1) + east * (1 - dy) + south * (1 - dx))
}

function sampleCountry(country: PopulationCountryShape, heights: Int16Array, count: number) {
  const spans = landSpans(country.d)
  if (spans.length === 0) return new Float32Array()
  const area = spans[spans.length - 1].cumulativeArea
  let seed = 0
  for (const char of country.id) seed = Math.imul(seed, 31) + char.charCodeAt(0)
  const phase = (Math.imul(seed, 2654435761) >>> 0) / 0x100000000
  const points = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    // Any prefix spans the country, so a change in coverage adds or removes stable dots.
    const target = ((phase + i * .61803398875) % 1) * area
    let low = 0, high = spans.length - 1
    while (low < high) {
      const middle = (low + high) >>> 1
      if (spans[middle].cumulativeArea <= target) low = middle + 1
      else high = middle
    }
    const { west, east, y } = spans[low]
    const across = .0001 + ((phase + i * Math.SQRT2) % 1) * .9998
    const x = west + (east - west) * across
    points[i * 3] = x - 180
    points[i * 3 + 1] = (90 - y) * Y_SCALE
    points[i * 3 + 2] = terrainPointZ(heights, x, y)
  }
  return points
}

function countryPointBudgets(countries: readonly PopulationCountryShape[]) {
  const minimum = Math.min(10, Math.floor(pointLimit / Math.max(1, countries.length)))
  const sizes = countries.map(({ box: [west, south, east, north] }) =>
    Math.max(0, Math.min(1800 - minimum, Math.round(Math.min(120, east - west) * (north - south) * .55))))
  const total = sizes.reduce((sum, size) => sum + size, 0)
  const scale = total === 0 ? 1 : Math.min(1, (pointLimit - minimum * countries.length) / total)
  return sizes.map(size => minimum + Math.floor(size * scale))
}

export function createPopulationPointBuilder(countries: readonly PopulationCountryShape[], heights: Int16Array) {
  const shapes = [...countries].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  const budgets = countryPointBudgets(shapes)
  const cached = new Map<string, Float32Array>()
  return (populations: CountryPopulations): PopulationPointCloud => {
    const cohorts = new Map<string, Float32Array[]>()
    let pointCount = 0
    for (const [index, country] of shapes.entries()) {
      const profile = populationShares(populations[country.id])
      if (!profile) continue
      let points = cached.get(country.id)
      if (!points) {
        points = sampleCountry(country, heights, budgets[index])
        cached.set(country.id, points)
      }
      if (points.length === 0) continue
      const count = Math.max(1, Math.round(points.length / 3 * profile.coverage))
      let start = 0, people = 0
      for (const share of profile.shares) {
        people += share.people
        const end = Math.round(count * (people / profile.covered))
        if (end === start) continue
        const color = populationColors[share.faction][Number(share.synthetic)]
        const segments = cohorts.get(color) ?? []
        segments.push(points.subarray(start * 3, end * 3))
        cohorts.set(color, segments)
        start = end
      }
      pointCount += count
    }

    const positions = new Float32Array(pointCount * 3)
    const colors = new Uint8Array(pointCount * 3)
    const groups: PopulationPointCloud["groups"][number][] = []
    let offset = 0
    for (const { color, rgb } of palette) {
      const segments = cohorts.get(color)
      if (!segments) continue
      const start = offset / 3
      for (const segment of segments) {
        positions.set(segment, offset)
        const end = offset + segment.length
        for (; offset < end; offset += 3) colors.set(rgb, offset)
      }
      groups.push({ color, start, count: offset / 3 - start })
    }
    return { positions, colors, groups }
  }
}
