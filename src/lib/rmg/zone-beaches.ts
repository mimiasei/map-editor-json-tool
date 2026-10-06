// ─── RMG beaches ─────────────────────────────────────────────────────────────
// User-requested: a real shoreline usually has a narrow sand/beach fringe
// between water and whatever biome the surrounding land is — this generator
// previously painted water directly against the zone's own flat biome, with
// nothing in between. Rolled per connected WATER BODY (flood-filled from
// `waterNodes`, not per zone — a lake can span a zone boundary, and a zone
// can hold more than one lake), not per tile: each body independently gets
// a 50% chance of a beach at all, and if so a uniform 1-3 tile width, so one
// shoreline reads as one consistent fringe rather than a speckled per-tile
// coin flip. Both numbers (50%, 1-3) are a direct, explicit user design
// request, not measured real-map data.
//
// Runs AFTER every other water mutation this generator makes (the road-
// partition water-reclaim repair, zone-fauna.ts's own fish placement) — see
// generate-random-map.ts's own call site, placed right before the
// reachability pass. Purely a visual biome repaint (never touches
// `state.blocked`/collision), same as the real game's own ground texture
// under a placed object — so it's safe to run this late, after every real
// object is already placed.

import { computeRoadDistanceField } from './zone-connections'
import { tryPlaceAt, isRotationallySymmetricFootprint, type PlacementState, type ZonePlacement } from './zone-population'
import { randomDecorRotation } from '@/lib/h3-import/scenery-clusters'
import type { CatalogMapObject } from '@/lib/catalog/types'
import type { BiomeId } from '@/lib/map-grid/terrain-colors'

const SAND_BIOME_ID: BiomeId = 2
const NEIGHBOR_OFFSETS: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]]

/** User-requested: a sand beach fringe only makes sense against the biomes
 *  that read as "normal ground" next to water — Grass, Dirt, Deathland,
 *  Autumn. Excluded: Sand itself (already sand, nothing to fringe), and
 *  Snow/Lava (a beach reads wrong next to ice or molten rock). */
const BEACH_ELIGIBLE_BIOMES = new Set<BiomeId>([1, 5, 7])
/** A water body only gets a beach when its whole shore is one of these (Sand
 *  included): water that touches Snow, Lava or Deathland gets none, since a
 *  sand fringe would mix those biomes with Sand. */
const BEACH_SHORE_BIOMES = new Set<number>([1, 2, 5, 7])

/** No real "dry grass" sid exists in the game catalog (confirmed this
 *  session) — these are the closest real stand-in: `grass_desert_1`/
 *  `grass_desert_2`, the only real decorations tagged for the Desert/Sand
 *  biome that read as sparse, dry ground cover. Walkable (non-solid
 *  footprint), so they never block anything placed later. */
const DRY_GRASS_SIDS = ['grass_desert_1', 'grass_desert_2']
/** Of every real beach tile, the chance it gets a dry-grass decoration —
 *  a direct user design request, not measured data. */
const DRY_GRASS_CHANCE = 0.4
/** Whether a water body gets a beach at all, and (if so) the uniform 1-3
 *  tile width — both direct user design requests, not measured data. */
const BEACH_CHANCE = 0.5
const MIN_BEACH_WIDTH = 1
const MAX_BEACH_WIDTH = 3

/** Flood-fills `waterNodes` into its own connected components (4-neighbor) —
 *  the real "water body" unit a beach decision is made per, since a single
 *  zone's own tile set can contain multiple separate lakes, and a lake can
 *  itself span more than one zone. */
