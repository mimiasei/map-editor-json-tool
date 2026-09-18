// ─── RMG post-generation validation & repair (issue #210, user-reported) ────
// A real user report: "the validation pass must really look for 'impossible'
// cases, like objects (resource, item or squad) on water or zones that have
// no opening at all. General rule: quality over speed — better to spend more
// time on passes and validation than to get a random map generated super
// quickly." This module is that pass: it runs LAST, after every other
// placement decision has been made, and checks the map's own FINAL state
// against real physical-possibility rules this codebase already enforces
// everywhere else — not by re-deriving a new passability model, but by
// reusing the exact same `buildBlockedTileSet` (`passability.ts`) every
// other reachability computation in this codebase already trusts.
//
// Two checks, both fix-then-verify (never just a warning where a real repair
// is possible):
// 1. Sealed zones — a zone with literally no tile reachable from any player
//    spawner (a real risk this generator's own wall-the-boundary feature
//    introduced: a zone whose only real road/river crossing failed to be
//    detected, or one that never got a crossing at all, would otherwise be
//    walled in on every side with zero gates). Repaired by removing wall
//    obstacles bordering the sealed zone until it opens up, then
//    re-verifying — not by guessing which wall tile is "the" blocker.
// 2. Objects on water — any object or squad whose own tile is marked water
//    in the final `waterMap`. Repaired by reclaiming that specific water
//    tile back to land (the same "land bridge" technique the road
//    generator's own water-partition repair already uses), never by moving
//    the object (which could just relocate the problem into a new
//    collision).

import type { CatalogMapObject, GameCatalog } from '@/lib/catalog/types'
import { computeFootprintTiles } from '@/lib/map-grid/footprint'
import { buildBlockedTileSet, isElevationWallTile } from '@/lib/map-grid/passability'
import type { PlacedObject } from '@/types/map-context'
import type { ObjectPlacementGroup } from '@/lib/h3-import/accessibility-pass'
import type { ConcreteSquadPlacement } from './zone-population'
import { findAdjacentLevelZeroNode } from './zone-elevation'

const NEIGHBOR_OFFSETS: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]]

/** `portalNodeAdjacency` (node -> its linked portal's node) treats a
 *  linked portal pair as a direct edge — required because an island is
 *  reached ONLY by portal, never a walkable path (this codebase's own
 *  standing rule), so a pure orthogonal-neighbor flood-fill would flag
 *  EVERY island zone as sealed regardless of whether its portal actually
 *  works, real bug confirmed 2026-09-08: every island generation logged
 *  4-6 of 12 zones as sealed, at a rate matching "every real island zone",
 *  and the repair that followed then stripped those zones' own decorative
 *  placements for nothing (removing an obstacle can't open a portal-only
 *  route) — a real, non-decorative-object false positive, not the
 *  degenerate case its own doc comment describes. */
