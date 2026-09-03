// ─── Random Map Generator — Milestone 0 (issue #210) ────────────────────────
// The first, deliberately minimal slice of a much larger planned effort (see
// issue #210 for the full VCMI-research-driven milestone list). No zone
// graph, no terrain shaping, no treasure economy yet — just enough to prove
// the "generate a whole .map container in memory → loadContainer() once →
// save → open in-game" path end-to-end: a single flat, uniform-biome
// rectangle (via the existing buildBlankMap), N player-start spawners spread
// around the map's perimeter so no two start adjacent to each other, and one
// random-squad guard per map quadrant (skipped if a spawner already claimed
// that quadrant's center) using the same value/fraction model the Encounter
// brush already uses (squad-pool.ts). Later milestones replace the
// perimeter-spread and fixed-quadrant placement with real zone-graph-driven
// layout — this is intentionally the "does the pipeline work at all" step,
// not a balanced or varied map.

import { addObjectInstances, buildBlankMap, type BlankMapPlayer, type MapContainer } from '@/lib/map-write'
import {
  DEFAULT_SQUAD_DIFFICULTY_RANGES,
  DEFAULT_SQUAD_RANDOM_WEIGHTS,
  pickSquadRange,
  randomInRange,
  sampleFraction,
} from '@/lib/map-grid/squad-pool'
import type { BiomeId } from '@/lib/map-grid/terrain-colors'

export interface GenerateRandomMapOptions {
  sizeX: number
  sizeZ: number
  /** Biome id 1-7 (BIOME_NAMES in terrain-colors.ts) — fills the whole map,
   *  same single-biome limitation as `buildBlankMap` until terrain shaping
   *  (Milestone 1) exists. */
  biomeId: BiomeId
  playerCount: number
  playerSpawnerSid: 'city-spawner' | 'hero-spawner'
  /** Injectable for deterministic tests; defaults to `Math.random`. */
  rng?: () => number
}

/** Spread `count` player-start nodes evenly around an inset ellipse centered
 *  on the map, so N players start maximally (and evenly) far apart on a
 *  single flat zone. Not zone-graph placement (see Milestone 1) — just
 *  enough separation that spawners can't land adjacent to each other on any
 *  supported map size/player count. */
function spreadPlayerNodes(sizeX: number, sizeZ: number, count: number): number[] {
  const insetX = Math.max(1, Math.floor(sizeX * 0.15))
  const insetZ = Math.max(1, Math.floor(sizeZ * 0.15))
  const cx = (sizeX - 1) / 2
  const cz = (sizeZ - 1) / 2
  const rx = cx - insetX
  const rz = cz - insetZ
  const nodes: number[] = []
  for (let i = 0; i < count; i++) {
    const angle = (2 * Math.PI * i) / count - Math.PI / 2
    const x = Math.min(sizeX - 1, Math.max(0, Math.round(cx + rx * Math.cos(angle))))
    const z = Math.min(sizeZ - 1, Math.max(0, Math.round(cz + rz * Math.sin(angle))))
    nodes.push(z * sizeX + x)
  }
  return nodes
}

/** Center of each of the map's four quadrants, as a `(fractionX, fractionZ)`
 *  pair — fixed placeholder zones until Milestone 1's real zone graph. */
const QUADRANT_CENTERS: [number, number][] = [
  [0.25, 0.25],
  [0.75, 0.25],
  [0.25, 0.75],
  [0.75, 0.75],
]

/** Find the nearest free tile to `(x, z)` by searching outward ring by ring
 *  (Chebyshev distance), up to `maxRadius`. A quadrant's exact center tile
 *  can coincide with a perimeter-spread player spawner node for some
 *  size/player-count combinations (confirmed real: an 8-player 256×256 map
 *  landed all 4 quadrant centers exactly on diagonal spawner positions,
 *  silently producing zero guards) — nudging to the nearest free tile
 *  instead of skipping keeps every quadrant guarded in the near-total
 *  majority of cases, rather than only in the ones where no coincidence
 *  happens to occur. Returns null in the (now rare) case nothing is free
 *  within `maxRadius`. */
function findNearbyFreeNode(sizeX: number, sizeZ: number, x: number, z: number, claimed: Set<number>, maxRadius: number): number | null {
  for (let r = 0; r <= maxRadius; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue // ring perimeter only — r=0 covers the center itself
        const nx = x + dx
        const nz = z + dz
        if (nx < 0 || nx >= sizeX || nz < 0 || nz >= sizeZ) continue
        const node = nz * sizeX + nx
        if (!claimed.has(node)) return node
      }
    }
  }
  return null
}

/**
 * Build a brand-new random `.map` container from `template` (expected to be
 * `template.map`'s already-parsed container, exactly like `buildBlankMap`
 * itself expects — see `create-map.ts` for where that's read).
 */
export function generateRandomMap(template: MapContainer, options: GenerateRandomMapOptions): MapContainer {
  const { sizeX, sizeZ, biomeId, playerCount, playerSpawnerSid, rng = Math.random } = options

  const playerNodes = spreadPlayerNodes(sizeX, sizeZ, playerCount)
  const players: BlankMapPlayer[] = playerNodes.map((node) => ({ sid: playerSpawnerSid, node }))
  const container = buildBlankMap(template, { sizeX, sizeZ, biomeId, players })

  const claimedNodes = new Set(playerNodes)
  const searchRadius = Math.max(2, Math.floor(Math.min(sizeX, sizeZ) * 0.05))
  const additions: { sid: string; node: number; randomSquadOverrides: { requestedValue: number; fraction: string } }[] = []
  for (const [fx, fz] of QUADRANT_CENTERS) {
    const centerX = Math.round(fx * (sizeX - 1))
    const centerZ = Math.round(fz * (sizeZ - 1))
    const node = findNearbyFreeNode(sizeX, sizeZ, centerX, centerZ, claimedNodes, searchRadius)
    if (node === null) continue // every tile within the search radius is already claimed — skip this quadrant's guard
    claimedNodes.add(node)
    const range = pickSquadRange(['Random'], DEFAULT_SQUAD_DIFFICULTY_RANGES, DEFAULT_SQUAD_RANDOM_WEIGHTS, rng)
    additions.push({
      sid: 'random-squad',
      node,
      randomSquadOverrides: {
        requestedValue: randomInRange(range.min, range.max, rng),
        fraction: sampleFraction(biomeId, 0.7, rng),
      },
    })
  }

  const { block2Chunk } = addObjectInstances(container.chunks[1], additions)
  const chunks = container.chunks.slice()
  chunks[1] = block2Chunk
  return { ...container, chunks }
}
