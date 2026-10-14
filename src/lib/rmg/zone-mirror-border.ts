// ─── Closing the zone border on a mirrored map's middle line ────────────────
// The boundary walls (zone-boundary.ts) are placed on the whole map before a
// mirrored map copies its left half onto the right, and every object that
// straddles the middle line is dropped by the copy. Where two zones touch right
// on that line (Double neutral, Hub, Ring on small maps) holes open in the wall.
// This pass walks the border pairs on the line, (sizeX / 2 - 1, z) | (sizeX / 2, z), and
// closes what is open with a single thickness of the biome's own walls.
//
// The wall is deliberately not a mirror image: each run of border rows gets its wall
// in the left column or the right column, at random, with objects kept on that
// side. A double wall on both columns would look odd, and one closed line is the
// same for the players on both sides of it. A road that crosses the line stays open
// (with a few rows of margin) and gets a gate guard when it has none.

import type { CatalogMapObject } from '@/lib/catalog/types'
import { buildFuzzyObstaclePools } from '@/lib/map-grid/fuzzy-obstacle'
import { computeFootprintTiles } from '@/lib/map-grid/footprint'
import { isElevationWallTile } from '@/lib/map-grid/passability'
import type { BiomeId } from '@/lib/map-grid/terrain-colors'
import { createPlacementState, tryPlaceAt, ZONE_BIOMES, type ZonePlacement } from './zone-population'
import { mirrorNode } from './zone-mirror'

/** Rows either side of a road crossing that stay open. */
const GATE_MARGIN_ROWS = 2

export interface CloseAxisBorderInput {
  sizeX: number
  sizeZ: number
  zoneIdByNode: number[]
  zoneBiome: Map<number, BiomeId>
  catalogById: Map<string, CatalogMapObject>
  mapObjects: CatalogMapObject[]
  /** Every object on the finished map (anchor, sid, rotation). */
  objects: { sid: string; node: number; rotation: number }[]
  /** Tiles of guard squads (concrete squads and random-squad objects). */
  guardNodes: number[]
  roadNodes: Set<number>
  waterMap: number[]
  levelsMap: number[]
  climbsMap: number[]
  /** The final tile biome, left half; the right half is read through the mirror. */
  tileBiome?: number[]
  mountainDensity: number
  rng: () => number
  nextTempId: () => number
  /** Settings for a new gate guard (a copy of an existing zone-boundary guard); none = no gate guards added. */
  guardOverrides?: NonNullable<ZonePlacement['randomSquadOverrides']>
}

export interface CloseAxisBorderResult {
  walls: ZonePlacement[]
  guards: ZonePlacement[]
  /** Border rows left open as gates. */
  gateRows: number
}

