// ─── Map Grid — shared "find nearest valid tile" search ─────────────────────
// The expanding-ring-search-outward-from-a-seed pattern is independently
// hand-rolled in bounds-autofix.ts, entrance-autofix.ts (×2), and
// reachability-validation.ts, each with its own copy of `ringOffsets` and its
// own bounds/collision/reachability rule. Extracted here for new fixers
// (overlap-autofix.ts) to build on without a 6th copy — the existing three
// are deliberately left as-is (each is already shipped, real-game-verified
// logic; migrating them is a separate, lower-risk-when-isolated cleanup).

/** Every integer cell at exact Chebyshev distance `radius` from `(cx, cz)`. */
export function* ringOffsets(cx: number, cz: number, radius: number): Generator<[number, number]> {
  for (let x = cx - radius; x <= cx + radius; x++) {
    yield [x, cz - radius]
    yield [x, cz + radius]
  }
  for (let z = cz - radius + 1; z <= cz + radius - 1; z++) {
    yield [cx - radius, z]
    yield [cx + radius, z]
  }
}

const NEIGHBOR_OFFSETS: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]]

/** Multi-source 4-neighbor flood fill over every node NOT in `blocked`,
 *  seeded from `seeds`. Mirrors bounds-autofix.ts's own `floodFillReachable`
 *  (no portal hops — see that file's header comment for why). */
export function floodFillReachable(seeds: number[], blocked: Set<number>, sizeX: number, sizeZ: number): Set<number> {
  const visited = new Set<number>()
  const queue: number[] = []
  for (const seed of seeds) {
    if (visited.has(seed) || blocked.has(seed)) continue
    visited.add(seed)
    queue.push(seed)
  }
  while (queue.length > 0) {
    const node = queue.pop() as number
    const x = node % sizeX
    const z = Math.floor(node / sizeX)
    for (const [dx, dz] of NEIGHBOR_OFFSETS) {
      const nx = x + dx
      const nz = z + dz
      if (nx < 0 || nx >= sizeX || nz < 0 || nz >= sizeZ) continue
      const n = nz * sizeX + nx
      if (visited.has(n) || blocked.has(n)) continue
      visited.add(n)
      queue.push(n)
    }
  }
  return visited
}

/** True when putting something solid on `solid` would cut a passage: free tiles beside it that are connected today (within `limit` steps) would no
 *  longer be. A pickup moved onto the one tile of a corridor seals everything behind it. The relocation fixers used to look only at the destination
 *  tile, so a resource moved out of one gateway landed in the next one, and the reachability rounds then carried it back and forth until they gave up
 *  (Back For Revenge: an arena on an island sealed by a crystal that moved between two gateway tiles). `isBlocked` is every tile already taken.
 *  The check is local, so it can say "cuts" for a passage that has a long detour; that only makes a candidate tile less likely to be chosen. */
export function wouldCutPassage(solid: number[], isBlocked: (node: number) => boolean, sizeX: number, sizeZ: number, limit = 150): boolean {
  const own = new Set(solid)
  const beside: number[] = []
  const seen = new Set<number>()
  for (const node of solid) {
    const x = node % sizeX
    const z = Math.floor(node / sizeX)
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx
        const nz = z + dz
        if (nx < 0 || nx >= sizeX || nz < 0 || nz >= sizeZ) continue
        const n = nz * sizeX + nx
        if (own.has(n) || seen.has(n) || isBlocked(n)) continue
        seen.add(n)
        beside.push(n)
      }
    }
  }
  if (beside.length < 2) return false
  // Can `from` walk to `to` within `limit` tiles, with `extraBlocked` also closed?
  const connected = (from: number, to: number, extraBlocked: Set<number>): boolean => {
    const visited = new Set<number>([from])
    const queue = [from]
    for (let head = 0; head < queue.length && visited.size < limit; head++) {
      const node = queue[head]
      if (node === to) return true
      const x = node % sizeX
      const z = Math.floor(node / sizeX)
      for (const [dx, dz] of NEIGHBOR_OFFSETS) {
        const nx = x + dx
        const nz = z + dz
        if (nx < 0 || nx >= sizeX || nz < 0 || nz >= sizeZ) continue
        const n = nz * sizeX + nx
        if (visited.has(n) || isBlocked(n) || extraBlocked.has(n)) continue
        visited.add(n)
        queue.push(n)
      }
    }
    return visited.has(to)
  }
  const none = new Set<number>()
  for (let i = 1; i < beside.length; i++) {
    if (connected(beside[0], beside[i], none) && !connected(beside[0], beside[i], own)) return true
  }
  return false
}

/** Searches outward in expanding rings from `(seedX, seedZ)` — checking the
 *  seed itself first — for the nearest position `isValidCandidate` accepts.
 *  Returns null if nothing within `maxRadius` (default: the whole map) qualifies. A search that finds nothing visits every tile, so callers that
 *  would not accept a far-away spot anyway pass a limit: on a large imported map unlimited searches took minutes. */
export function findNearestValidPosition(
  seedX: number,
  seedZ: number,
  sizeX: number,
  sizeZ: number,
  isValidCandidate: (x: number, z: number) => boolean,
  maxRadius = Math.max(sizeX, sizeZ),
): { x: number; z: number } | null {
  if (isValidCandidate(seedX, seedZ)) return { x: seedX, z: seedZ }
  for (let radius = 1; radius <= maxRadius; radius++) {
    for (const [x, z] of ringOffsets(seedX, seedZ, radius)) {
      if (x < 0 || x >= sizeX || z < 0 || z >= sizeZ) continue
      if (isValidCandidate(x, z)) return { x, z }
    }
  }
  return null
}
