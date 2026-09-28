// ─── Zone inference for real hand-crafted maps (issue #225) ─────────────────
// The RMG's own zone-graph pipeline (zone-graph.ts/zone-layout.ts) only ever
// runs forward: an abstract ZoneGraph -> a real zoneIdByNode partition. Real
// `.map` files never store zones at all, so issue #224's calibration work
// (zone-size ratios, zone-graph template mining) stalled with no way to ask
// "what would this real map's zones have looked like". This module is that
// reverse direction, approach 1 from issue #225's research (watershed/
// multi-source BFS seeded from player starts) — the issue's own recommended
// first attempt, picked over chokepoint/min-cut partitioning and feature
// clustering for having the most directly reusable building blocks (the
// multi-source-BFS skeleton already proven in zone-connections.ts's
// computeRoadDistanceField) and for producing output directly comparable to
// the RMG's own ZoneGraph/zoneIdByNode shape.
//
// Algorithm:
//  1. Blocked tiles: water + elevation-wall rules only for this first pass —
//     deliberately NOT passability.ts's buildBlockedTileSet with a null
//     catalog, which was tried first and found actively wrong for this use,
//     not merely simplified: footprint.ts's computeFootprintTiles falls back
//     to treating an object with no resolvable catalog template as a solid
//     1x1 block AT ITS OWN ANCHOR TILE (`{x,z,value:1}`) — so every real
//     player-start's own tile came back "blocked" and the BFS below never
//     had anywhere to seed from (confirmed: every tile came back unassigned
//     on every real map tried). Reuses isElevationWallTile (still exported
//     from passability.ts) directly instead, skipping only the footprint
//     sweep. A real GameCatalog would let a later revision reinstate
//     footprint-aware blocking; skipping it entirely for this first pass is
//     the correct call, not a shortcut through a working option.
//  2. Pass A — multi-source BFS from every player-start (city-spawner/
//     hero-spawner) node, grouped by owner: gives every reachable tile its
//     nearest player-start owner and hop-distance.
//  3. Neutral zone seeds: local maxima of that hop-distance (a tile whose
//     nearest-start distance is >= every reached 4-neighbor's), one per
//     player via greedy farthest-point sampling — mirrors buildZoneGraph's
//     own 1-neutral-per-player ring convention so the output is comparable.
//  4. Pass B — a second multi-source BFS from player-start AND neutral seeds
//     together produces the final zoneIdByNode. Blocked/unreached tiles get
//     the -1 sentinel, never assigned to a zone.
//  5. Edges: any two adjacent, differently-zoned tiles imply a zone
//     connection (same generic "boundary from zoneIdByNode" sweep as
//     zone-boundary.ts's computeAllBoundaryTiles).
//  6. ZoneSpec.size is set to the zone's REAL measured tile count — unlike
//     buildZoneGraph's hardcoded 3 (player) / 2 (neutral) synthetic weights,
//     this is actual evidence, the exact gap issue #225 exists to close.
//
// No ground-truth zone labeling exists for any real map (nobody hand-labels
// "zones" in a shipped map), so there is no way to score this against a
// correct answer — validation is necessarily indirect (does zone count scale
// with player count, is the resulting graph connected, does it agree with
// findIsolatedPlayerStarts). See the verification script this module was
// built alongside. Feeding this into zone-graph.ts's own hardcoded size
// ratio (#224 M2) or into rmg-template-catalog.ts (#224 M4) is deliberately
// out of scope here — this module's only job is producing a plausible
// inferred partition, not consuming it.

import type { PlacedObject } from '@/types/map-context'
import { isElevationWallTile } from '@/lib/map-grid/passability'
import type { ZoneGraph, ZoneSpec } from '@/lib/rmg/zone-graph'

const NEIGHBOR_OFFSETS: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]]

// Same two sids as reachability-validation.ts's own PLAYER_START_SIDS (not
// exported there, so mirrored here rather than changing existing code just
// to share a two-string Set).
const PLAYER_START_SIDS = new Set(['city-spawner', 'hero-spawner'])

const UNASSIGNED = -1

export interface ZoneInferenceInput {
  sizeX: number
  sizeZ: number
  waterMap: number[]
  levelsMap: number[]
  climbsMap: number[]
  placedObjects: PlacedObject[]
}

export interface ZoneInferenceResult {
  graph: ZoneGraph
  /** Same node = z*sizeX+x convention as generate-terrain.ts's own
   *  zoneIdByNode. -1 for a blocked or otherwise unreached tile. */
  zoneIdByNode: number[]
  tileCountByZoneId: Map<number, number>
}

