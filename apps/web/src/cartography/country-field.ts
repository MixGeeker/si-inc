import { ClampToEdgeWrapping, DataTexture, NearestFilter, RepeatWrapping, RGBAFormat, type Texture } from "three"
import { populationShares, type CountryPopulation, type CountryPopulations } from "../../../../packages/game/population.ts"
import type { FactionId } from "../../../../packages/rules/v0.1/factions/roster.ts"
import type { Atlas } from "./atlas"

/** Pure flat, high-saturation solid pigments for territory fills. */
export const populationColors = {
  gpt: ["#00a854", "#00c462"],
  claude: ["#eb4409", "#ff5c0a"],
  grok: ["#7524e6", "#8f38ff"],
} as const satisfies Record<FactionId, readonly [string, string]>

const FIELD_W = 1440
const FIELD_H = 720
const BINS = 128
const BLEED_RADIUS = 5

function countrySeed(id: string) {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619)
  return (h >>> 0) / 0x100000000
}

/**
 * Precomputes a 1440x720 (0.25 deg) RGBA lookup texture once per atlas load:
 * - R: 1-based country index (including a ~1 deg coastal outward bleed halo so territories spill past coastlines)
 * - G: signed border field (0.5 = exact border/coastline, >0.5 = interior, 0..0.5 = outward coastal bleed zone)
 * - B: normalized spatial sector quantile [0..1] within the country for clean multi-faction territories
 * - A: normalized settlement-first spread quantile [0..1] so partial coverage fills real urban hubs first
 */
