// ─── Roads and rivers on a map somebody already started ──────────────────────
// The generator routes roads between zone anchors along its zone graph. A hand-made map has no graph, so roads here join what is actually on the map:
// the cities form the main (stone) network and mines and dwellings get dirt spurs to the nearest road. Rivers reuse the generator's own river carver
// with a terrain built from the map. Existing roads and rivers stay as they are; new ones may join them.

import type { CatalogMapObject, GameCatalog } from '@/lib/catalog/types'
import { computeFootprintTiles } from '@/lib/map-grid/footprint'
import { buildFuzzyObstaclePools } from '@/lib/map-grid/fuzzy-obstacle'
import { classifyRiverNode, deriveRealShapeCode } from '@/lib/map-grid/river-shape'
import type { BiomeId } from '@/lib/map-grid/terrain-colors'
import { sidBiome, violatesIsolation } from './biome-isolation'
import { createWindingCost, nearestNode, shortestPath, smoothPath } from './zone-connections'
import { carveRivers, waterfallShapeCode, type RiverRoute, type RiverTerrain } from './zone-rivers'
import { tryPlaceAt, type PlacementState, type ZonePlacement } from './zone-population'
import { DEFAULT_RIVER_CLIFF_CLEARANCE, DEFAULT_RIVER_CONFLUENCE_CHANCE, DEFAULT_RIVER_MEANDER, DEFAULT_RIVER_MOUTH_WIDENING } from './rmg-tuning'

const STONE_ROAD = 2
const DIRT_ROAD = 1
/** A spur longer than this to reach a mine or dwelling is not worth a road. */
const MAX_SPUR_LENGTH = 35
/** Share of spurs laid as stone instead of dirt, like the generator's stoneRoadChance. */
const SPUR_STONE_CHANCE = 0.35
const ROAD_SMOOTH_WINDOW = 12

export interface RoadPoint {
  sid: string
  node: number
  rotation?: number
}

export interface RoadOptions {
  sizeX: number
  sizeZ: number
  rng: () => number
  catalogById: Map<string, CatalogMapObject>
  /** Everything a road cannot cross, existing road tiles included (they are lifted out of it here). */
  blocked: ReadonlySet<number>
  existingRoads: ReadonlyMap<number, number>
  /** Cities: joined into one stone network. */
  cities: RoadPoint[]
  /** Mines and dwellings: each gets a spur with `spurChance`. */
  spurPoints: RoadPoint[]
  spurChance: number
}

/** A free tile to start a road from: an entrance cell of the object (the game's own roads end there), else its own tile. */
function entranceOf(point: RoadPoint, options: Pick<RoadOptions, 'sizeX' | 'sizeZ' | 'catalogById'>, blocked: ReadonlySet<number>): number {
  const { sizeX, sizeZ, catalogById } = options
  const cells = computeFootprintTiles(catalogById.get(point.sid), point.node % sizeX, Math.floor(point.node / sizeX), point.rotation)
  for (const cell of cells) {
    if (cell.value !== 2 || cell.x < 0 || cell.x >= sizeX || cell.z < 0 || cell.z >= sizeZ) continue
    const node = cell.z * sizeX + cell.x
    if (!blocked.has(node)) return node
  }
  return point.node
}

/** The new road tiles (id per node); tiles that already carry a road are left out. */
export function layRoads(options: RoadOptions): Map<number, number> {
  const { sizeX, sizeZ, rng, existingRoads, cities, spurPoints, spurChance } = options
  const blocked = new Set(options.blocked)
  for (const node of existingRoads.keys()) blocked.delete(node)

  const added = new Map<number, number>()
  const network = new Set<number>(existingRoads.keys())
  const idAt = (node: number): number => added.get(node) ?? existingRoads.get(node) ?? DIRT_ROAD

  const lay = (from: number, goals: ReadonlySet<number>, roadId: number, maxLength: number): boolean => {
    if (goals.has(from)) return true
    const goalNode = nearestNode(goals, from, sizeX)
    if (goalNode === null) return false
    const path = shortestPath(sizeX, sizeZ, from, goals, blocked, createWindingCost(sizeX, from, goalNode, rng))
    if (!path || path.length > maxLength) return false
    // Joining an existing road takes that road's material so the network doesn't change colour at the junction.
    const joined = idAt(path[path.length - 1])
    const material = network.has(path[path.length - 1]) ? joined : roadId
    for (const node of smoothPath(path, sizeX, blocked, ROAD_SMOOTH_WINDOW)) {
      network.add(node)
      if (!existingRoads.has(node) && !added.has(node)) added.set(node, material)
    }
    return true
  }

  const towns = cities.map((c) => entranceOf(c, options, blocked))
  if (towns.length > 0) {
    // Nearest-first: each city joins the road laid so far (the first one only has to exist).
    const joined = new Set<number>(network)
    if (joined.size === 0) joined.add(towns[0])
    const remaining = towns.slice(joined.has(towns[0]) && network.size === 0 ? 1 : 0)
    while (remaining.length > 0) {
      let best = 0
      let bestDistance = Infinity
      remaining.forEach((town, i) => {
        const near = nearestNode(joined, town, sizeX)
        const d = near === null ? 0 : (near % sizeX - town % sizeX) ** 2 + (Math.floor(near / sizeX) - Math.floor(town / sizeX)) ** 2
        if (d < bestDistance) { bestDistance = d; best = i }
      })
      const town = remaining.splice(best, 1)[0]
      if (lay(town, joined, STONE_ROAD, Infinity)) for (const node of network) joined.add(node)
      joined.add(town)
    }
  }

  const spurs = spurPoints.filter(() => rng() < spurChance)
  for (const point of spurs) {
    if (network.size === 0) break
    lay(entranceOf(point, options, blocked), network, rng() < SPUR_STONE_CHANCE ? STONE_ROAD : DIRT_ROAD, MAX_SPUR_LENGTH)
  }
  return added
}

