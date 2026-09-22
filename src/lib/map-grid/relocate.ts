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

/** Searches outward in expanding rings from `(seedX, seedZ)` — checking the
 *  seed itself first — for the nearest position `isValidCandidate` accepts.
 *  Returns null if nothing on the whole map qualifies. */
export function findNearestValidPosition(
  seedX: number,
  seedZ: number,
  sizeX: number,
  sizeZ: number,
  isValidCandidate: (x: number, z: number) => boolean,
): { x: number; z: number } | null {
  if (isValidCandidate(seedX, seedZ)) return { x: seedX, z: seedZ }
  const maxRadius = Math.max(sizeX, sizeZ)
  for (let radius = 1; radius <= maxRadius; radius++) {
    for (const [x, z] of ringOffsets(seedX, seedZ, radius)) {
      if (x < 0 || x >= sizeX || z < 0 || z >= sizeZ) continue
      if (isValidCandidate(x, z)) return { x, z }
    }
  }
  return null
}
