// ─── RMG zone decoration — obstacle scattering (issue #210, Milestone 2) ───
// Fills each zone's own remaining free tiles with biome-appropriate scenery
// (rocks/mountains/clutter), reusing this codebase's existing Obstacles-
// brush sampler (fuzzy-obstacle.ts) rather than inventing a second scatter
// algorithm — but composed with real footprint/collision checking
// (zone-population.ts's `tryPlaceAt`), which none of this codebase's
// existing scatter tools do today (issue #210's own gap #4). Runs AFTER
// real object placement and road painting, sharing the same `PlacementState`
// so scenery only ever fills in what's left — never on top of a dwelling/
// mine/guard, and never on a road tile either.

import type { CatalogMapObject } from '@/lib/catalog/types'
import type { BiomeId } from '@/lib/map-grid/terrain-colors'
import { buildFuzzyObstaclePools, sampleFuzzyObstacles } from '@/lib/map-grid/fuzzy-obstacle'
import { tryPlaceAt, type PlacementState, type ZonePlacement } from './zone-population'
import type { ZoneSpec } from './zone-graph'
import type { ZoneCenter } from './zone-layout'

export interface ScatterObstaclesOptions {
  sizeX: number
  sizeZ: number
  zones: ZoneSpec[]
  centers: ZoneCenter[]
  tilesByZone: Map<number, number[]>
  zoneBiome: Map<number, BiomeId>
  catalogById: Map<string, CatalogMapObject>
  mapObjects: CatalogMapObject[]
  /** Road and river tiles painted by generate-random-map.ts's zone-
   *  connections.ts step, excluded from candidacy so scenery never covers
   *  either. */
  excludedNodes: Set<number>
  state: PlacementState
  rng: () => number
  /** Fraction of each zone's own tiles considered as a candidate obstacle
   *  site before fuzzy-obstacle.ts's own distance/biome rolls even run —
   *  its sampler was built for a UI brush stroke (a few dozen to a few
   *  hundred tiles), not a whole zone (up to thousands), so subsampling
   *  first keeps density sane at zone scale. */
  density?: number
}

/** Every candidate node's distance from its own zone's center, normalized
 *  by that zone's effective radius (`sqrt(tileCount / π)`, the radius of a
 *  circle with the same area) — the zone-scale equivalent of
 *  fuzzy-obstacle.ts's own `computeFuzzyDistances`, which is defined over a
 *  UI stroke's bounding box and doesn't fit a Voronoi zone's irregular
 *  shape as well as a real center+radius does. */
function zoneNodeDistances(candidateTiles: number[], sizeX: number, center: ZoneCenter, zoneTileCount: number): Map<number, number> {
  const effectiveRadius = Math.max(1, Math.sqrt(zoneTileCount / Math.PI))
  const distances = new Map<number, number>()
  for (const node of candidateTiles) {
    const x = node % sizeX
    const z = Math.floor(node / sizeX)
    const d = Math.hypot(x - center.x, z - center.z) / effectiveRadius
    distances.set(node, Math.min(1, d))
  }
  return distances
}

export function scatterZoneObstacles(options: ScatterObstaclesOptions): ZonePlacement[] {
  const { sizeX, sizeZ, zones, centers, tilesByZone, zoneBiome, catalogById, mapObjects, excludedNodes, state, rng, density = 0.35 } = options
  const pools = buildFuzzyObstaclePools(mapObjects)
  const placements: ZonePlacement[] = []

  for (const zone of zones) {
    const tiles = tilesByZone.get(zone.id) ?? []
    if (tiles.length === 0) continue
    const biome = zoneBiome.get(zone.id)
    if (biome === undefined) continue
    const center = centers[zone.id]

    // Real Olden Era RMG templates vary obstaclesFill by zone role (spawn
    // zones lower than treasure/center zones) via named zoneLayouts, not one
    // flat global value — `scatterZoneWater` already skips player zones
    // entirely for the same reason (buildability); this is the obstacle-
    // density equivalent, softer than a full skip since some scenery still
    // reads as a lived-in start.
    const zoneDensity = zone.kind === 'player' ? density * 0.6 : density
    const candidateTiles = tiles.filter((node) => !excludedNodes.has(node) && rng() < zoneDensity)
    if (candidateTiles.length === 0) continue
    const nodeDistances = zoneNodeDistances(candidateTiles, sizeX, center, tiles.length)

    const candidates = sampleFuzzyObstacles(nodeDistances, () => biome, pools, { mountainChance: 0.05, rng })
    for (const { node, sid } of candidates) {
      if (!tryPlaceAt(sid, node, sizeX, sizeZ, catalogById, state)) continue
      placements.push({ tempId: state.nextTempId++, sid, node })
    }
  }

  return placements
}
