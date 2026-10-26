// When an area is lowered to level -1 next to a lake, the lake spreads over it: water is only ever painted at level -1, so a lowered tile
// connected to water through other level -1 tiles is part of the same basin. Run once after the stroke, not while drawing, so painting stays light.

/**
 * The water to add after `levelChanges` were applied to `levelsMap`: every level -1 tile without water that is reachable through
 * level -1 tiles from a water tile next to one of the changed tiles, with that water's id. `waterMap` and `levelsMap` are from before the edit.
 */
export function waterExtensionAfterLevelPaint(
  levelsMap: readonly number[],
  waterMap: readonly number[],
  sizeX: number,
  sizeZ: number,
  levelChanges: readonly { node: number; level: number }[],
): { node: number; waterId: number }[] {
  const changed = new Map<number, number>()
  for (const { node, level } of levelChanges) changed.set(node, level)
  const levelAt = (node: number) => changed.get(node) ?? levelsMap[node] ?? 0
  const NEIGHBOURS = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const
  const neighbours = (node: number): number[] => {
    const x = node % sizeX
    const z = Math.floor(node / sizeX)
    const out: number[] = []
    for (const [dx, dz] of NEIGHBOURS) {
      const nx = x + dx
      const nz = z + dz
      if (nx >= 0 && nz >= 0 && nx < sizeX && nz < sizeZ) out.push(nz * sizeX + nx)
    }
    return out
  }
  const added = new Map<number, number>()
  const queue: number[] = []
  for (const [node, level] of changed) {
    if (level !== -1) continue
    for (const n of neighbours(node)) {
      const id = waterMap[n]
      if (id && levelAt(n) === -1 && !waterMap[node] && !added.has(node)) {
        added.set(node, id)
        queue.push(node)
      }
    }
  }
  for (let i = 0; i < queue.length; i++) {
    const node = queue[i]
    const id = added.get(node)!
    for (const n of neighbours(node)) {
      if (levelAt(n) !== -1 || waterMap[n] || added.has(n)) continue
      added.set(n, id)
      queue.push(n)
    }
  }
  return [...added].map(([node, waterId]) => ({ node, waterId }))
}
