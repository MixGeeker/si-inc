import type { Country } from "./atlas"
import { createPopulationField, type PopulationProfile } from "./population-field"

/** Half-degree bounds coincide with vertices of the terrain mesh. The canvas is shared by both renderers. */
export class PopulationSurface {
  readonly canvas = document.createElement("canvas")
  readonly west: number
  readonly south: number
  readonly east: number
  readonly north: number
  readonly id: string
  private readonly context: CanvasRenderingContext2D
  private readonly field: ReturnType<typeof createPopulationField>
  private readonly image: ImageData
  private previousProfile?: PopulationProfile
  private previousTick = -1
  revision = 0

  constructor(country: Country) {
    this.id = country.id
    const [w, s, e, n] = country.box
    this.west = Math.max(-180, Math.floor((w - .01) * 2) / 2)
    this.south = Math.max(-90, Math.floor((s - .01) * 2) / 2)
    this.east = Math.min(180, Math.ceil((e + .01) * 2) / 2)
    this.north = Math.min(90, Math.ceil((n + .01) * 2) / 2)
    const spanX = this.east - this.west, spanY = this.north - this.south
    const span = Math.max(spanX, spanY)
    const scale = Math.min(640 / span, Math.max(24, 96 / span))
    this.canvas.width = Math.ceil(spanX * scale); this.canvas.height = Math.ceil(spanY * scale)
    this.context = this.canvas.getContext("2d")!
    this.context.save()
    this.context.scale(this.canvas.width / spanX, this.canvas.height / spanY)
    this.context.translate(-180 - this.west, this.north - 90)
    this.context.fill(country.path, "evenodd")
    this.context.restore()
    const mask = this.context.getImageData(0, 0, this.canvas.width, this.canvas.height)
    let seed = 0
    for (const c of country.id) seed = (Math.imul(seed, 31) + c.charCodeAt(0)) | 0
    const cellSize = Math.max(3, Math.min(scale, Math.min(this.canvas.width, this.canvas.height) / 4))
    this.field = createPopulationField(this.canvas.width, mask.data, cellSize, seed)
    this.image = new ImageData(this.field.pixels, this.canvas.width, this.canvas.height)
  }

  update(profile: PopulationProfile, elapsed: number, hz = 15) {
    const tick = Math.floor(elapsed * hz)
    if (this.previousProfile === profile && this.previousTick === tick) return
    this.field.paint(profile, tick / hz)
    this.context.putImageData(this.image, 0, 0)
    this.previousProfile = profile; this.previousTick = tick
    this.revision++
  }
}
