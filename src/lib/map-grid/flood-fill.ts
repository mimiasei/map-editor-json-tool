// ─── Map grid — flood fill ────────────────────────────────────────────────────
// Plain 4-connectivity BFS over a flat sizeX*sizeZ tile grid, with no file I/O
// — a pure helper reused by both the Water flood-fill tool (fills contiguous
// same-level tiles) and Terrain bucket-fill (fills contiguous same-biome
// tiles), issue #193 Phase 2/3. `matches` decides which array/condition is
// being flooded; this function only knows about adjacency.

const NEIGHBOR_OFFSETS: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]]

/**
 * Every node reachable from `startNode` by 4-connected steps where `matches`
 * returns true, including `startNode` itself (callers should check
 * `matches(startNode)` before calling if a non-matching start should be a
 * no-op — this function doesn't special-case it, matching a plain flood-fill
 * bucket tool's usual "click inside the region" precondition).
 */
export function floodFillRegion(
  startNode: number,
  sizeX: number,
  sizeZ: number,
  matches: (node: number) => boolean,
): number[] {
  const tileCount = sizeX * sizeZ
  if (sizeX <= 0 || sizeZ <= 0 || startNode < 0 || startNode >= tileCount) return []
  const visited = new Set<number>([startNode])
  const region: number[] = [startNode]
  const queue: number[] = [startNode]
  while (queue.length > 0) {
    const node = queue.pop() as number
    const x = node % sizeX
    const z = Math.floor(node / sizeX)
    for (const [dx, dz] of NEIGHBOR_OFFSETS) {
      const nx = x + dx
      const nz = z + dz
      if (nx < 0 || nx >= sizeX || nz < 0 || nz >= sizeZ) continue
      const nNode = nz * sizeX + nx
      if (visited.has(nNode) || !matches(nNode)) continue
      visited.add(nNode)
      region.push(nNode)
      queue.push(nNode)
    }
  }
  return region
}
