// ─── Sealing the zone borders of a mirrored map ─────────────────────────────
// The boundary walls and gate guards (zone-boundary.ts) are placed on the whole
// map before a mirrored map copies its left half onto the right, and every object
// that straddles the middle line is dropped by the copy. Two things follow:
//
//  1. Where two zones touch right on the middle line (Double neutral, Hub, Ring on
//     small maps) holes open in the wall.
//  2. The walls leave an opening five tiles wide around each road crossing (the "gate
//     buffer") with a single guard in it, and on a small map the route from one start
//     to the other can pass beside every guard. The mirror pairs two such gates in
//     series, and the walk between two opposing starts becomes too easy.
//
// So this pass seals the borders of a mirrored map up to the road itself:
//  - every unguarded road crossing in the left half gets a gate guard;
//  - every open border tile in the left half that is not a road tile or a guard tile gets a
//    wall of its biome (kept wholly in the left half), so the only way across a border is
//    the guarded road tile;
//  - the border on the middle line gets one wall on either the left or the right column
//    per run of rows (not a mirror image, so it is not a double wall; both players face the
//    same closed line);
//  - the walls and guards of the left half are copied to the right half, mirrored.

import type { CatalogMapObject } from '@/lib/catalog/types'
import { buildFuzzyObstaclePools } from '@/lib/map-grid/fuzzy-obstacle'
import { computeFootprintTiles, protectedNeighborNodes } from '@/lib/map-grid/footprint'
import { isElevationWallTile, NON_BLOCKING_SPAWNER_SIDS } from '@/lib/map-grid/passability'
import type { BiomeId } from '@/lib/map-grid/terrain-colors'
import { createPlacementState, tryPlaceAt, ZONE_BIOMES, type ZonePlacement } from './zone-population'
import { mirrorNode } from './zone-mirror'

/** A zone smaller than this is not walled in (the boundary pass does the same). */
const MIN_ZONE_SIZE_TO_WALL = 40