function connectedWaterBodies(waterNodes: Set<number>, sizeX: number, sizeZ: number): number[][] {
  const seen = new Set<number>()
  const bodies: number[][] = []
  for (const start of waterNodes) {
    if (seen.has(start)) continue
    const body: number[] = []
    const queue = [start]
    seen.add(start)
    let head = 0
    while (head < queue.length) {
      const node = queue[head++]
      body.push(node)
      const x = node % sizeX
      const z = Math.floor(node / sizeX)
      for (const [dx, dz] of NEIGHBOR_OFFSETS) {
        const nx = x + dx
        const nz = z + dz
        if (nx < 0 || nx >= sizeX || nz < 0 || nz >= sizeZ) continue
        const n = nz * sizeX + nx
        if (waterNodes.has(n) && !seen.has(n)) {
          seen.add(n)
          queue.push(n)
        }
      }
    }
    bodies.push(body)
  }
  return bodies
}

export interface ScatterBeachesOptions {
  sizeX: number
  sizeZ: number
  waterNodes: Set<number>
  /** Per-tile zone id, used to look up each beach candidate's land biome
   *  via `zoneBiome` — a beach only ever repaints a tile whose zone biome
   *  is in `BEACH_ELIGIBLE_BIOMES`. */
  zoneIdByNode: number[]
  zoneBiome: Map<number, BiomeId>
  /** The painted biome of every tile; beaches and their shore check use it. */
  tileBiome: number[]
  /** Anchor tiles of objects that belong to one biome (biome-isolation.ts),
   *  so a beach never turns the ground under such an object into Sand. */
  taggedObjectBiome: Map<number, number>
  catalogById: Map<string, CatalogMapObject>
  state: PlacementState
  rng: () => number
}

export interface ScatterBeachesResult {
  /** Feed straight to `paintTerrainTiles`. */
  terrainChanges: { node: number; biomeId: number }[]
  /** Dry-grass decorations placed on the new beach tiles. */
  placements: ZonePlacement[]
}

export function scatterBeaches(options: ScatterBeachesOptions): ScatterBeachesResult {
  const { sizeX, sizeZ, waterNodes, tileBiome, taggedObjectBiome, catalogById, state, rng } = options
  const terrainChanges: { node: number; biomeId: number }[] = []
  const placements: ZonePlacement[] = []
  if (waterNodes.size === 0) return { terrainChanges, placements }

  const beachNodes = new Set<number>()
  for (const body of connectedWaterBodies(waterNodes, sizeX, sizeZ)) {
    if (rng() >= BEACH_CHANCE) continue
    const width = MIN_BEACH_WIDTH + Math.floor(rng() * (MAX_BEACH_WIDTH - MIN_BEACH_WIDTH + 1))
    const dist = computeRoadDistanceField(new Set(body), sizeX, sizeZ, width)
    // The whole shore must be Grass, Dirt, Autumn or Sand — else no beach here.
    let shoreOk = true
    for (let node = 0; node < dist.length && shoreOk; node++) {
      if (dist[node] === 1 && !waterNodes.has(node) && !BEACH_SHORE_BIOMES.has(tileBiome[node])) shoreOk = false
    }
    if (!shoreOk) continue
    for (let node = 0; node < dist.length; node++) {
      if (waterNodes.has(node) || beachNodes.has(node)) continue
      if (dist[node] >= 1 && dist[node] <= width) {
        const nodeBiome = tileBiome[node] as BiomeId | undefined
        if (nodeBiome === undefined || !BEACH_ELIGIBLE_BIOMES.has(nodeBiome)) continue
        const tagged = taggedObjectBiome.get(node)
        if (tagged !== undefined && tagged !== SAND_BIOME_ID) continue
        beachNodes.add(node)
        terrainChanges.push({ node, biomeId: SAND_BIOME_ID })
      }
    }
  }

  for (const node of beachNodes) {
    if (rng() >= DRY_GRASS_CHANCE) continue
    const sid = DRY_GRASS_SIDS[Math.floor(rng() * DRY_GRASS_SIDS.length)]
    if (tryPlaceAt(sid, node, sizeX, sizeZ, catalogById, state)) {
      const rotation = isRotationallySymmetricFootprint(sid, catalogById) ? randomDecorRotation(rng) : undefined
      placements.push({ tempId: state.nextTempId++, sid, node, rotation })
    }
  }

  return { terrainChanges, placements }
}
