import type { populationShares } from "../../../../packages/game/population.ts"
import type { FactionId } from "../../../../packages/rules/v0.1/factions/roster.ts"

export type PopulationProfile = NonNullable<ReturnType<typeof populationShares>>
export const populationColors = {
  gpt: ["#398474", "#00e3b8"], claude: ["#a8685e", "#ff9582"], grok: ["#846f9e", "#d7a0ff"],
} as const satisfies Record<FactionId, readonly [string, string]>

function hash(x: number, y: number, seed: number) {
  let n = Math.imul(x ^ seed, 1597334677) ^ Math.imul(y + 1013, 3812015801)
  n = Math.imul(n ^ (n >>> 16), 2246822507)
  return ((n ^ (n >>> 13)) >>> 0) / 0x100000000
}

function noise(x: number, y: number, seed: number) {
  const i = Math.floor(x), j = Math.floor(y)
  const dx = x - i, dy = y - j
  const u = dx * dx * (3 - 2 * dx), v = dy * dy * (3 - 2 * dy)
  const a = hash(i, j, seed) * (1 - u) + hash(i + 1, j, seed) * u
  const b = hash(i, j + 1, seed) * (1 - u) + hash(i + 1, j + 1, seed) * u
  return a * (1 - v) + b * v
}

const bins = 1024
const bin = (value: number) => Math.min(bins - 1, Math.max(0, Math.floor(value)))

function cutoff(histogram: Float64Array, target: number) {
  for (let index = 0; index < histogram.length; index++) {
    const weight = histogram[index]
    if (weight && target <= weight) return { index, fraction: target / weight }
    target -= weight
  }
  return { index: bins, fraction: 1 }
}

/** A country mask is sampled once. Time moves the fronts, while counts determine painted area. */
export function createPopulationField(width: number, mask: Uint8ClampedArray, cellSize: number, seed: number) {
  const offsets: number[] = []
  let area = 0
  for (let i = 3; i < mask.length; i += 4) {
    if (mask[i]) { offsets.push(i - 3); area += mask[i] }
  }
  const count = offsets.length
  const height = mask.length / (4 * width)
  const columns = Math.ceil(width / cellSize) + 4, rows = Math.ceil(height / cellSize) + 4
  const seeds = Array.from({ length: columns * rows }, (_, i) => {
    const x = i % columns - 2, y = Math.floor(i / columns) - 2
    return { x: x + .2 + .6 * hash(x, y, seed), y: y + .2 + .6 * hash(x, y, seed + 1),
      phase: 6.28 * hash(x, y, seed + 2), speed: 1.35 + .85 * hash(x, y, seed + 3) }
  })
  const nearest = new Uint32Array(count * 2), distances = new Float32Array(count * 2)
  const ownership = new Float32Array(count), waveX = new Float32Array(count), waveY = new Float32Array(count)
  for (let p = 0; p < count; p++) {
    const address = offsets[p] / 4
    const x = (address % width + .5) / cellSize, y = (Math.floor(address / width) + .5) / cellSize
    const wx = x + .12 * Math.sin(y * 2.9) + .07 * Math.sin((x + y) * 5.4)
    const wy = y + .12 * Math.cos(x * 3.3) + .07 * Math.sin((y - x) * 4.7)
    const col = Math.floor(wx) + 2, row = Math.floor(wy) + 2
    let first = Infinity, second = Infinity
    const slot = 2 * p
    for (let j = row - 1; j <= row + 1; j++) for (let i = col - 1; i <= col + 1; i++) {
      const index = j * columns + i
      const node = seeds[index]
      const d = (wx - node.x) ** 2 + (wy - node.y) ** 2
      if (d < first) {
        second = first; nearest[slot + 1] = nearest[slot]
        first = d; nearest[slot] = index
      } else if (d < second) {
        second = d; nearest[slot + 1] = index
      }
    }
    distances[slot] = Math.sqrt(first); distances[slot + 1] = Math.sqrt(second)
    ownership[p] = 135 + 510 * noise(wx * .63, wy * .63, seed + 4) + 225 * noise(wx * 1.6, wy * 1.6, seed + 5)
    waveX[p] = 94 * (noise(wx * .9, wy * .9, seed + 6) - .5)
    waveY[p] = 94 * (noise(wx * .9, wy * .9, seed + 7) - .5)
  }
  const pixels = new Uint8ClampedArray(mask.length), pulse = new Float32Array(seeds.length)
  const growth = new Uint16Array(count), tone = new Uint16Array(count)
  const spreadWeights = new Float64Array(bins), toneWeights = new Float64Array(bins)
  function paint(profile: PopulationProfile, seconds: number) {
    spreadWeights.fill(0); toneWeights.fill(0)
    const sin = Math.sin(seconds * 1.6), cos = Math.cos(seconds * 1.6)
    for (let i = 0; i < seeds.length; i++) {
      pulse[i] = 1 / (1 + .25 * Math.sin(seconds * seeds[i].speed + seeds[i].phase))
    }
    for (let p = 0; p < count; p++) {
      const slot = 2 * p
      growth[p] = bin(690 * Math.min(distances[slot] * pulse[nearest[slot]], distances[slot + 1] * pulse[nearest[slot + 1]]))
      tone[p] = bin(ownership[p] + sin * waveX[p] + cos * waveY[p])
      spreadWeights[growth[p]] += mask[offsets[p] + 3]
    }
    const cut = profile.coverage === 1 ? { index: bins, fraction: 1 } : cutoff(spreadWeights, area * profile.coverage)
    let painted = 0
    for (let p = 0; p < count; p++) {
      const alpha = offsets[p] + 3
      const fraction = growth[p] === cut.index ? cut.fraction : Number(growth[p] < cut.index)
      pixels[alpha] = mask[alpha] * fraction
      toneWeights[tone[p]] += pixels[alpha]
      painted += pixels[alpha]
    }
    // Quantiles of the visible land give each cohort its share, even on narrow islands.
    let weightBefore = 0
    for (let i = 0; i < bins; i++) {
      const weight = toneWeights[i]
      toneWeights[i] = weightBefore
      weightBefore += weight
    }
    let people = 0
    const stops = profile.shares.map(share => {
      people += share.people
      const rgb = parseInt(populationColors[share.faction][share.synthetic ? 1 : 0].slice(1), 16)
      return { end: painted * (people / profile.covered), red: rgb >> 16, green: (rgb >> 8) & 255, blue: rgb & 255 }
    })
    for (let p = 0; p < count; p++) {
      const at = offsets[p], alpha = pixels[at + 3]
      if (!alpha) continue
      const rank = toneWeights[tone[p]] + alpha / 2
      toneWeights[tone[p]] += alpha
      let index = 0
      while (index < stops.length - 1 && rank > stops[index].end) index++
      const color = stops[index]
      pixels[at] = color.red; pixels[at + 1] = color.green; pixels[at + 2] = color.blue
    }
    return pixels
  }
  return { pixels, paint }
}