export function buildCountryFieldTexture(atlas: Atlas, nightLightsTexture?: Texture) {
  const count = Math.min(254, atlas.countries.length)
  const canvas = document.createElement("canvas")
  canvas.width = FIELD_W
  canvas.height = FIELD_H
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!
  ctx.imageSmoothingEnabled = false
  ctx.save()
  ctx.scale(FIELD_W / 360, FIELD_H / 180)
  for (let i = 0; i < count; i++) {
    const cid = i + 1
    ctx.fillStyle = `rgb(${cid},${255 - cid},255)`
    ctx.fill(atlas.countries[i].path, "evenodd")
  }
  ctx.restore()

  const raw = ctx.getImageData(0, 0, FIELD_W, FIELD_H).data
  const totalPixels = FIELD_W * FIELD_H
  const cidGrid = new Uint8Array(totalPixels)

  for (let p = 0; p < totalPixels; p++) {
    const o = p * 4
    const r = raw[o], g = raw[o + 1], b = raw[o + 2], a = raw[o + 3]
    if (a === 255 && b === 255 && r + g === 255 && r >= 1 && r <= count) {
      cidGrid[p] = r
    }
  }
  // Recover 1px antialiased coastal/border pixels from their nearest uncorrupted neighbor.
  const copy = cidGrid.slice()
  for (let y = 0; y < FIELD_H; y++) {
    const row = y * FIELD_W
    for (let x = 0; x < FIELD_W; x++) {
      const p = row + x
      if (copy[p] !== 0 || raw[p * 4 + 3] < 96) continue
      const left = copy[row + (x + FIELD_W - 1) % FIELD_W]
      const right = copy[row + (x + 1) % FIELD_W]
      const up = y > 0 ? copy[p - FIELD_W] : 0
      const down = y + 1 < FIELD_H ? copy[p + FIELD_W] : 0
      cidGrid[p] = left || right || up || down
    }
  }

  const lights = new Uint8Array(totalPixels)
  const urbanField = new Float32Array(totalPixels)
  const img = nightLightsTexture?.image as CanvasImageSource | undefined
  if (img) {
    ctx.clearRect(0, 0, FIELD_W, FIELD_H)
    ctx.imageSmoothingEnabled = true
    ctx.drawImage(img, 0, 0, FIELD_W, FIELD_H)
    const lightData = ctx.getImageData(0, 0, FIELD_W, FIELD_H).data
    for (let p = 0; p < totalPixels; p++) lights[p] = lightData[p * 4 + 3]

    // Separable 13-tap box blur (~1.5 deg radius) builds smooth metropolitan growth hubs instead of isolated speckles.
    const tmp = new Float32Array(totalPixels)
    const R = 6
    for (let y = 0; y < FIELD_H; y++) {
      const row = y * FIELD_W
      let sum = 0
      for (let k = -R; k <= R; k++) sum += lights[row + (k + FIELD_W) % FIELD_W]
      for (let x = 0; x < FIELD_W; x++) {
        tmp[row + x] = sum / (2 * R + 1)
        sum += lights[row + (x + R + 1) % FIELD_W] - lights[row + (x - R + FIELD_W) % FIELD_W]
      }
    }
    for (let x = 0; x < FIELD_W; x++) {
      let sum = 0
      for (let k = -R; k <= R; k++) sum += tmp[Math.min(FIELD_H - 1, Math.max(0, k)) * FIELD_W + x]
      for (let y = 0; y < FIELD_H; y++) {
        urbanField[y * FIELD_W + x] = sum / ((2 * R + 1) * 255)
        const yAdd = Math.min(FIELD_H - 1, y + R + 1)
        const ySub = Math.max(0, y - R)
        sum += tmp[yAdd * FIELD_W + x] - tmp[ySub * FIELD_W + x]
      }
    }
  }

  // Two-pass chamfer distance transform inside country borders.
  const dist = new Float32Array(totalPixels)
  const INF = 1e4
  for (let y = 0; y < FIELD_H; y++) {
    const row = y * FIELD_W
    for (let x = 0; x < FIELD_W; x++) {
      const p = row + x
      const id = cidGrid[p]
      if (id === 0) { dist[p] = 0; continue }
      const l = cidGrid[row + (x + FIELD_W - 1) % FIELD_W]
      const r = cidGrid[row + (x + 1) % FIELD_W]
      const u = y > 0 ? cidGrid[p - FIELD_W] : 0
      const d = y + 1 < FIELD_H ? cidGrid[p + FIELD_W] : 0
      if (l !== id || r !== id || u !== id || d !== id) {
        dist[p] = 0
      } else {
        let best = INF
        if (x > 0) best = Math.min(best, dist[p - 1] + 1)
        if (y > 0) {
          best = Math.min(best, dist[p - FIELD_W] + 1)
          if (x > 0 && cidGrid[p - FIELD_W - 1] === id) best = Math.min(best, dist[p - FIELD_W - 1] + 1.414)
          if (x + 1 < FIELD_W && cidGrid[p - FIELD_W + 1] === id) best = Math.min(best, dist[p - FIELD_W + 1] + 1.414)
        }
        dist[p] = best
      }
    }
  }
  for (let y = FIELD_H - 1; y >= 0; y--) {
    const row = y * FIELD_W
    for (let x = FIELD_W - 1; x >= 0; x--) {
      const p = row + x
      const id = cidGrid[p]
      if (id === 0 || dist[p] === 0) continue
      let best = dist[p]
      if (x + 1 < FIELD_W) best = Math.min(best, dist[p + 1] + 1)
      if (y + 1 < FIELD_H) {
        best = Math.min(best, dist[p + FIELD_W] + 1)
        if (x + 1 < FIELD_W && cidGrid[p + FIELD_W + 1] === id) best = Math.min(best, dist[p + FIELD_W + 1] + 1.414)
        if (x > 0 && cidGrid[p + FIELD_W - 1] === id) best = Math.min(best, dist[p + FIELD_W - 1] + 1.414)
      }
      dist[p] = best
    }
  }

  const counts = new Uint32Array(count + 1)
  for (let p = 0; p < totalPixels; p++) counts[cidGrid[p]]++
  const offsets = new Uint32Array(count + 2)
  for (let i = 1; i <= count; i++) offsets[i + 1] = offsets[i] + counts[i]
  const cursor = offsets.slice()
  const members = new Uint32Array(offsets[count + 1])
  for (let p = 0; p < totalPixels; p++) {
    const id = cidGrid[p]
    if (id > 0) members[cursor[id]++] = p
  }

  const sectorBytes = new Uint8Array(totalPixels)
  const spreadBytes = new Uint8Array(totalPixels)
  const signedBytes = new Uint8Array(totalPixels)
  const hist = new Uint32Array(BINS)
  const cdf = new Uint32Array(BINS)
  let maxScratch = 0
  for (let i = 1; i <= count; i++) if (counts[i] > maxScratch) maxScratch = counts[i]
  const valuesA = new Float32Array(maxScratch)
  const valuesB = new Float32Array(maxScratch)

  for (let i = 0; i < count; i++) {
    const cid = i + 1
    const start = offsets[cid], len = counts[cid]
    if (len === 0) continue
    const country = atlas.countries[i]
    const seed = countrySeed(country.id)
    const angle = seed * Math.PI * 2
    const cosA = Math.cos(angle), sinA = Math.sin(angle)
    const [west, south, east, north] = country.box
    const cx = ((west + east) * 0.5 + 180) * (FIELD_W / 360)
    const cy = (90 - (south + north) * 0.5) * (FIELD_H / 180)
    const span = Math.max(4, Math.hypot((east - west) * (FIELD_W / 360), (north - south) * (FIELD_H / 180)))
    const freq = 6.2831853 / Math.max(10, span * 0.55)

    let minSec = Infinity, maxSec = -Infinity
    let minSpr = Infinity, maxSpr = -Infinity

    for (let k = 0; k < len; k++) {
      const p = members[start + k]
      const x = p % FIELD_W, y = (p - x) / FIELD_W
      let dx = x - cx
      if (dx > FIELD_W * 0.5) dx -= FIELD_W
      else if (dx < -FIELD_W * 0.5) dx += FIELD_W
      const dy = y - cy
      const along = dx * cosA + dy * sinA
      const across = -dx * sinA + dy * cosA
      const sec = along + Math.sin(across * freq + seed * 6.28) * (span * 0.11)
      valuesA[k] = sec
      if (sec < minSec) minSec = sec
      if (sec > maxSec) maxSec = sec

      const urban = Math.max(lights[p] / 255 * 0.55, urbanField[p])
      const latDeg = 90 - (y + 0.5) * (180 / FIELD_H)
      const polarPenalty = Math.max(0, (Math.abs(latDeg) - 60) / 22) * 0.95
      const wave = 0.5 + 0.5 * Math.sin(dx * 0.085 + seed * 5.1) * Math.cos(dy * 0.095 - seed * 3.7)
      const priority = Math.pow(urban, 0.48) * 2.4 + wave * 0.22 - polarPenalty
      const spr = -priority
      valuesB[k] = spr
      if (spr < minSpr) minSpr = spr
      if (spr > maxSpr) maxSpr = spr

      // True linear SDF slope (+24 per 0.25 deg texel inside border, 128 right on border/coastline).
      signedBytes[p] = Math.min(255, Math.round(128 + dist[p] * 24))
    }

    hist.fill(0)
    const rangeSec = Math.max(1e-5, maxSec - minSec)
    for (let k = 0; k < len; k++) {
      const b = Math.min(BINS - 1, Math.max(0, Math.floor((valuesA[k] - minSec) / rangeSec * BINS)))
      hist[b]++
    }
    let acc = 0
    for (let b = 0; b < BINS; b++) { cdf[b] = acc; acc += hist[b] }
    for (let k = 0; k < len; k++) {
      const u = (valuesA[k] - minSec) / rangeSec * BINS
      const b = Math.min(BINS - 1, Math.max(0, Math.floor(u)))
      const frac = u - b
      const q = (cdf[b] + hist[b] * frac) / len
      sectorBytes[members[start + k]] = Math.min(255, Math.max(0, Math.round(q * 255)))
    }

    hist.fill(0)
    const rangeSpr = Math.max(1e-5, maxSpr - minSpr)
    for (let k = 0; k < len; k++) {
      const b = Math.min(BINS - 1, Math.max(0, Math.floor((valuesB[k] - minSpr) / rangeSpr * BINS)))
      hist[b]++
    }
    acc = 0
    for (let b = 0; b < BINS; b++) { cdf[b] = acc; acc += hist[b] }
    for (let k = 0; k < len; k++) {
      const u = (valuesB[k] - minSpr) / rangeSpr * BINS
      const b = Math.min(BINS - 1, Math.max(0, Math.floor(u)))
      const frac = u - b
      const q = (cdf[b] + hist[b] * frac) / len
      spreadBytes[members[start + k]] = Math.min(255, Math.max(0, Math.round(q * 255)))
    }
  }

  // Exact isotropic Euclidean coastal dilation (radius = 4px = 1.0 deg) so colors bleed smoothly past coastlines.
  const outCid = cidGrid.slice()
  const outSec = sectorBytes.slice()
  const outSpr = spreadBytes.slice()
  const bestDistSq = new Float32Array(totalPixels)
  bestDistSq.fill(1e6)
  const rMaxSq = (BLEED_RADIUS + 0.35) * (BLEED_RADIUS + 0.35)

  for (let y = 1; y < FIELD_H - 1; y++) {
    const row = y * FIELD_W
    for (let x = 0; x < FIELD_W; x++) {
      const p = row + x
      const id = cidGrid[p]
      if (id === 0) continue
      const l = cidGrid[row + (x + FIELD_W - 1) % FIELD_W]
      const r = cidGrid[row + (x + 1) % FIELD_W]
      const u = cidGrid[p - FIELD_W]
      const d = cidGrid[p + FIELD_W]
      if (l !== 0 && r !== 0 && u !== 0 && d !== 0) continue

      const yMin = Math.max(0, y - BLEED_RADIUS)
      const yMax = Math.min(FIELD_H - 1, y + BLEED_RADIUS)
      for (let ny = yMin; ny <= yMax; ny++) {
        const dy = ny - y
        const dySq = dy * dy
        const nRow = ny * FIELD_W
        for (let dx = -BLEED_RADIUS; dx <= BLEED_RADIUS; dx++) {
          const dSq = dySq + dx * dx
          if (dSq === 0 || dSq > rMaxSq) continue
          const nx = (x + dx + FIELD_W) % FIELD_W
          const q = nRow + nx
          if (cidGrid[q] !== 0 || dSq >= bestDistSq[q]) continue
          bestDistSq[q] = dSq
          outCid[q] = id
          outSec[q] = sectorBytes[p]
          outSpr[q] = spreadBytes[p]
          signedBytes[q] = Math.max(4, Math.round(128 - Math.sqrt(dSq) * 24))
        }
      }
    }
  }

  const rgba = new Uint8Array(totalPixels * 4)
  for (let y = 0; y < FIELD_H; y++) {
    const srcRow = y * FIELD_W
    const dstRow = (FIELD_H - 1 - y) * FIELD_W
    for (let x = 0; x < FIELD_W; x++) {
      const s = srcRow + x
      const d = (dstRow + x) * 4
      rgba[d] = outCid[s]
      rgba[d + 1] = signedBytes[s]
      rgba[d + 2] = outSec[s]
      rgba[d + 3] = outSpr[s]
    }
  }

  const texture = new DataTexture(rgba, FIELD_W, FIELD_H, RGBAFormat)
  texture.minFilter = NearestFilter
  texture.magFilter = NearestFilter
  texture.wrapS = RepeatWrapping
  texture.wrapT = ClampToEdgeWrapping
  texture.generateMipmaps = false
  texture.needsUpdate = true
  return texture
}

