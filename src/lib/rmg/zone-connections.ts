// ─── RMG zone connections — roads + a river (issue #210, Milestone 2, with
// organic winding added as a real user-reported follow-up) ─────────────────
// Physically realizes the zone graph's own abstract edges (zone-graph.ts)
// as real painted roads, and lays one river across the map's most
// graph-distant pair of zones — both via a cost-weighted Dijkstra shortest
// path over tiles not already claimed by a placed object's solid
// footprint, so neither a road nor the river ever tries to run straight
// through a dwelling/mine.
//
// A PLAIN (uniform-cost) shortest path between two zone anchors on an
// otherwise-open map is, almost always, a perfectly straight or dead-flat-
// L-shaped line — and reads as obviously artificial once painted (a real,
// reported problem: TSE's own connectivity-aware road rendering repeats
// the exact same straight-segment "band" tile for the whole run, which
// looks fine for a short/curved real road but reads as a broken-looking
// "ladder" when it's 20+ tiles of unbroken dead-straight repetition).
// `createWindingCost` builds a smooth, deterministic pseudo-random cost
// field (a sum of a few sinusoids, not real Perlin/Simplex noise — this is
// purely a cosmetic path-shaping tool, not terrain generation, so a much
// simpler smooth field is enough) that a weighted Dijkstra search will
// naturally route around, producing a gently winding path instead of the
// shortest possible one — same real path-safety guarantees (never crosses
// `blocked`, `goal` still exempted for the same reason as before), just no
// longer minimal-length.

const NEIGHBOR_OFFSETS: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]]

/**
 * A cost field whose cheapest ("valley") route between `start` and `goal`
 * is itself a sine-wave S-curve, not a straight line — a plain
 * absolute-position noise field (an earlier version of this function) was
 * tried and rejected: its own valleys are still locally straight, so a
 * weighted-shortest-path search just finds a straight shortcut through
 * whichever valley is cheapest, producing a couple of sharp bends between
 * long straight legs rather than a genuine organic wind (confirmed by
 * rendering real generated paths — see the PR this fix landed in for
 * examples). Instead, this computes each candidate tile's position in
 * (progress, lateral) coordinates relative to the straight start→goal
 * axis, and penalizes distance from a sine wave IN THAT LATERAL
 * coordinate — so the "ideal centerline" itself curves back and forth
 * across the direct line as progress increases, regardless of the
 * start→goal bearing (horizontal, vertical, or diagonal all wind the same
 * way). `amplitude` is in tiles; `cycles` (randomized per call) is how
 * many full S-wiggles happen over the whole journey.
 */
export function createWindingCost(
  sizeX: number,
  start: number,
  goal: number,
  rng: () => number,
  amplitude = 3,
  strength = 0.5,
): (x: number, z: number) => number {
  const sx = start % sizeX
  const sz = Math.floor(start / sizeX)
  const gx = goal % sizeX
  const gz = Math.floor(goal / sizeX)
  const dx = gx - sx
  const dz = gz - sz
  const length = Math.max(1, Math.hypot(dx, dz))
  const fx = dx / length
  const fz = dz / length
  const px = -fz
  const pz = fx
  const cycles = 1.5 + rng() * 2
  const angularFreq = (cycles * 2 * Math.PI) / length
  const phase = rng() * Math.PI * 2

  return (x: number, z: number): number => {
    const rx = x - sx
    const rz = z - sz
    const progress = rx * fx + rz * fz
    const lateral = rx * px + rz * pz
    const desiredLateral = amplitude * Math.sin(progress * angularFreq + phase)
    const deviation = lateral - desiredLateral
    return 1 + strength * deviation * deviation
  }
}

/** Binary min-heap keyed by a numeric priority — Dijkstra's own priority
 *  queue. Small, local, and only ever used here (no existing shared heap
 *  utility in this codebase to reuse). */
class MinHeap {
  private items: [number, number][] = []

  push(priority: number, value: number): void {
    this.items.push([priority, value])
    let i = this.items.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (this.items[parent][0] <= this.items[i][0]) break
      ;[this.items[parent], this.items[i]] = [this.items[i], this.items[parent]]
      i = parent
    }
  }

  pop(): [number, number] | undefined {
    const top = this.items[0]
    if (top === undefined) return undefined
    const last = this.items.pop() as [number, number]
    if (this.items.length > 0) {
      this.items[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = 2 * i + 2
        let smallest = i
        if (l < this.items.length && this.items[l][0] < this.items[smallest][0]) smallest = l
        if (r < this.items.length && this.items[r][0] < this.items[smallest][0]) smallest = r
        if (smallest === i) break
        ;[this.items[smallest], this.items[i]] = [this.items[i], this.items[smallest]]
        i = smallest
      }
    }
    return top
  }

  get size(): number {
    return this.items.length
  }
}

/**
 * Weighted Dijkstra shortest (lowest-total-cost, not necessarily shortest-
 * tile-count) path from `start` to `goal` over tiles not in `blocked`,
 * with `goal` itself exempted from the `blocked` check — a zone's anchor
 * (used as both a spawn point and a road/river endpoint) is always one of
 * its own spawner's solid footprint cells (confirmed real: city-spawner's
 * own template marks its anchor cell `1`, not `2` — the pivot corner of
 * its 3×3 footprint), so a path terminating there needs to be allowed to
 * reach it even though the tile is "blocked" in the collision sense — the
 * same way a real road runs UP TO a building rather than needing the
 * building's own footprint tile to be open floor. `start` needs no
 * equivalent exemption: it's pre-seeded with distance 0 regardless of its
 * own blocked status. `costFn` (default: uniform cost 1, i.e. plain
 * shortest-path) is where `createWindingCost` plugs in to make roads/
 * rivers curve organically instead of taking the dead-straight route.
 * Returns `null` if `goal` isn't reachable this way — a real, disclosed
 * case for a tightly packed small map (mines/dwellings can wall off a
 * narrow zone boundary), not assumed impossible.
 */
export function shortestPath(
  sizeX: number,
  sizeZ: number,
  start: number,
  goal: number,
  blocked: Set<number>,
  costFn: (x: number, z: number) => number = () => 1,
): number[] | null {
  if (start === goal) return [start]

  const dist = new Map<number, number>([[start, 0]])
  const prev = new Map<number, number>()
  const visited = new Set<number>()
  const heap = new MinHeap()
  heap.push(0, start)

  while (heap.size > 0) {
    const [d, node] = heap.pop() as [number, number]
    if (visited.has(node)) continue
    visited.add(node)
    if (node === goal) break

    const x = node % sizeX
    const z = Math.floor(node / sizeX)
    for (const [dx, dz] of NEIGHBOR_OFFSETS) {
      const nx = x + dx
      const nz = z + dz
      if (nx < 0 || nx >= sizeX || nz < 0 || nz >= sizeZ) continue
      const n = nz * sizeX + nx
      if (visited.has(n) || (blocked.has(n) && n !== goal)) continue
      const newDist = d + costFn(nx, nz)
      if (newDist < (dist.get(n) ?? Infinity)) {
        dist.set(n, newDist)
        prev.set(n, node)
        heap.push(newDist, n)
      }
    }
  }

  if (!dist.has(goal)) return null
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
