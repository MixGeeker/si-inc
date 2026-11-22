import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { Group, Mesh, MeshBasicMaterial, PlaneGeometry, Raycaster, Vector3 } from "three"
import { WORLD_HEIGHT, WORLD_WIDTH, Y_SCALE } from "../src/cartography/layout.ts"
import { terrainTiles } from "../src/cartography/terrain-geometry.ts"

test("terrain tiles preserve heights, normals, and picking at seams and map wraps", () => {
  const source = readFileSync(new URL("../src/cartography/data/height.bin", import.meta.url))
  const altitudeAt = index => Math.max(0, source.readInt16LE(index * 2)) * .00055
  const world = new PlaneGeometry(WORLD_WIDTH, WORLD_HEIGHT, 720, 360)
  const positions = world.getAttribute("position")
  for (let i = 0; i < positions.count; i++) positions.setZ(i, altitudeAt(i))
  world.computeVertexNormals()

  const tiles = terrainTiles(altitudeAt)
  assert.equal(tiles.reduce((sum, tile) => sum + tile.index.count, 0), world.index.count)
  for (const tile of tiles) {
    const uv = tile.getAttribute("uv")
    for (const i of [0, 60, uv.count - 61, uv.count - 1]) {
      const column = Math.round(uv.getX(i) * 720)
      const row = Math.round((1 - uv.getY(i)) * 360)
      const at = row * 721 + column
      for (const name of ["position", "normal", "uv"]) {
        const whole = world.getAttribute(name)
        const part = tile.getAttribute(name)
        assert.deepEqual(part.array.slice(i * part.itemSize, (i + 1) * part.itemSize),
          whole.array.slice(at * whole.itemSize, (at + 1) * whole.itemSize))
      }
    }
  }

  const material = new MeshBasicMaterial()
  const wrap = geometries => {
    const root = new Group()
    for (const offset of [-WORLD_WIDTH, 0, WORLD_WIDTH]) {
      const copy = new Group()
      copy.position.x = offset
      for (const geometry of geometries) copy.add(new Mesh(geometry, material))
      root.add(copy)
    }
    root.updateMatrixWorld(true)
    return root
  }
  const whole = wrap([world]), tiled = wrap(tiles)
  const ray = new Raycaster()
  const direction = new Vector3(7, -10, -28).normalize()
  for (const [longitude, latitude] of [[-122, 37], [86.9, 27.99], [90, 30], [179.99, 0], [180.1, 15], [-180.1, -15]]) {
    ray.set(new Vector3(longitude - 7, latitude * Y_SCALE + 10, 28), direction)
    const before = ray.intersectObject(whole, true)[0]
    const after = ray.intersectObject(tiled, true)[0]
    assert.ok(before && after)
    assert.ok(before.point.distanceTo(after.point) < 1e-8)
  }
  material.dispose()
  world.dispose()
  for (const tile of tiles) tile.dispose()
})
