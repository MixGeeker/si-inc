import { spratlyIslands } from "./place-names"
import boundariesUrl from "./data/countries.svg?url"
import elevationUrl from "./data/height.bin?url"
import flowUrl from "./data/november.bin?url"
import landUrl from "./data/land.png"
export { default as surfaceUrl } from "./data/surface.webp"
export { default as nightLightsUrl } from "./data/night-lights.webp"
export { default as vaporUrl } from "./data/vapor.webp"
export { relief } from "./layout"

export type Country = {
  id: string; name: string; lon: number; lat: number
  box: number[]; d: string; path: Path2D
  islandGroup?: { id: typeof spratlyIslands; lon: number; lat: number }
}
export type Location = { lon: number; lat: number; country: Country | null; siteId?: string; islandId?: typeof spratlyIslands }
export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
export const wrapLon = (lon: number) => ((lon + 180) % 360 + 360) % 360 - 180
const fromSouth = -89.875, fromWest = -179.875

async function fetchAsset(url: string) {
  const response = await fetch(url)
  if (!response.ok) throw Error(`地图文件读取失败 (${response.status})`)
  return response
}

export function imageElement(url: string): Promise<HTMLImageElement> {
  const image = new Image()
  image.src = url
  return image.decode().then(() => image)
}

export class Atlas {
  private readonly context = document.createElement("canvas").getContext("2d")!
  readonly countryById: ReadonlyMap<string, Country>
  constructor(readonly countries: Country[], readonly heights: Int16Array,
    readonly fields: Int16Array, private readonly land: Uint8ClampedArray) {
    this.countryById = new Map(countries.map(c => [c.id, c]))
  }

  isLand(lon: number, lat: number) {
    const x = Math.floor((wrapLon(lon) + 180) / 360 * 1024)
    const y = clamp(Math.floor((90 - lat) / 180 * 512), 0, 511)
    return this.land[(y * 1024 + x) * 4] >= 128
  }
  metres(lon: number, lat: number) {
    const x = (wrapLon(lon) + 180) * 2, y = clamp((90 - lat) * 2, 0, 360)
    const i = Math.floor(x), j = Math.floor(y), a = x - i, b = y - j
    const n = j * 721 + i, s = Math.min(j + 1, 360) * 721 + i, h = this.heights
    return (h[n] * (1-a) + h[n+1] * a) * (1-b) + (h[s] * (1-a) + h[s+1] * a) * b
  }
  locate(lon: number, lat: number): Location {
    lon = wrapLon(lon)
    for (const c of this.countries) {
      const [w,s,e,n] = c.box
      if (lon >= w && lon <= e && lat >= s && lat <= n && this.context.isPointInPath(c.path, lon+180, 90-lat, "evenodd"))
        return { lon, lat, country: c }
    }
    return { lon, lat, country: null }
  }
  // Missing drifter cells and masked coastal land must never become artificial zero currents.
  vector(lon: number, lat: number, layer: "air" | "sea", out: {x:number; y:number}) {
    if (layer === "sea" && this.isLand(lon,lat)) return false
    const x = (wrapLon(lon) - fromWest + 360) % 360, y = clamp(lat - fromSouth,0,179)
    const i = Math.floor(x), j = Math.floor(y), a = x-i, b = y-j
    const offset = layer === "sea" ? 2 : 0
    let u = 0, v = 0, weight = 0
    for (let dy=0;dy<=1;dy++) for (let dx=0;dx<=1;dx++) {
      const k = (Math.min(179,j+dy)*360 + (i+dx)%360)*4+offset
      const w = (dx ? a : 1-a)*(dy ? b : 1-b)
      if (this.fields[k] === -32768 || this.fields[k+1] === -32768) continue
      u += this.fields[k]*w; v += this.fields[k+1]*w; weight += w
    }
    if (weight < .5) return false
    const scale = weight * (layer === "sea" ? 1000 : 100)
    out.x = u/scale; out.y = v/scale
    return true
  }
}

async function readCountries(): Promise<Country[]> {
  const svg = await (await fetchAsset(boundariesUrl)).text()
  const xml = new DOMParser().parseFromString(svg, "image/svg+xml")
  if (xml.querySelector("parsererror")) throw Error("国家边界 SVG 无法读取")
  const countries = Array.from(xml.querySelectorAll("path")).map((el): Country => {
    const d = el.getAttribute("d")!
    const isSpratlyGroup = el.id === "CHN" && el.hasAttribute("data-island-name")
    return { id:el.id, name:el.getAttribute("data-name")!, d, path:new Path2D(d),
      lon:Number(el.getAttribute("data-lon")), lat:Number(el.getAttribute("data-lat")),
      islandGroup:isSpratlyGroup ? {id:spratlyIslands,lon:Number(el.getAttribute("data-island-lon")),lat:Number(el.getAttribute("data-island-lat"))} : undefined,
      box:el.getAttribute("data-box")!.split(",").map(Number) }
  })
  if (!countries.length) throw Error("国家边界 SVG 为空")
  return countries
}

let pendingCountries: Promise<Country[]> | undefined
export function loadCountries() {
  return pendingCountries ??= readCountries().catch(error => { pendingCountries = undefined; throw error })
}

async function readAtlas() {
  const [countries, heights, flows, mask] = await Promise.all([
    loadCountries(), fetchAsset(elevationUrl).then(r=>r.arrayBuffer()),
    fetchAsset(flowUrl).then(r=>r.arrayBuffer()), imageElement(landUrl),
  ])
  if (heights.byteLength !== 721*361*2 || flows.byteLength !== 360*180*8)
    throw Error("地图数据不完整")
  const canvas = document.createElement("canvas")
  canvas.width = mask.width; canvas.height = mask.height
  const ctx = canvas.getContext("2d")!
  ctx.drawImage(mask,0,0)
  return new Atlas(countries, new Int16Array(heights), new Int16Array(flows), ctx.getImageData(0,0,mask.width,mask.height).data)
}
let pending: Promise<Atlas> | undefined
export function loadAtlas() {
  return pending ??= readAtlas().catch(error => { pending = undefined; throw error })
}
