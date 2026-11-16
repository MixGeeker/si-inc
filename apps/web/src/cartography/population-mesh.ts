import { CanvasTexture, LinearFilter, PlaneGeometry, ShaderMaterial } from "three"
import { relief, type Atlas } from "./atlas"
import { Y_SCALE } from "./layout"
import type { PopulationSurface } from "./population-surface"

export function populationMesh(atlas: Atlas, surface: PopulationSurface) {
  const { west, south, east, north, canvas } = surface
  const columns = (east - west) * 2, rows = (north - south) * 2
  const geometry = new PlaneGeometry(east - west, (north - south) * Y_SCALE, columns, rows)
  geometry.translate((west + east) / 2, (north + south) * Y_SCALE / 2, 0)
  const vertices = geometry.getAttribute("position")
  for (let row = 0; row <= rows; row++) for (let col = 0; col <= columns; col++) {
    const index = ((90 - north) * 2 + row) * 721 + (west + 180) * 2 + col
    vertices.setZ(row * (columns + 1) + col, relief(atlas.heights[index]))
  }
  geometry.computeBoundingSphere()
  const texture = new CanvasTexture(canvas)
  texture.generateMipmaps = false
  texture.minFilter = texture.magFilter = LinearFilter
  const material = new ShaderMaterial({
    uniforms: { population: { value: texture } }, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    vertexShader: `varying vec2 coord; void main() {
      coord = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
    }`,
    fragmentShader: `varying vec2 coord; uniform sampler2D population;
      void main() { gl_FragColor = texture2D(population, coord); }`,
  })
  return { surface, geometry, material, texture, uploaded: -1 }
}