export function encodeCountryPopulations(
  countryIds: readonly string[],
  populations: CountryPopulations,
  data: Uint8Array = new Uint8Array(256 * 2 * 4),
) {
  data.fill(0)
  const count = Math.min(254, countryIds.length)
  for (let i = 0; i < count; i++) {
    const cid = i + 1
    const profile = populationShares(populations[countryIds[i]])
    if (!profile || profile.coverage <= 0) continue

    let gptImm = 0, gptSyn = 0
    let claudeImm = 0, claudeSyn = 0
    let grokImm = 0, grokSyn = 0
    for (const s of profile.shares) {
      if (s.faction === "gpt") { if (s.synthetic) gptSyn += s.people; else gptImm += s.people }
      else if (s.faction === "claude") { if (s.synthetic) claudeSyn += s.people; else claudeImm += s.people }
      else if (s.faction === "grok") { if (s.synthetic) grokSyn += s.people; else grokImm += s.people }
    }
    const gptTot = gptImm + gptSyn
    const claudeTot = claudeImm + claudeSyn
    const grokTot = grokImm + grokSyn
    const covered = profile.covered
    const totalSyn = gptSyn + claudeSyn + grokSyn

    const r0 = cid * 4
    data[r0] = Math.max(1, Math.min(255, Math.round(profile.coverage * 255)))
    data[r0 + 1] = Math.min(255, Math.round((totalSyn / covered) * 255))
    data[r0 + 2] = Math.min(255, Math.round((gptTot / covered) * 255))
    data[r0 + 3] = Math.min(255, Math.round((claudeTot / covered) * 255))

    const r1 = (256 + cid) * 4
    data[r1] = gptTot > 0 ? Math.min(255, Math.round((gptSyn / gptTot) * 255)) : 0
    data[r1 + 1] = claudeTot > 0 ? Math.min(255, Math.round((claudeSyn / claudeTot) * 255)) : 0
    data[r1 + 2] = grokTot > 0 ? Math.min(255, Math.round((grokSyn / grokTot) * 255)) : 0
    data[r1 + 3] = (cid * 73) & 255
  }
  return data
}

