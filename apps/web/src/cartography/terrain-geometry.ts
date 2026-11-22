import { BufferAttribute, BufferGeometry, PlaneGeometry } from "three"
import { WORLD_HEIGHT, WORLD_WIDTH } from "./layout.ts"

const columns = 720, rows = 360, tileSize = 60

export function terrainTiles(altitudeAt: (index: number) => number): readonly BufferGeometry[] {
  const world = new PlaneGeometry(WORLD_WIDTH, WORLD_HEIGHT, columns, rows)
  const points = world.getAttribute("position")
  for (let i = 0; i < points.count; i++) points.setZ(i, altitudeAt(i))
  // Compute normals across tile edges before copying them so lighting stays continuous.
  world.computeVertexNormals()

  const template = new PlaneGeometry(1, 1, tileSize, tileSize)
  const index = template.getIndex()!
  const geometries: BufferGeometry[] = []
  for (let y = 0; y < rows; y += tileSize) for (let x = 0; x < columns; x += tileSize) {
    const tile = new BufferGeometry()
    // Tiles share topology and belong to the same scene lifecycle.
    tile.setIndex(index)
    for (const name of ["position", "normal", "uv"]) {
      const { array, itemSize } = world.getAttribute(name)
      const stride = (tileSize + 1) * itemSize
      const values = new Float32Array((tileSize + 1) * stride)
      for (let row = 0; row <= tileSize; row++) {
        const start = ((y + row) * (columns + 1) + x) * itemSize
        values.set(array.subarray(start, start + stride), row * stride)
      }
      tile.setAttribute(name, new BufferAttribute(values, itemSize))
    }
    tile.computeBoundingBox()
    tile.computeBoundingSphere()
    geometries.push(tile)
  }
  world.dispose()
  template.dispose()
  return geometries
}