function floodFillReachable(seeds: number[], blocked: Set<number>, sizeX: number, sizeZ: number, portalNodeAdjacency: Map<number, number>): Set<number> {
  const visited = new Set<number>(seeds)
  const queue = [...seeds]
  while (queue.length > 0) {
    const node = queue.pop() as number
    const portalPartner = portalNodeAdjacency.get(node)
    if (portalPartner !== undefined && !visited.has(portalPartner) && !blocked.has(portalPartner)) {
      visited.add(portalPartner)
      queue.push(portalPartner)
    }
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

/** `buildBlockedTileSet` (`passability.ts`) reads a `PlacedObject`'s own
 *  `x`/`z` fields, NOT `node` — a real bug this file's own first version
 *  had (`x: -1, z: -1` placeholders, on the wrong assumption only `node`
 *  mattered): every object's footprint cells landed at nonsensical negative
 *  coordinates and got silently dropped by `buildBlockedTileSet`'s own
 *  bounds check, so NO object — including this module's own wall
 *  obstacles — ever counted as blocking, and `repairSealedZones` below
 *  could never detect a real sealed zone at all. Confirmed via a real
 *  16×16/2-player/`boundaryGuardStrength:'strong'` generation that came out
 *  with 3 of its 4 zones fully walled in with zero openings, silently,
 *  because this exact bug made the check believe everything was fine. */
function buildFlatPlaced(objectGroups: Map<string, ObjectPlacementGroup>, sizeX: number): PlacedObject[] {
  const flat: PlacedObject[] = []
  for (const [sid, group] of objectGroups) {
    for (let i = 0; i < group.ids.length; i++) {
      const id = group.ids[i]
      const node = group.nodes[i]
      const x = node % sizeX
      const z = Math.floor(node / sizeX)
      flat.push({ key: `0:${id}`, type: 0, id, sid, x, z, node } as PlacedObject)
    }
  }
  return flat
}

/** Removes every entry (across `objectGroups`' own parallel arrays) whose
 *  `tempId` is in `tempIds` — the repair primitive both checks below use to
 *  actually undo a placement decision rather than just reporting it. */
function removeFromObjectGroups(objectGroups: Map<string, ObjectPlacementGroup>, tempIds: Set<number>): void {
  if (tempIds.size === 0) return
  for (const group of objectGroups.values()) {
    for (let i = group.ids.length - 1; i >= 0; i--) {
      if (!tempIds.has(group.ids[i])) continue
      group.ids.splice(i, 1)
      group.nodes.splice(i, 1)
      group.rotations.splice(i, 1)
      group.levels.splice(i, 1)
    }
  }
}

export interface SealedZoneRepairOptions {
  sizeX: number
  sizeZ: number
  zoneIds: number[]
  zoneIdByNode: number[]
  objectGroups: Map<string, ObjectPlacementGroup>
  /** Every DECORATIVE placement (zone-boundary wall obstacles AND regular
   *  zone-interior scatter obstacles alike — anything already marked
   *  removable-if-blocking, same set `applyAccessibilityPass`'s own
   *  `decorativeIds` uses) — the repair's own candidate pool. Deliberately
   *  not scoped to wall obstacles alone: on a small enough map, regular
   *  obstacle scattering can seal a tiny zone in on its own, with no
   *  boundary-wall feature involved at all (confirmed on a real 16×16/
   *  2-player generation), so the repair needs to consider anything
   *  removable, not just this specific feature's own placements. */
  decorativePlacements: { tempId: number; node: number }[]
  spawnerSid: string
  catalog: GameCatalog
  catalogById: Map<string, CatalogMapObject>
  levelsMap: number[]
  /** Mutated in place when the ramp-punching repair tactic fires (see this
   *  function's own doc comment) — a caller should treat its own array as
   *  possibly changed after this call, same as `objectGroups`. */
  climbsMap: number[]
  waterMap: number[]
  /** tempId -> linked portal's tempId (generate-random-map.ts's own
   *  `portalAdjacency`, the exact same map `applyAccessibilityPass`
   *  already consumes) — an island is reached ONLY by portal, so this
   *  reachability check needs the same portal-hop awareness or it flags
   *  every island zone as sealed. Optional/defaults to empty so a caller
   *  with no portals (or one that hasn't been updated) sees no behavior
   *  change. */
  portalAdjacency?: Map<number, number>
}

export interface SealedZoneRepairResult {
  /** Zone ids that were sealed before repair (empty on a clean map — the
   *  overwhelmingly common case). */
  sealedZoneIds: number[]
  /** Zone ids still sealed AFTER repair — a real, disclosed failure (e.g. a
   *  zone with no decorative object bordering it at all to remove, so
   *  whatever's actually sealing it is a REAL, non-decorative placement —
   *  a mine/dwelling this pass deliberately never deletes), not silently
   *  swallowed. */
  stillSealedZoneIds: number[]
  /** Ramp tiles this repair added (second tactic, tried only for a zone
   *  still sealed after decorative-object removal) — feed to
   *  `paintClimbTiles` to patch the real container, same as
   *  `reclaimWaterCollisions`'s own reclaimed-node list. Empty on a clean
   *  map or one decorative removal alone already fixed. */
  addedClimbChanges: { node: number; climb: 1 }[]
}

/**
 * Real flood-fill reachability from every player spawner over the CURRENT
 * `objectGroups` state (post accessibility-pass, pre-serialization) — if
 * any zone comes back with zero reachable tiles, removes decorative objects
 * bordering it (from `decorativePlacements`, mutating `objectGroups` in
 * place) until it opens up or there's nothing left to remove, then
 * re-verifies. Up to 3 rounds of removal per zone (each round removes every
 * decorative tile still bordering that zone, which should open it on the
 * very first round in every real case — more rounds only matter if an
 * opened gap still routes through another fully-sealed pocket, a
 * degenerate case this guards without assuming can't happen).
 */
export function repairSealedZones(options: SealedZoneRepairOptions): SealedZoneRepairResult {
  const { sizeX, sizeZ, zoneIds, zoneIdByNode, objectGroups, decorativePlacements, spawnerSid, catalog, catalogById, levelsMap, climbsMap, waterMap, portalAdjacency } = options

  // Resolve tempId-based portalAdjacency to node-based once up front —
  // portals themselves are never in `decorativePlacements` (so
  // `removeFromObjectGroups` never removes them across rounds below),
  // making this stable for the whole repair. Resolves to each portal's own
  // WALKABLE ACCESS cell (value===2), not its raw anchor node — every real
  // portal_1..portal_5 template's anchor is itself a SOLID, permanently-
  // blocked cell (confirmed real bug 2026-09-08, same root cause fixed in
  // accessibility-pass.ts's own portalNodeAdjacency — see that file's doc
  // comment for the full story), so using the anchor here made this same
  // "portal-aware" fix a no-op in practice: the anchor node can never
  // become `visited`, so the hop condition in `floodFillReachable` never
  // fires for it.
  const portalNodeAdjacency = new Map<number, number>()
  if (portalAdjacency && portalAdjacency.size > 0) {
    const idToNode = new Map<number, number>()
    const idToSid = new Map<number, string>()
    for (const [sid, group] of objectGroups) {
      for (let i = 0; i < group.ids.length; i++) { idToNode.set(group.ids[i], group.nodes[i]); idToSid.set(group.ids[i], sid) }
    }
    const accessNodeFor = (id: number): number | undefined => {
      const node = idToNode.get(id)
      if (node === undefined) return undefined
      const template = catalogById.get(idToSid.get(id) ?? '')
      const cells = computeFootprintTiles(template, node % sizeX, Math.floor(node / sizeX))
      const access = cells.find((c) => c.value === 2)
      if (!access || access.x < 0 || access.x >= sizeX || access.z < 0 || access.z >= sizeZ) return node
      return access.z * sizeX + access.x
    }
    for (const [fromId, toId] of portalAdjacency) {
      const fromNode = accessNodeFor(fromId)
      const toNode = accessNodeFor(toId)
      if (fromNode !== undefined && toNode !== undefined) portalNodeAdjacency.set(fromNode, toNode)
    }
  }

  // Factored out so the ramp-punching repair below can also know which
  // tiles are already occupied — a candidate ramp spot must never land on
  // one (real bug confirmed on `maps/map_elevation.map`: a stray ramp
  // landed directly on player 4's own city-spawner anchor tile, and the
  // map failed to load in the actual game because of it).
  const computeBlocked = (): Set<number> => {
    const placed = buildFlatPlaced(objectGroups, sizeX)
    return buildBlockedTileSet({ sizeX, sizeZ, placedObjects: placed, levelsMap, climbsMap, waterMap }, catalog)
  }

  const computeReachable = (): Set<number> => {
    const blocked = computeBlocked()
    const spawnerGroup = objectGroups.get(spawnerSid)
    const spawnerTemplate = catalogById.get(spawnerSid)
    const seeds: number[] = []
    if (spawnerGroup) {
      for (const node of spawnerGroup.nodes) {
        const x = node % sizeX
        const z = Math.floor(node / sizeX)
        const cells = computeFootprintTiles(spawnerTemplate, x, z)
        const accessCells = cells.filter((c) => c.value === 2)
        for (const cell of accessCells.length > 0 ? accessCells : [{ x, z }]) {
          if (cell.x < 0 || cell.x >= sizeX || cell.z < 0 || cell.z >= sizeZ) continue
          seeds.push(cell.z * sizeX + cell.x)
        }
      }
    }
    return floodFillReachable(seeds, blocked, sizeX, sizeZ, portalNodeAdjacency)
  }

  const sealedNow = (): Set<number> => {
    const reachable = computeReachable()
    const reachableZones = new Set<number>()
    for (const node of reachable) reachableZones.add(zoneIdByNode[node])
    return new Set(zoneIds.filter((id) => !reachableZones.has(id)))
  }

  const sealedBefore = sealedNow()
  if (sealedBefore.size === 0) return { sealedZoneIds: [], stillSealedZoneIds: [], addedClimbChanges: [] }

  for (let round = 0; round < 3; round++) {
    const stillSealed = sealedNow()
    if (stillSealed.size === 0) break
    const toRemove = new Set<number>()
    for (const placement of decorativePlacements) {
      if (stillSealed.has(zoneIdByNode[placement.node])) toRemove.add(placement.tempId)
    }
    if (toRemove.size === 0) break // nothing decorative left to remove — a real, disclosed dead end
    removeFromObjectGroups(objectGroups, toRemove)
  }

  // Second repair tactic (only reached for a zone STILL sealed after
  // decorative-object removal above): a real elevation wall — not a
  // removable object — sealing a zone can only be fixed by adding a ramp.
  // Punches one through every elevation-wall tile bordering a still-sealed
  // zone, same "keep trying while something changed" shape as the removal
  // loop above, tried strictly after (and only if) removal alone wasn't
  // enough — a ramp is a real terrain change, decorative removal isn't, so
  // the cheaper fix stays first-choice.
  const addedClimbChanges: { node: number; climb: 1 }[] = []
  if (sealedNow().size > 0) {
    const tileCount = sizeX * sizeZ
    for (let round = 0; round < 3; round++) {
      const stillSealed = sealedNow()
      if (stillSealed.size === 0) break
      let addedAny = false
      const blocked = computeBlocked()
      for (let node = 0; node < tileCount; node++) {
        if (!stillSealed.has(zoneIdByNode[node])) continue
        if (!isElevationWallTile(node, sizeX, sizeZ, levelsMap, climbsMap)) continue
        if (levelsMap[node] < 0 && blocked.has(node)) continue // the valley tile itself is occupied — not a usable ramp spot either
        const rampNode = levelsMap[node] < 0 ? node : findAdjacentLevelZeroNode(node, sizeX, sizeZ, levelsMap, blocked)
        if (rampNode === null || climbsMap[rampNode] === 1) continue
        climbsMap[rampNode] = 1
        addedClimbChanges.push({ node: rampNode, climb: 1 })
        addedAny = true
      }
      if (!addedAny) break // nothing left to open a ramp through — a real, disclosed dead end
    }
  }

  return { sealedZoneIds: [...sealedBefore], stillSealedZoneIds: [...sealedNow()], addedClimbChanges }
}

export interface ReclaimWaterCollisionsOptions {
  objectGroups: Map<string, ObjectPlacementGroup>
  concreteSquads: ConcreteSquadPlacement[]
  waterNodes: Set<number>
  /** Sids allowed to legitimately sit on water — `zone-fauna.ts`'s `fish`
   *  and approved ambient `fxs` sids, which are deliberately placed ON
   *  water and must never be "fixed" by draining the tile out from under
   *  them (this function's own reclaim logic has no way to tell "ended up
   *  on water by mistake" apart from "supposed to be on water" otherwise).
   *  Defaults to empty — every other caller's behavior is unchanged. */
  waterCompatibleSids?: Set<string>
}

export interface ReclaimWaterCollisionsResult {
  /** Nodes reclaimed back to land because a real object/squad was standing
   *  on them — feed to `paintWaterTiles`/`paintLevelTiles` (waterId 0,
   *  level 0) to patch the final container, same as the road generator's
   *  own water-partition repair does. */
  reclaimedNodes: Set<number>
}

/**
 * Any placed object OR squad whose own node is in `waterNodes` gets that
 * tile reclaimed to land — never the object moved (which could just
 * relocate the same problem into a new collision this pass hasn't checked
 * for). `waterNodes` is mutated in place so a caller checking it afterward
 * (or painting from it) sees the corrected state.
 */
export function reclaimWaterCollisions(options: ReclaimWaterCollisionsOptions): ReclaimWaterCollisionsResult {
  const { objectGroups, concreteSquads, waterNodes, waterCompatibleSids } = options
  const reclaimedNodes = new Set<number>()
  for (const [sid, group] of objectGroups) {
    if (waterCompatibleSids?.has(sid)) continue
    for (const node of group.nodes) {
      if (waterNodes.has(node)) { waterNodes.delete(node); reclaimedNodes.add(node) }
    }
  }
  for (const squad of concreteSquads) {
    if (waterNodes.has(squad.node)) { waterNodes.delete(squad.node); reclaimedNodes.add(squad.node) }
  }
  return { reclaimedNodes }
}