/** Water + elevation-wall blocked tiles only — see this file's header
 *  comment for why object-footprint blocking (passability.ts's
 *  buildBlockedTileSet) isn't reused here. */
function buildTerrainBlockedSet(sizeX: number, sizeZ: number, waterMap: number[], levelsMap: number[], climbsMap: number[]): Set<number> {
  const blocked = new Set<number>()
  const tileCount = sizeX * sizeZ
  const hasLevels = levelsMap.length === tileCount
  const hasWater = waterMap.length === tileCount
  const climbs = climbsMap.length === tileCount ? climbsMap : []
  if (!hasLevels && !hasWater) return blocked
  for (let node = 0; node < tileCount; node++) {
    if (hasWater && waterMap[node] !== 0) { blocked.add(node); continue }
    if (hasLevels && isElevationWallTile(node, sizeX, sizeZ, levelsMap, climbs)) blocked.add(node)
  }
  return blocked
}

function multiSourceBfs(
  seedZoneByNode: Map<number, number>,
  blocked: Set<number>,
  sizeX: number,
  sizeZ: number,
): { zoneOfNode: Int32Array; distFromSeed: Int32Array } {
  const tileCount = sizeX * sizeZ
  const zoneOfNode = new Int32Array(tileCount).fill(UNASSIGNED)
  const distFromSeed = new Int32Array(tileCount).fill(-1)
  const queue: number[] = []
  for (const [node, zoneId] of seedZoneByNode) {
    if (blocked.has(node) || zoneOfNode[node] !== UNASSIGNED) continue
    zoneOfNode[node] = zoneId
    distFromSeed[node] = 0
    queue.push(node)
  }
  let head = 0
  while (head < queue.length) {
    const node = queue[head++]
    const zoneId = zoneOfNode[node]
    const d = distFromSeed[node]
    const x = node % sizeX
    const z = Math.floor(node / sizeX)
    for (const [dx, dz] of NEIGHBOR_OFFSETS) {
      const nx = x + dx
      const nz = z + dz
      if (nx < 0 || nx >= sizeX || nz < 0 || nz >= sizeZ) continue
      const n = nz * sizeX + nx
      if (blocked.has(n) || zoneOfNode[n] !== UNASSIGNED) continue
      zoneOfNode[n] = zoneId
      distFromSeed[n] = d + 1
      queue.push(n)
    }
  }
  return { zoneOfNode, distFromSeed }
}

function chooseNeutralSeeds(
  ownerOfNode: Int32Array,
  distFromStart: Int32Array,
  sizeX: number,
  sizeZ: number,
  playerSeedNodes: number[],
  targetCount: number,
): number[] {
  const isLocalMax = (node: number): boolean => {
    const d = distFromStart[node]
    const x = node % sizeX
    const z = Math.floor(node / sizeX)
    for (const [dx, dz] of NEIGHBOR_OFFSETS) {
      const nx = x + dx
      const nz = z + dz
      if (nx < 0 || nx >= sizeX || nz < 0 || nz >= sizeZ) continue
      const n = nz * sizeX + nx
      if (ownerOfNode[n] !== UNASSIGNED && distFromStart[n] > d) return false
    }
    return true
  }

  const candidates: number[] = []
  for (let node = 0; node < ownerOfNode.length; node++) {
    if (ownerOfNode[node] === UNASSIGNED) continue
    if (isLocalMax(node)) candidates.push(node)
  }
  candidates.sort((a, b) => distFromStart[b] - distFromStart[a])

  const manhattan = (a: number, b: number): number => {
    const ax = a % sizeX, az = Math.floor(a / sizeX)
    const bx = b % sizeX, bz = Math.floor(b / sizeX)
    return Math.abs(ax - bx) + Math.abs(az - bz)
  }

  const chosen: number[] = []
  const remaining = [...candidates]
  while (chosen.length < targetCount && remaining.length > 0) {
    let bestIdx = 0
    let bestScore = -1
    for (let i = 0; i < remaining.length; i++) {
      const node = remaining[i]
      let minDist = Infinity
      for (const s of playerSeedNodes) minDist = Math.min(minDist, manhattan(node, s))
      for (const s of chosen) minDist = Math.min(minDist, manhattan(node, s))
      if (minDist > bestScore) { bestScore = minDist; bestIdx = i }
    }
    chosen.push(remaining[bestIdx])
    remaining.splice(bestIdx, 1)
  }
  return chosen
}