export function closeAxisBorder(input: CloseAxisBorderInput): CloseAxisBorderResult {
  const { sizeX, sizeZ, zoneIdByNode, zoneBiome, catalogById, mapObjects, objects, guardNodes, roadNodes, waterMap, levelsMap, climbsMap, rng, nextTempId } = input
  const left = sizeX / 2 - 1
  const right = sizeX / 2
  const nodeOf = (x: number, z: number): number => z * sizeX + x
  const result: CloseAxisBorderResult = { walls: [], guards: [], gateRows: 0 }

  // What is already solid, for the gap test and for placing new walls.
  const solid = new Set<number>()
  const occupied = new Set<number>()
  const anchors = new Set<number>()
  for (const o of objects) {
    anchors.add(o.node)
    for (const c of computeFootprintTiles(catalogById.get(o.sid), o.node % sizeX, Math.floor(o.node / sizeX), o.rotation)) {
      if (c.x < 0 || c.x >= sizeX || c.z < 0 || c.z >= sizeZ) continue
      if (c.value === 1) solid.add(nodeOf(c.x, c.z))
      if (c.value === 1 || c.value === 2) occupied.add(nodeOf(c.x, c.z))
    }
  }
  const guardSet = new Set(guardNodes)
  const closedTile = (node: number): boolean => solid.has(node) || waterMap[node] !== 0 || isElevationWallTile(node, sizeX, sizeZ, levelsMap, climbsMap)

  // Border rows: the two zones on either side of the line differ.
  const borderRows: number[] = []
  for (let z = 0; z < sizeZ; z++) {
    if (zoneIdByNode[nodeOf(left, z)] !== zoneIdByNode[nodeOf(right, z)]) borderRows.push(z)
  }
  if (borderRows.length === 0) return result

  // Gate rows: a road or a guard on the line; the rows around them stay open.
  const gate = new Set<number>()
  const roadRows: number[] = []
  for (const z of borderRows) {
    const pair = [nodeOf(left, z), nodeOf(right, z)]
    if (pair.some((n) => roadNodes.has(n))) roadRows.push(z)
    if (pair.some((n) => roadNodes.has(n) || guardSet.has(n))) {
      for (let dz = -GATE_MARGIN_ROWS; dz <= GATE_MARGIN_ROWS; dz++) gate.add(z + dz)
    }
  }
  result.gateRows = [...gate].filter((z) => borderRows.includes(z)).length

  // Placement state: everything solid or entrance is blocked, every anchor used; the biome of the
  // right half is the mirror image of the left half's.
  const state = createPlacementState(occupied, anchors)
  if (input.tileBiome) {
    const biome = input.tileBiome.slice()
    for (let node = 0; node < biome.length; node++) if (node % sizeX >= right) biome[node] = input.tileBiome[mirrorNode(node, sizeX)]
    state.tileBiome = biome
  }
  for (const n of guardSet) state.usedAnchors.add(n)
  for (let z = 0; z < sizeZ; z++) for (const x of [left, right]) if (waterMap[nodeOf(x, z)] !== 0) { state.blocked.add(nodeOf(x, z)); state.usedAnchors.add(nodeOf(x, z)) }

  const pools = buildFuzzyObstaclePools(mapObjects)

  // Walls: one side per run of border rows.
  const runs: number[][] = []
  for (const z of borderRows) {
    const last = runs[runs.length - 1]
    if (last && last[last.length - 1] === z - 1) last.push(z)
    else runs.push([z])
  }
  for (const run of runs) {
    const side = rng() < 0.5 ? left : right
    for (const z of run) {
      if (gate.has(z)) continue
      const node = nodeOf(side, z)
      if (closedTile(node)) continue
      // Out of luck on this side (no wall fits): the other column keeps the line closed here.
      if (!placeWall(side, z)) placeWall(side === left ? right : left, z)
    }
  }

  function placeWall(x: number, z: number): ZonePlacement | null {
    const target = nodeOf(x, z)
    if (closedTile(target)) return null
    const biome = zoneBiome.get(zoneIdByNode[target]) ?? ZONE_BIOMES[0]
    const pool = pools[biome]
    const heavy = pool.mountains.length > 0 && rng() < input.mountainDensity
    const sids = heavy ? pool.mountains : pool.obstacles.length > 0 ? pool.obstacles : pool.mountains
    if (sids.length === 0) return null
    // A few tries; the wall must cover the tile and stay on its own side of the line.
    for (let attempt = 0; attempt < 14; attempt++) {
      const sid = sids[Math.floor(rng() * sids.length)]
      const template = catalogById.get(sid)
      const spanX = template?.sizeX ?? 1
      const spanZ = template?.sizeZ ?? 1
      const ax = x - Math.floor(rng() * spanX)
      const az = z + Math.floor(rng() * spanZ)
      const cells = computeFootprintTiles(template, ax, az)
      const onSide = cells.every((c) => (x === left ? c.x <= left : c.x >= right))
      const covers = cells.some((c) => c.value === 1 && c.x === x && c.z === z)
      if (!onSide || !covers) continue
      if (cells.some((c) => c.value === 1 && gate.has(c.z) && (c.x === left || c.x === right))) continue
      const anchor = nodeOf(ax, az)
      if (cells.some((c) => c.value !== 0 && roadNodes.has(nodeOf(c.x, c.z)))) continue
      if (tryPlaceAt(sid, anchor, sizeX, sizeZ, catalogById, state)) {
        for (const c of cells) if (c.value === 1) solid.add(nodeOf(c.x, c.z))
        const placement: ZonePlacement = { tempId: nextTempId(), sid, node: anchor }
        result.walls.push(placement)
        return placement
      }
    }
    return null
  }

  // Gate guards: a road that crosses the line without a guard on it gets one, on the left tile.
  if (input.guardOverrides && roadRows.length > 0) {
    const clusters: number[][] = []
    for (const z of roadRows) {
      const last = clusters[clusters.length - 1]
      if (last && z - last[last.length - 1] <= 1) last.push(z)
      else clusters.push([z])
    }
    for (const cluster of clusters) {
      const guarded = cluster.some((z) => [left, right].some((x) => [-1, 0, 1].some((dz) => guardSet.has(nodeOf(x, z + dz)))))
      if (guarded) continue
      const z = cluster[Math.floor(cluster.length / 2)]
      const node = [nodeOf(left, z), nodeOf(right, z)].find((n) => roadNodes.has(n))
      if (node === undefined) continue
      if (tryPlaceAt('random-squad', node, sizeX, sizeZ, catalogById, state)) {
        result.guards.push({ tempId: nextTempId(), sid: 'random-squad', node, randomSquadOverrides: { ...input.guardOverrides } })
      }
    }
  }
  return result
}
