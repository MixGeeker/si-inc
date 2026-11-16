import assert from "node:assert/strict"
import test from "node:test"
import { researchNode, trees } from "../../../packages/rules/v0.1/evolution/trees.ts"
import { bridges, cellCenter, cellHeight, cells, hive, researchTier, tierNumerals } from "../src/scenes/world/researchLayout.ts"

test("every research tile and glass bridge occupies its own visible hexagon on its page", () => {
  for (const tree of trees) {
    const occupied = new Set()
    function checkCell(cell) {
      const key = cell.join(",")
      assert.ok(!occupied.has(key), tree.id + " overlaps at " + key)
      occupied.add(key)
      const { x, y } = cellCenter(cell)
      assert.ok(x >= hive.radius && x <= hive.width - hive.radius)
      assert.ok(y >= cellHeight / 2 && y <= hive.height - cellHeight / 2)
    }
    for (const skill of tree.skills) {
      checkCell(cells[skill.id])
      assert.match(tierNumerals[researchTier(skill)], /^[IVX]+$/)
    }
    for (const bridge of bridges[tree.id]) {
      const destination = researchNode(bridge.to)
      assert.equal(researchNode(bridge.from).tree.id, tree.id)
      assert.equal(destination.tree.id, tree.id)
      assert.ok(destination.skill.requires.some(group => group.includes(bridge.from)))
      bridge.via.forEach(checkCell)
      const path = [cells[bridge.from], ...bridge.via, cells[bridge.to]].map(cellCenter)
      for (let i = 1; i < path.length; i++) {
        const distance = Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y)
        assert.ok(Math.abs(distance - cellHeight) < .001, bridge.from + " → " + bridge.to + " skips a hexagon")
      }
    }
  }
})