export interface RiverOptions {
  sizeX: number
  sizeZ: number
  rng: () => number
  catalog: GameCatalog
  catalogById: Map<string, CatalogMapObject>
  state: PlacementState
  /** Biome of each tile (the map's tilesMap). */
  tileBiome: number[]
  levels: number[]
  climbs: number[]
  waterNodes: Set<number>
  wallNodes: Set<number>
  roadNodes: Set<number>
  /** Existing river tiles; the new ones are added to it. */
  riverNodes: Set<number>
  count: number
}

export interface RiverResult {
  changes: { node: number; s: number; isWaterfall?: boolean }[]
  placements: ZonePlacement[]
  tiles: number
}

export function carveRiversOnMap(options: RiverOptions): RiverResult {
  const { sizeX, sizeZ, rng, catalog, catalogById, state, tileBiome, levels, climbs, waterNodes, wallNodes, roadNodes, riverNodes, count } = options
  const pools = buildFuzzyObstaclePools(catalog.mapObjects)
  const poolsBySize = (biome: BiomeId, size: 2 | 3): string[] => pools[biome].pools.filter((sid) => catalogById.get(sid)?.sizeX === size && catalogById.get(sid)?.sizeZ === size)
  const result: RiverResult = { changes: [], placements: [], tiles: 0 }

  // The ground around a spot allows an object only if its biome is not isolated from the tiles under and next to it.
  const groundAllows = (sid: string | undefined, node: number): boolean => {
    if (!sid) return false
    const objectBiome = sidBiome(sid, catalogById)
    for (let oz = -1; oz <= 1; oz++) for (let ox = -1; ox <= 1; ox++) if (violatesIsolation(objectBiome, tileBiome[node + oz * sizeX + ox])) return false
    return true
  }
  const terrain: RiverTerrain = {
    sizeX, sizeZ, levels, climbs, water: waterNodes, wallNodes, roadNodes, riverNodes, usedAnchors: state.usedAnchors,
    // Roads can be crossed, everything else that blocks cannot.
    blocked: { has: (n: number) => state.blocked.has(n) && !roadNodes.has(n) },
    sourceOk: (node) => groundAllows(pools[tileBiome[node] as BiomeId]?.mountains[0], node),
    poolMouth: (anchor, size) => groundAllows(poolsBySize(tileBiome[anchor] as BiomeId, size)[0], anchor),
  }

  const paint = (route: RiverRoute): void => {
    for (const node of route.path) riverNodes.add(node)
    for (const node of route.widening ?? []) riverNodes.add(node)
    for (const { node } of route.mouthWater ?? []) riverNodes.add(node)
    const changes = [...route.path, ...(route.widening ?? []), ...(route.joinsAt !== undefined ? [route.joinsAt] : [])].map((node, i) => {
      if (i === route.waterfallIndex) return { node, s: waterfallShapeCode(node, route.path[i - 1], sizeX), isWaterfall: true }
      return { node, s: deriveRealShapeCode(classifyRiverNode(node, riverNodes, sizeX, sizeZ).dirs) }
    })
    for (const { node, upstream } of route.mouthWater ?? []) changes.push({ node, s: waterfallShapeCode(node, upstream, sizeX), isWaterfall: true })
    result.changes.push(...changes)
    result.tiles += route.path.length + (route.widening?.length ?? 0)
  }

  // A mountain (cluster) at the source, as in the generator: the river has to come from somewhere.
  const placeMountains = (node: number, cluster: number): void => {
    const biome = tileBiome[node] as BiomeId
    const sids = pools[biome]?.mountains ?? []
    if (sids.length === 0) return
    let placed = 0
    for (let ring = 0; ring <= 3 && placed < cluster; ring++) {
      for (let dz = -ring; dz <= ring && placed < cluster; dz++) {
        for (let dx = -ring; dx <= ring && placed < cluster; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue
          const x = (node % sizeX) + dx
          const z = Math.floor(node / sizeX) + dz
          if (x < 1 || z < 1 || x >= sizeX - 1 || z >= sizeZ - 1) continue
          const sid = sids[Math.floor(rng() * sids.length)]
          const at = z * sizeX + x
          if (riverNodes.has(at) || !tryPlaceAt(sid, at, sizeX, sizeZ, catalogById, state)) continue
          result.placements.push({ tempId: state.nextTempId++, sid, node: at })
          placed++
        }
      }
    }
  }

  carveRivers(terrain, count, rng, DEFAULT_RIVER_MEANDER, (route) => {
    if (route.poolAnchor !== undefined && route.poolSize !== undefined) {
      const sids = poolsBySize(tileBiome[route.poolAnchor] as BiomeId, route.poolSize)
      const sid = sids[Math.floor(rng() * sids.length)]
      if (sid && tryPlaceAt(sid, route.poolAnchor, sizeX, sizeZ, catalogById, state)) result.placements.push({ tempId: state.nextTempId++, sid, node: route.poolAnchor })
    }
    paint(route)
    if (route.waterfallIndex !== null || route.mountainSource) placeMountains(route.path[0], route.mountainSource ? 2 + Math.floor(rng() * 2) : 1)
  }, () => true, DEFAULT_RIVER_CLIFF_CLEARANCE, DEFAULT_RIVER_MOUTH_WIDENING, DEFAULT_RIVER_CONFLUENCE_CHANCE)
  return result
}
