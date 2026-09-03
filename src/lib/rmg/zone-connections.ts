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

/**
 * The nodes of an "L-shaped" orthogonal connector from `a` to `b` — ALL of
 * the x movement first, then ALL of the z movement (`xFirst`), or the
 * reverse. This is deliberately NOT an evenly-interleaved diagonal-ish
 * stepping (a Bresenham-style line) — this codebase's own road/river
 * rendering (`MapGridDialog.tsx`'s `drawBand`/`connectedDirections`) draws a
 * sharp 90° elbow at every single tile where the path's direction changes,
 * so an evenly-interleaved line (a turn on nearly every tile) is the WORST
 * possible shape here, not the smoothest — it's the literal "ladder"/
 * staircase-of-teeth artifact a real user report flagged (see `smoothPath`'s
 * own doc comment). One long straight run in each axis, joined by exactly
 * one turn, is what actually renders as a clean diagonal-ish sweep.
 */
function lPathNodes(a: number, b: number, sizeX: number, xFirst: boolean): number[] {
  const ax = a % sizeX
  const az = Math.floor(a / sizeX)
  const bx = b % sizeX
  const bz = Math.floor(b / sizeX)
  const nodes: number[] = [a]
  if (xFirst) {
    const stepX = Math.sign(bx - ax)
    for (let x = ax + stepX; stepX !== 0 && (stepX > 0 ? x <= bx : x >= bx); x += stepX) nodes.push(az * sizeX + x)
    const stepZ = Math.sign(bz - az)
    for (let z = az + stepZ; stepZ !== 0 && (stepZ > 0 ? z <= bz : z >= bz); z += stepZ) nodes.push(z * sizeX + bx)
  } else {
    const stepZ = Math.sign(bz - az)
    for (let z = az + stepZ; stepZ !== 0 && (stepZ > 0 ? z <= bz : z >= bz); z += stepZ) nodes.push(z * sizeX + ax)
    const stepX = Math.sign(bx - ax)
    for (let x = ax + stepX; stepX !== 0 && (stepX > 0 ? x <= bx : x >= bx); x += stepX) nodes.push(bz * sizeX + x)
  }
  return nodes
}

function lPathClear(a: number, b: number, sizeX: number, blocked: Set<number>, exempt: Set<number>, xFirst: boolean): boolean {
  for (const node of lPathNodes(a, b, sizeX, xFirst)) {
    if (blocked.has(node) && !exempt.has(node)) return false
  }
  return true
}

/**
 * A real, user-reported "second pass" cleanup for a road/river's own raw
 * `shortestPath` output (issue #210's Milestone 5): the winding-cost search
 * above minimizes cumulative deviation-from-sine-wave cost, not visual
 * turn count, so on a crowded map (a real report showed this getting worse
 * at 4+ players, where zones — and the mine/dwelling footprints inside
 * them — are smaller and packed tighter) it can produce long *bursty*
 * runs of alternating single-tile jogs around real obstacles: a "ladder" of
 * many 90° elbows in a row, since every direction change renders as one
 * (see `lPathNodes`'s own doc comment on why this codebase's rendering
 * makes that specific shape look bad, not just "a bit jagged").
 *
 * This walks the raw path greedily, and within a `windowSize` lookahead,
 * replaces the tightest run of small turns it can with a single L-shaped
 * 2-segment reconnection (`lPathNodes`) wherever a straight L route between
 * two path points doesn't cross any REAL obstacle (`blocked` — the same set
 * `shortestPath` itself already respected, so this can never introduce a
 * new collision, only remove already-safe detours the cost-minimizing
 * search didn't know were removable). `windowSize` is deliberately small
 * relative to `createWindingCost`'s own wave period (tens of tiles) so this
 * only cleans up LOCAL zigzag noise — the intentional large-scale organic
 * S-curve a real prior fix added is preserved, just traced with long clean
 * treads instead of a fine zigzag. Falls back to the original single-step
 * hop wherever no window-bounded shortcut is possible (a real, expected
 * case in a tightly obstacle-packed corridor — exactly where fine-grained
 * navigation is actually needed).
 */
export function smoothPath(path: number[], sizeX: number, blocked: Set<number>, windowSize = 12): number[] {
  if (path.length <= 2) return path
  const exempt = new Set([path[0], path[path.length - 1]])
  const result: number[] = [path[0]]
  let i = 0
  while (i < path.length - 1) {
    let bestJ = i + 1
    let bestXFirst = true
    const jMax = Math.min(path.length - 1, i + windowSize)
    for (let j = i + 2; j <= jMax; j++) {
      const clearXFirst = lPathClear(path[i], path[j], sizeX, blocked, exempt, true)
      const clearZFirst = lPathClear(path[i], path[j], sizeX, blocked, exempt, false)
      if (clearXFirst || clearZFirst) {
        bestJ = j
        bestXFirst = clearXFirst
      }
    }
    if (bestJ === i + 1) {
      result.push(path[i + 1])
    } else {
      const segment = lPathNodes(path[i], path[bestJ], sizeX, bestXFirst)
      for (let k = 1; k < segment.length; k++) result.push(segment[k])
    }
    i = bestJ
  }
  return result
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
