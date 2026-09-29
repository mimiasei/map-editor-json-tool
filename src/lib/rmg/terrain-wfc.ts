// ─── RMG organic terrain-border blending (issue #224, M3) ──────────────────
// generate-terrain.ts's own flat-fill (`zoneBiome.get(zoneIdByNode[node])`,
// one biome per zone, no exceptions) is a real, known gap vs hand-crafted
// maps' organic tile-level blending at zone borders (see the research plan,
// Problem 2). This is a scoped Wave Function Collapse pass — not a
// full-map WFC solver, which would spend most of its work re-deriving the
// same flat interior a plain fill already gets right for free. Only tiles
// within `borderRadius` of an actual zone boundary get collapsed via WFC;
// every other tile is treated as an already-fixed boundary condition at its
// zone's own biome, which both keeps this fast on a 256×256 map and matches
// the real visual problem (organic blending is only ever needed AT a seam).
//
// Standard WFC loop: repeatedly pick the uncollapsed border-band cell with
// the fewest still-possible biomes ("lowest entropy"), collapse it via a
// weighted random pick (own zone's biome gets a `zonePriorWeight` bonus,
// modulated by real adjacency compatibility with already-collapsed
// neighbors — see terrain-adjacency-stats.ts), then propagate: drop any
// biome from a neighbor's domain that has zero observed adjacency with the
// value just collapsed. No backtracking — if propagation ever empties a
// cell's domain (not observed against the current real-data table, whose
// every pair has SOME nonzero weight, but a modified/future table might),
// it falls back to that cell's own zone biome rather than throwing.

import { TILE_ADJACENCY_WEIGHTS } from './terrain-adjacency-stats'

export interface TerrainBorderBlendOptions {
  sizeX: number
  sizeZ: number
  zoneIdByNode: number[]
  zoneBiome: Map<number, number>
  rng: () => number
  /** Chebyshev-distance band, in tiles, around each real zone boundary that
   *  gets WFC-blended. 2 keeps the effect visually local without touching
   *  most of a zone's own interior. */
  borderRadius?: number
  /** How strongly a border tile favors its OWN zone's biome over the
   *  adjacency-only signal — without this, WFC would happily blend two
   *  zones 50/50 right at their border, which reads as noise rather than
   *  "zone A with some organic bleed from zone B." */
  zonePriorWeight?: number
}

/** Returns a full per-node biome array — flat-fill everywhere except the
 *  border band, which is WFC-blended. Never mutates its inputs. */
