import { CanvasTexture, SRGBColorSpace } from "three"
import { regionOfCountry } from "../../../../packages/rules/v0.1/world/regions"
import type { Country } from "../cartography/atlas"
import { layers, regionIds, snapshot, type Layer, type RegionId } from "./snapshot"

const width = 1024, height = 512

function surface(readOften = false) {
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d", { willReadFrequently: readOften })
  if (!ctx) throw new Error("Cannot draw the world atlas")
  return ctx
}

export function createAtlas(countries: readonly Country[]) {
  const ink = surface(), mask = surface(true)
  const paths = regionIds.map(() => new Path2D())
  const projection = new DOMMatrix().scale(width / 360, height / 180)
  for (const country of countries) {
    const id = regionOfCountry(country.id)
    if (id) paths[regionIds.indexOf(id)].addPath(country.path, projection)
  }
  paths.forEach((path, i) => {
    mask.fillStyle = `rgb(${(i + 1) * 16} 0 0)`
    mask.fill(path, "evenodd")
  })
  const ids = mask.getImageData(0, 0, width, height).data
  const texture = new CanvasTexture(ink.canvas)
  texture.colorSpace = SRGBColorSpace

  function paint(layer: Layer, selected: RegionId) {
    ink.fillStyle = "#132d3a"
    ink.fillRect(0, 0, width, height)
    ink.beginPath()
    for (let x = 0; x < width; x += width / 24) { ink.moveTo(x, 0); ink.lineTo(x, height) }
    for (let y = 0; y < height; y += height / 12) { ink.moveTo(0, y); ink.lineTo(width, y) }
    ink.strokeStyle = "#294452"
    ink.lineWidth = 0.65
    ink.stroke()
    const rgb = [1, 3, 5].map(start => parseInt(layers[layer].color.slice(start, start + 2), 16))
    regionIds.forEach((id, i) => {
      const t = snapshot[id][layer] / 10_000
      const channels = [35, 69, 76].map((v, k) => Math.round(v + (rgb[k] - v) * t))
      ink.fillStyle = `rgb(${channels.join(" ")})`
      ink.fill(paths[i], "evenodd")
      ink.lineWidth = 0.75
      ink.strokeStyle = "#1a3a43"
      ink.stroke(paths[i])
    })
    ink.strokeStyle = "#fff2b7"
    ink.lineWidth = 2
    ink.stroke(paths[regionIds.indexOf(selected)])
    texture.needsUpdate = true
  }

  function pick(u: number, v: number): RegionId | undefined {
    const x = ((Math.floor(u * width) % width) + width) % width
    const y = Math.min(height - 1, Math.max(0, Math.floor((1 - v) * height)))
    const k = 4 * (y * width + x)
    const red = ids[k]
    if (!red || ids[k + 3] !== 255 || red % 16 !== 0) return undefined
    return regionIds[red / 16 - 1]
  }
  return { texture, paint, pick }
}