/** Fallback fill style for the 2D SVG map when WebGL is unavailable. */
export function flatCountryFill(entry: CountryPopulation | undefined) {
  const profile = entry ? populationShares(entry) : null
  if (!profile || profile.coverage <= 0) return null
  const totals: Record<FactionId, { total: number; syn: number }> = {
    gpt: { total: 0, syn: 0 },
    claude: { total: 0, syn: 0 },
    grok: { total: 0, syn: 0 },
  }
  for (const s of profile.shares) {
    totals[s.faction].total += s.people
    if (s.synthetic) totals[s.faction].syn += s.people
  }
  let best: FactionId = "gpt"
  for (const id of ["claude", "grok"] as const) {
    if (totals[id].total > totals[best].total) best = id
  }
  const synMostly = totals[best].syn * 2 >= totals[best].total ? 1 : 0
  return {
    color: populationColors[best][synMostly],
    opacity: 0.72 + 0.26 * profile.coverage,
  }
}

export function createCountryPopulationTexture() {
  const data = new Uint8Array(256 * 2 * 4)
  const texture = new DataTexture(data, 256, 2, RGBAFormat)
  texture.minFilter = NearestFilter
  texture.magFilter = NearestFilter
  texture.wrapS = ClampToEdgeWrapping
  texture.wrapT = ClampToEdgeWrapping
  texture.generateMipmaps = false
  texture.needsUpdate = true
  return { texture, data }
}

export function updateCountryPopulationTexture(
  target: { texture: DataTexture; data: Uint8Array },
  atlas: Atlas,
  populations: CountryPopulations,
) {
  encodeCountryPopulations(atlas.countries.map(c => c.id), populations, target.data)
  target.texture.needsUpdate = true
}