export function inferZones(input: ZoneInferenceInput): ZoneInferenceResult {
  const { sizeX, sizeZ, waterMap, levelsMap, climbsMap, placedObjects } = input
  const tileCount = sizeX * sizeZ
  const empty: ZoneInferenceResult = { graph: { zones: [], edges: [] }, zoneIdByNode: [], tileCountByZoneId: new Map() }
  if (tileCount <= 0) return empty

  const blocked = buildTerrainBlockedSet(sizeX, sizeZ, waterMap, levelsMap, climbsMap)

  const seedNodesByOwner = new Map<number, number[]>()
  for (const obj of placedObjects) {
    if (obj.type !== 0 || !PLAYER_START_SIDS.has(obj.sid)) continue
    const owner = obj.spawnerInfo?.owner
    if (owner === undefined) continue
    const list = seedNodesByOwner.get(owner)
    if (list) list.push(obj.node)
    else seedNodesByOwner.set(owner, [obj.node])
  }
  const owners = [...seedNodesByOwner.keys()].sort((a, b) => a - b)
  if (owners.length === 0) return { ...empty, zoneIdByNode: new Array(tileCount).fill(UNASSIGNED) }

  // Pass A: player starts only, to find each reached tile's nearest owner + distance.
  const playerSeedMap = new Map<number, number>()
  for (const owner of owners) for (const node of seedNodesByOwner.get(owner) ?? []) if (!playerSeedMap.has(node)) playerSeedMap.set(node, owner)
  const { zoneOfNode: ownerOfNode, distFromSeed: distFromStart } = multiSourceBfs(playerSeedMap, blocked, sizeX, sizeZ)

  const allPlayerSeedNodes = [...playerSeedMap.keys()]
  const neutralSeeds = chooseNeutralSeeds(ownerOfNode, distFromStart, sizeX, sizeZ, allPlayerSeedNodes, owners.length)

  // Assign real zone ids: one per owner (player), one per neutral seed.
  const zones: ZoneSpec[] = []
  const zoneIdByOwner = new Map<number, number>()
  let nextZoneId = 0
  for (const owner of owners) {
    const id = nextZoneId++
    zoneIdByOwner.set(owner, id)
    zones.push({ id, kind: 'player', playerIndex: owner, size: 0 })
  }
  const neutralZoneIds: number[] = []
  for (let i = 0; i < neutralSeeds.length; i++) {
    const id = nextZoneId++
    neutralZoneIds.push(id)
    zones.push({ id, kind: 'neutral', size: 0 })
  }

  // Pass B: player + neutral seeds together -> final partition.
  const finalSeedMap = new Map<number, number>()
  for (const owner of owners) {
    const zoneId = zoneIdByOwner.get(owner) as number
    for (const node of seedNodesByOwner.get(owner) ?? []) finalSeedMap.set(node, zoneId)
  }
  for (let i = 0; i < neutralSeeds.length; i++) finalSeedMap.set(neutralSeeds[i], neutralZoneIds[i])
  const { zoneOfNode } = multiSourceBfs(finalSeedMap, blocked, sizeX, sizeZ)

  const tileCountByZoneId = new Map<number, number>()
  for (let node = 0; node < tileCount; node++) {
    const id = zoneOfNode[node]
    if (id === UNASSIGNED) continue
    tileCountByZoneId.set(id, (tileCountByZoneId.get(id) ?? 0) + 1)
  }
  for (const zone of zones) zone.size = tileCountByZoneId.get(zone.id) ?? 0

  const edgeKeys = new Set<string>()
  const edges: [number, number][] = []
  const addEdge = (a: number, b: number): void => {
    const key = a < b ? `${a}:${b}` : `${b}:${a}`
    if (edgeKeys.has(key)) return
    edgeKeys.add(key)
    edges.push(a < b ? [a, b] : [b, a])
  }
  for (let z = 0; z < sizeZ; z++) {
    for (let x = 0; x < sizeX; x++) {
      const node = z * sizeX + x
      const zoneId = zoneOfNode[node]
      if (zoneId === UNASSIGNED) continue
      if (x + 1 < sizeX) {
        const other = zoneOfNode[node + 1]
        if (other !== UNASSIGNED && other !== zoneId) addEdge(zoneId, other)
      }
      if (z + 1 < sizeZ) {
        const other = zoneOfNode[node + sizeX]
        if (other !== UNASSIGNED && other !== zoneId) addEdge(zoneId, other)
      }
    }
  }

  return { graph: { zones, edges }, zoneIdByNode: Array.from(zoneOfNode), tileCountByZoneId }
}