export interface CloseBordersInput {
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

export interface CloseBordersResult {
  /** Walls to add, left half, middle line and the mirrored copies (rotation 10). */
  walls: ZonePlacement[]
  guards: ZonePlacement[]
  /** Border rows on the middle line left open as gates. */
  gateRows: number
  /** Open border tiles in the left half that no wall fitted on. */
  gaps: number
  /** Anchor tiles of pickups and guards a wall cut off from the starts: remove them (a building is never cut off). */
  removeNodes: number[]
}

/** A wall this pass placed and whether it is copied to the right half. */
interface WallRecord {
  placement: ZonePlacement
  /** 'left': placed in the left half and copied to the right; 'axis': on the middle line, no copy. */
  kind: 'left' | 'axis'
}

export function closeMirroredBorders(input: CloseBordersInput): CloseBordersResult {
  const { sizeX, sizeZ, zoneIdByNode, zoneBiome, catalogById, mapObjects, objects, guardNodes, roadNodes, waterMap, levelsMap, climbsMap, rng, nextTempId } = input
  const left = sizeX / 2 - 1
  const right = sizeX / 2
  const nodeOf = (x: number, z: number): number => z * sizeX + x
  const result: CloseBordersResult = { walls: [], guards: [], gateRows: 0, gaps: 0, removeNodes: [] }
  const records: WallRecord[] = []
  // Set up once the reachability data exists (after the gate guards): placeWall calls them.
  let keepsReach: (tiles: number[]) => number[] | null = () => []
  let closedArr: Uint8Array = new Uint8Array(0)
  let kind: WallRecord['kind'] = 'left'

  // What is already solid, for the gap test and for placing new walls.
  const solid = new Set<number>()
  const occupied = new Set<number>()
  const anchors = new Set<number>()
  for (const o of objects) {
    anchors.add(o.node)
    const cells = computeFootprintTiles(catalogById.get(o.sid), o.node % sizeX, Math.floor(o.node / sizeX), o.rotation)
    // A pickup (artifact, resource, item) is ringed by eight entrance cells, any one of which will do; a
    // building has one or two. Only a building's entrance and the tiles in front of it stay free of walls.
    const entranceCells = cells.filter((c) => c.value === 2).length
    const building = entranceCells > 0 && entranceCells <= 2
    for (const c of cells) {
      if (c.x < 0 || c.x >= sizeX || c.z < 0 || c.z >= sizeZ) continue
      if (c.value === 1) solid.add(nodeOf(c.x, c.z))
      if (c.value === 1 || (c.value === 2 && building)) occupied.add(nodeOf(c.x, c.z))
    }
    if (building) for (const n of protectedNeighborNodes(cells, sizeX, sizeZ)) occupied.add(n)
  }
  const guardSet = new Set(guardNodes)
  const closedTile = (node: number): boolean => solid.has(node) || waterMap[node] !== 0 || isElevationWallTile(node, sizeX, sizeZ, levelsMap, climbsMap)

  // Placement state: everything solid, entrance or road is blocked, every anchor used; the biome of the
  // right half is the mirror image of the left half's.
  const state = createPlacementState(occupied, anchors)
  if (input.tileBiome) {
    const biome = input.tileBiome.slice()
    for (let node = 0; node < biome.length; node++) if (node % sizeX >= right) biome[node] = input.tileBiome[mirrorNode(node, sizeX)]
    state.tileBiome = biome
  }
  for (const n of guardSet) state.usedAnchors.add(n)
  for (const n of roadNodes) state.blocked.add(n)
  for (let node = 0; node < waterMap.length; node++) if (waterMap[node] !== 0) { state.blocked.add(node); state.usedAnchors.add(node) }

  const zoneSize = new Map<number, number>()
  for (const id of zoneIdByNode) zoneSize.set(id, (zoneSize.get(id) ?? 0) + 1)
  const pools = buildFuzzyObstaclePools(mapObjects)

  /** A wall of the tile's biome that covers (x, z) and stays on its own side of the middle line. */
  function placeWall(x: number, z: number): ZonePlacement | null {
    const target = nodeOf(x, z)
    if (closedTile(target)) return null
    const biome = zoneBiome.get(zoneIdByNode[target]) ?? ZONE_BIOMES[0]
    const pool = pools[biome]
    const heavy = pool.mountains.length > 0 && rng() < input.mountainDensity
    const sids = heavy ? pool.mountains : pool.obstacles.length > 0 ? pool.obstacles : pool.mountains
    if (sids.length === 0) return null
    const onLeft = x <= left
    // Every wall of the biome, in random order, at every anchor that puts one of its solid cells on the tile
    // (smaller walls first when the first few picks do not fit, so a narrow gap still gets closed).
    const order = sids.map((sid) => ({ sid, key: rng() })).sort((a, b) => a.key - b.key).map((e) => e.sid)
    const bySize = [...order].sort((a, b) => ((catalogById.get(a)?.sizeX ?? 1) * (catalogById.get(a)?.sizeZ ?? 1)) - ((catalogById.get(b)?.sizeX ?? 1) * (catalogById.get(b)?.sizeZ ?? 1)))
    for (const sid of [...order.slice(0, 6), ...bySize]) {
      const template = catalogById.get(sid)
      const spanX = template?.sizeX ?? 1
      const spanZ = template?.sizeZ ?? 1
      for (let dx = 0; dx < spanX; dx++) {
        for (let dz = 0; dz < spanZ; dz++) {
          const ax = x - dx
          const az = z + dz
          const cells = computeFootprintTiles(template, ax, az)
          if (!cells.every((c) => (onLeft ? c.x <= left : c.x >= right))) continue
          if (!cells.some((c) => c.value === 1 && c.x === x && c.z === z)) continue
          if (cells.some((c) => c.value !== 0 && (roadNodes.has(nodeOf(c.x, c.z)) || guardSet.has(nodeOf(c.x, c.z))))) continue
          const anchor = nodeOf(ax, az)
          // A wall that would cut off a pickup, guard or building (or a start from the others) is not placed.
          const wallTiles = cells.filter((c) => c.value === 1).map((c) => nodeOf(c.x, c.z))
          const toggled = keepsReach(kind === 'left' ? [...wallTiles, ...wallTiles.map((n) => mirrorNode(n, sizeX))] : wallTiles)
          if (!toggled) continue
          if (!tryPlaceAt(sid, anchor, sizeX, sizeZ, catalogById, state)) { for (const n of toggled) closedArr[n] = 0; pendingCut = []; continue }
          {
            commitCut()
            for (const c of cells) if (c.value === 1) solid.add(nodeOf(c.x, c.z))
            const placement: ZonePlacement = { tempId: nextTempId(), sid, node: anchor }
            records.push({ placement, kind })
            return placement
          }
        }
      }
    }
    return null
  }

  const guardNear = (node: number, radius: number): boolean => {
    const x = node % sizeX
    const z = Math.floor(node / sizeX)
    for (let dz = -radius; dz <= radius; dz++) for (let dx = -radius; dx <= radius; dx++) if (guardSet.has(nodeOf(x + dx, z + dz))) return true
    return false
  }
  const addGuard = (node: number): boolean => {
    if (!input.guardOverrides || !tryPlaceAt('random-squad', node, sizeX, sizeZ, catalogById, state)) return false
    result.guards.push({ tempId: nextTempId(), sid: 'random-squad', node, randomSquadOverrides: { ...input.guardOverrides } })
    guardSet.add(node)
    return true
  }
  const neighbours4 = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const
  const leftGuardsStart = result.guards.length

  // 1. Left half: a guard on every road crossing between two zones that has none.
  for (let z = 0; z < sizeZ; z++) {
    for (let x = 0; x <= left; x++) {
      const node = nodeOf(x, z)
      if (!roadNodes.has(node)) continue
      const crosses = neighbours4.some(([dx, dz]) => {
        const nx = x + dx
        const nz = z + dz
        if (nx < 0 || nx > left || nz < 0 || nz >= sizeZ) return false
        const other = nodeOf(nx, nz)
        return roadNodes.has(other) && zoneIdByNode[other] !== zoneIdByNode[node]
      })
      if (crosses && !guardNear(node, 1)) addGuard(node)
    }
  }

  // Reachability: the starts and everything that has to stay reachable (pickups, guards, buildings, the
  // new gate guards and their copies), flooded over the tiles that are not solid, water or an elevation wall.
  const tileCount = sizeX * sizeZ
  closedArr = new Uint8Array(tileCount)
  for (let node = 0; node < tileCount; node++) closedArr[node] = closedTile(node) ? 1 : 0
  const starts: number[] = []
  /** Something that has to stay reachable; a minor one (a pickup or a guard) may be given up to close a border. */
  interface Target { access: number[]; anchor: number; minor: boolean }
  const targets: Target[] = []
  for (const o of objects) {
    const cells = computeFootprintTiles(catalogById.get(o.sid), o.node % sizeX, Math.floor(o.node / sizeX), o.rotation)
    const entrances = cells.filter((c) => c.value === 2 && c.x >= 0 && c.x < sizeX && c.z >= 0 && c.z < sizeZ).map((c) => nodeOf(c.x, c.z))
    if (o.sid === 'city-spawner' || o.sid === 'hero-spawner') { starts.push(...entrances); continue }
    if (NON_BLOCKING_SPAWNER_SIDS.has(o.sid)) targets.push({ access: [o.node], anchor: o.node, minor: true })
    else if (entrances.length > 0) targets.push({ access: entrances, anchor: o.node, minor: false })
  }
  const newGuardNodes = new Set<number>()
  for (const g of result.guards) { newGuardNodes.add(g.node); newGuardNodes.add(mirrorNode(g.node, sizeX)) }
  for (const n of guardSet) if (!newGuardNodes.has(n)) targets.push({ access: [n], anchor: n, minor: true })
  for (const n of newGuardNodes) targets.push({ access: [n], anchor: n, minor: false })
  const queue = new Int32Array(tileCount)
  const flood = (): Uint8Array => {
    const seen = new Uint8Array(tileCount)
    let head = 0
    let tail = 0
    for (const n of starts) if (!closedArr[n] && !seen[n]) { seen[n] = 1; queue[tail++] = n }
    while (head < tail) {
      const n = queue[head++]
      const x = n % sizeX
      const z = (n - x) / sizeX
      if (x > 0 && !seen[n - 1] && !closedArr[n - 1]) { seen[n - 1] = 1; queue[tail++] = n - 1 }
      if (x < sizeX - 1 && !seen[n + 1] && !closedArr[n + 1]) { seen[n + 1] = 1; queue[tail++] = n + 1 }
      if (z > 0 && !seen[n - sizeX] && !closedArr[n - sizeX]) { seen[n - sizeX] = 1; queue[tail++] = n - sizeX }
      if (z < sizeZ - 1 && !seen[n + sizeX] && !closedArr[n + sizeX]) { seen[n + sizeX] = 1; queue[tail++] = n + sizeX }
    }
    return seen
  }
  const baseline = flood()
  let pendingCut: Target[] = []
  /** The wall that was just tested is placed for good: what it sealed off is given up. */
  const commitCut = (): void => {
    for (const target of pendingCut) result.removeNodes.push(target.anchor)
    if (pendingCut.length > 0) mustStay = mustStay.filter((target) => !pendingCut.includes(target))
    pendingCut = []
  }
  let mustStay = targets.filter((target) => target.access.some((n) => baseline[n]))
  /** Closes `tiles` for the test; returns the tiles it closed, or null (and leaves everything as it was) when that cuts something off. */
  const keepsReachImpl = (tiles: number[]): number[] | null => {
    const toggled: number[] = []
    for (const n of tiles) if (n >= 0 && n < tileCount && !closedArr[n]) { closedArr[n] = 1; toggled.push(n) }
    const seen = flood()
    const cut = mustStay.filter((target) => !target.access.some((n) => seen[n]))
    // A pickup or a guard in a pocket the wall would seal is given up; a building never is.
    if (cut.every((target) => target.minor)) {
      pendingCut = cut
      return toggled
    }
    for (const n of toggled) closedArr[n] = 0
    return null
  }
  keepsReach = keepsReachImpl

  // 2. Left half: wall every open border tile that is not a road tile or a guard tile.
  const gapTiles: number[] = []
  for (let z = 0; z < sizeZ; z++) {
    for (let x = 0; x <= left; x++) {
      const node = nodeOf(x, z)
      // (A tile that only holds the anchor of a non-blocking decoration is fine: the wall is anchored elsewhere.)
      if (closedTile(node) || state.blocked.has(node)) continue
      const zone = zoneIdByNode[node]
      if ((zoneSize.get(zone) ?? 0) < MIN_ZONE_SIZE_TO_WALL) continue
      const onBorder = neighbours4.some(([dx, dz]) => {
        const nx = x + dx
        const nz = z + dz
        if (nx < 0 || nx > left || nz < 0 || nz >= sizeZ) return false
        return zoneIdByNode[nodeOf(nx, nz)] !== zone
      })
      if (onBorder && !placeWall(x, z)) { result.gaps++; gapTiles.push(node) }
    }
  }

  // A border tile no wall may close (it would cut something off, usually a passage into a pocket with a building)
  // is guarded instead: one gate guard per few tiles of such a gap, so it is a gate and not an open way across.
  for (const node of gapTiles) {
    if (!guardNear(node, 2)) addGuard(node)
  }

  const leftGuards = result.guards.slice(leftGuardsStart)


  // 3. The middle line: one wall per run of border rows, on the left or right column.
  kind = 'axis'
  const borderRows: number[] = []
  for (let z = 0; z < sizeZ; z++) {
    if (zoneIdByNode[nodeOf(left, z)] !== zoneIdByNode[nodeOf(right, z)]) borderRows.push(z)
  }
  const gateRowSet = new Set<number>()
  const roadRows: number[] = []
  for (const z of borderRows) {
    const pair = [nodeOf(left, z), nodeOf(right, z)]
    if (pair.some((n) => roadNodes.has(n))) roadRows.push(z)
    if (pair.some((n) => roadNodes.has(n) || guardSet.has(n))) gateRowSet.add(z)
  }
  result.gateRows = gateRowSet.size
  const runs: number[][] = []
  for (const z of borderRows) {
    const last = runs[runs.length - 1]
    if (last && last[last.length - 1] === z - 1) last.push(z)
    else runs.push([z])
  }
  for (const run of runs) {
    const side = rng() < 0.5 ? left : right
    for (const z of run) {
      if (gateRowSet.has(z) || closedTile(nodeOf(side, z))) continue
      // Out of luck on this side (no wall fits): the other column keeps the line closed here.
      if (!placeWall(side, z)) placeWall(side === left ? right : left, z)
    }
  }
  // A road across the middle line without a guard gets one, on its left tile.
  if (input.guardOverrides && roadRows.length > 0) {
    const clusters: number[][] = []
    for (const z of roadRows) {
      const last = clusters[clusters.length - 1]
      if (last && z - last[last.length - 1] <= 1) last.push(z)
      else clusters.push([z])
    }
    for (const cluster of clusters) {
      if (cluster.some((z) => guardNear(nodeOf(left, z), 1) || guardNear(nodeOf(right, z), 1))) continue
      const z = cluster[Math.floor(cluster.length / 2)]
      const node = [nodeOf(left, z), nodeOf(right, z)].find((n) => roadNodes.has(n))
      if (node !== undefined) addGuard(node)
    }
  }

  // 4. The walls (the left half's also copied to the right half with the game's mirrored rotation).
  for (const r of records) {
    result.walls.push(r.placement)
    if (r.kind === 'left') result.walls.push({ ...r.placement, tempId: nextTempId(), node: mirrorNode(r.placement.node, sizeX), rotation: 10 })
  }
  for (const guard of leftGuards) {
    result.guards.push({ ...guard, tempId: nextTempId(), node: mirrorNode(guard.node, sizeX) })
  }
  return result
}