export function blendZoneBordersWFC(options: TerrainBorderBlendOptions): number[] {
  const { sizeX, sizeZ, zoneIdByNode, zoneBiome, rng, borderRadius = 2, zonePriorWeight = 8 } = options
  const tileCount = sizeX * sizeZ
  const flat = new Array<number>(tileCount)
  for (let node = 0; node < tileCount; node++) {
    flat[node] = zoneBiome.get(zoneIdByNode[node]) ?? 1
  }

  const neighborsOf = (node: number): number[] => {
    const x = node % sizeX
    const z = Math.floor(node / sizeX)
    const out: number[] = []
    if (x > 0) out.push(node - 1)
    if (x < sizeX - 1) out.push(node + 1)
    if (z > 0) out.push(node - sizeX)
    if (z < sizeZ - 1) out.push(node + sizeX)
    return out
  }

  // ── Find the border band via BFS dilation from real zone-boundary tiles ──
  // Alongside distance, also carry which zone ids are actually locally
  // relevant at each border-band tile (its own zone plus every zone that
  // reached it within `borderRadius` hops) — this is what confines WFC
  // collapse to the biomes genuinely meeting at THIS seam (e.g. only
  // Grass/Sand at a Grass/Sand border), instead of every biome that exists
  // anywhere on the map. Without it, a border tile with no already-collapsed
  // neighbor yet (common — tiles on both sides of a seam start uncollapsed
  // together) picks uniformly among ALL biomes weighted only by its own
  // zone's prior, and since `TILE_ADJACENCY_WEIGHTS` has no zero entries
  // (every biome pair was observed adjacent somewhere in the real corpus),
  // nothing stops it from collapsing to a totally unrelated biome (e.g.
  // Lava at a Grass/Sand seam) before propagation can correct it — a real,
  // confirmed bug (issue #232).
  const isBoundary = new Uint8Array(tileCount)
  const queue: number[] = []
  for (let node = 0; node < tileCount; node++) {
    for (const n of neighborsOf(node)) {
      if (zoneIdByNode[n] !== zoneIdByNode[node]) {
        isBoundary[node] = 1
        queue.push(node)
        break
      }
    }
  }
  const distance = new Int8Array(tileCount).fill(-1)
  const relevantZones = new Map<number, Set<number>>()
  for (const node of queue) {
    distance[node] = 0
    const set = new Set<number>([zoneIdByNode[node]])
    for (const n of neighborsOf(node)) set.add(zoneIdByNode[n])
    relevantZones.set(node, set)
  }
  let frontier = queue
  for (let d = 1; d <= borderRadius && frontier.length > 0; d++) {
    const next: number[] = []
    for (const node of frontier) {
      for (const n of neighborsOf(node)) {
        if (distance[n] === -1) {
          distance[n] = d
          next.push(n)
        }
      }
    }
    // Union in every already-assigned neighbor's relevant-zone set (covers
    // both the previous wave and any same-wave sibling processed first) —
    // a node can be within radius of more than one real zone transition
    // (e.g. a 3-zone corner), and all of them should count.
    for (const node of next) {
      const set = relevantZones.get(node) ?? new Set<number>([zoneIdByNode[node]])
      for (const n of neighborsOf(node)) {
        const neighborSet = relevantZones.get(n)
        if (neighborSet) for (const z of neighborSet) set.add(z)
      }
      relevantZones.set(node, set)
    }
    frontier = next
  }
  const borderBand = new Set<number>()
  for (let node = 0; node < tileCount; node++) if (distance[node] !== -1) borderBand.add(node)
  if (borderBand.size === 0) return flat

  const compatWeight = (a: number, b: number): number => TILE_ADJACENCY_WEIGHTS[a]?.[b] ?? 0

  const result = flat.slice()
  const collapsed = new Uint8Array(tileCount) // 1 once a node's final biome is fixed (border-band cells start 0, everything else effectively pre-fixed)
  for (let node = 0; node < tileCount; node++) if (!borderBand.has(node)) collapsed[node] = 1

  const domain = new Map<number, number[]>()
  for (const node of borderBand) {
    const zones = relevantZones.get(node) ?? new Set<number>([zoneIdByNode[node]])
    const biomes = new Set<number>()
    for (const zid of zones) biomes.add(zoneBiome.get(zid) ?? 1)
    domain.set(node, [...biomes])
  }

  const uncollapsed = new Set(borderBand)
  while (uncollapsed.size > 0) {
    // Lowest-entropy cell (fewest remaining options), ties broken by rng.
    let bestNode = -1
    let bestSize = Infinity
    let bestTieRoll = -1
    for (const node of uncollapsed) {
      const size = domain.get(node)!.length
      if (size < bestSize || (size === bestSize && rng() > bestTieRoll)) {
        bestNode = node
        bestSize = size
        bestTieRoll = rng()
      }
    }

    const options = domain.get(bestNode)!
    const ownZoneBiome = zoneBiome.get(zoneIdByNode[bestNode]) ?? 1
    const neighborBiomes = neighborsOf(bestNode).filter((n) => collapsed[n]).map((n) => result[n])
    let weights = options.map((b) => {
      let w = b === ownZoneBiome ? zonePriorWeight : 1
      for (const nb of neighborBiomes) w *= 1 + compatWeight(nb, b)
      return w
    })
    const total = weights.reduce((a, b) => a + b, 0)
    let chosen = options[options.length - 1]
    if (total > 0) {
      let roll = rng() * total
      for (let i = 0; i < options.length; i++) {
        roll -= weights[i]
        if (roll <= 0) { chosen = options[i]; break }
      }
    } else {
      chosen = ownZoneBiome
    }

    result[bestNode] = chosen
    collapsed[bestNode] = 1
    uncollapsed.delete(bestNode)
    domain.delete(bestNode)

    // Propagate: drop biomes with zero observed adjacency to `chosen` from
    // still-uncollapsed neighbors. Falls back to the neighbor's own zone
    // biome (never throws) if this empties its domain.
    for (const n of neighborsOf(bestNode)) {
      if (collapsed[n]) continue
      const nOptions = domain.get(n)
      if (!nOptions) continue
      const narrowed = nOptions.filter((b) => compatWeight(chosen, b) > 0 || b === chosen)
      domain.set(n, narrowed.length > 0 ? narrowed : [zoneBiome.get(zoneIdByNode[n]) ?? 1])
    }
  }

  return result
}
