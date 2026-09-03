// ─── RMG zone connections — roads + a river (issue #210, Milestone 2) ──────
// Physically realizes the zone graph's own abstract edges (zone-graph.ts)
// as real painted roads, and lays one river across the map's most
// graph-distant pair of zones — both via a plain BFS shortest path over
// tiles not already claimed by a placed object's solid footprint, so
// neither a road nor the river ever tries to run straight through a
// dwelling/mine.

const NEIGHBOR_OFFSETS: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]]

/**
 * Plain BFS shortest path from `start` to `goal` over tiles not in
 * `blocked`, with `goal` itself exempted from the `blocked` check — a
 * zone's anchor (used as both a spawn point and a road/river endpoint) is
 * always one of its own spawner's solid footprint cells (confirmed real:
 * city-spawner's own template marks its anchor cell `1`, not `2` — the
 * pivot corner of its 3×3 footprint), so a path terminating there needs to
 * be allowed to reach it even though the tile is "blocked" in the
 * collision sense — the same way a real road runs UP TO a building rather
 * than needing the building's own footprint tile to be open floor.
 * `start` needs no equivalent exemption: it's pre-seeded into `visited`
 * unconditionally below, regardless of its own blocked status. Returns
 * `null` if `goal` isn't reachable this way — a real, disclosed case for a
 * tightly packed small map (mines/dwellings can wall off a narrow zone
 * boundary), not assumed impossible.
 */
export function shortestPath(
  sizeX: number,
  sizeZ: number,
  start: number,
  goal: number,
  blocked: Set<number>,
): number[] | null {
  if (start === goal) return [start]
  const prev = new Map<number, number>()
  const visited = new Set<number>([start])
  const queue: number[] = [start]
  let qi = 0
  while (qi < queue.length) {
    const node = queue[qi++]
    if (node === goal) break
    const x = node % sizeX
    const z = Math.floor(node / sizeX)
    for (const [dx, dz] of NEIGHBOR_OFFSETS) {
      const nx = x + dx
      const nz = z + dz
      if (nx < 0 || nx >= sizeX || nz < 0 || nz >= sizeZ) continue
      const n = nz * sizeX + nx
      if (visited.has(n) || (blocked.has(n) && n !== goal)) continue
      visited.add(n)
      prev.set(n, node)
      queue.push(n)
    }
  }
  if (!visited.has(goal)) return null
  const path = [goal]
  let cur = goal
  while (cur !== start) {
    const p = prev.get(cur)
    if (p === undefined) break
    cur = p
    path.push(cur)
  }
  path.reverse()
  return path
}
