// ─── Map Grid — blocked-entrance validation (Bug B root cause, 2026-09-10) ──
// Real root cause of the long-standing RMG load-freeze investigation: a
// decorative object (a pinetree) placed directly on a player city's own
// entrance tile. A placement's ANCHOR tile being free was never enough — the
// real "step here to interact" tile is its footprint's `value===2` cell(s)
// (footprint.ts's own documented convention, already relied on by
// accessibility-pass.ts's `accessNodesFor` and bounds-autofix.ts's player-
// start seeding) — an unrelated object's SOLID (`value===1`) footprint
// landing on exactly that tile leaves the object itself perfectly in-bounds
// and non-overlapping at ITS OWN anchor, so nothing previously caught this.
// Applies to every object with a real entrance, not just cities — any
// interactable/artifact/resource/spawner template that "mixes in" a
// value===2 cell (footprint.ts's own doc comment) has the exact same
// failure mode.
//
// A SECOND, narrower failure mode along the same lines (found 2026-09-11 via
// a real H3 import — Ville'de'Porte.h3m's city-spawner id 1901, owner 2):
// `entranceGroups()` computes each group's own `entranceNode` (the `2` cell
// itself) separately from `protectedNodes` (the *approach* ring around it) —
// this function used to only ever check `protectedNodes`, so another
// object's solid footprint landing directly ON the entrance cell itself
// (not the approach ring, but the literal "stand here to interact" tile)
// went undetected even though the approach ring was completely open. Real
// case: `tree_dead_3` placed exactly on city-spawner 1901's entrance cell —
// every `protectedNodes` check passed clean, so the object was never flagged
// and the auto-fix pass never touched that tree.

import type { MapContext, PlacedObject } from '@/types/map-context'
import type { GameCatalog } from '@/lib/catalog/types'
import {computeFootprintTiles, entranceGroups} from './footprint'
import { buildBlockedTileSet } from './passability'

export interface BlockedEntrancePlacement {
  sid: string
  id: number
  x: number
  z: number
  node: number
  /** The placed object's rotation (10-13 = mirrored), for its footprint. */
  rotation?: number
}

type EntranceValidationContext = Pick<MapContext, 'sizeX' | 'sizeZ' | 'placedObjects' | 'levelsMap' | 'climbsMap' | 'waterMap'>

/** The entrance cells and approach rings of every object with a real entrance, except `excludeKey`'s own. A mover's solid cell must not land on one, or the
 *  move itself blocks the entrance it was meant to free (Stormlight_2: a resource pile moved out of a windmill's approach ring into another tile of it, again and
 *  again, so the auto-fix never converged). */
export function entranceApproachNodes(
  context: EntranceValidationContext,
  catalog: GameCatalog | null,
  excludeKey?: string,
): Set<number> {
  const catalogById = new Map((catalog?.mapObjects ?? []).map((o) => [o.id, o]))
  const nodes = new Set<number>()
  for (const placed of context.placedObjects as PlacedObject[]) {
    if (placed.type !== 0 || placed.key === excludeKey) continue
    const groups = entranceGroups(computeFootprintTiles(catalogById.get(placed.sid), placed.x, placed.z, placed.rotation), context.sizeX, context.sizeZ)
    for (const g of groups) {
      nodes.add(g.entranceNode)
      for (const n of g.protectedNodes) nodes.add(n)
    }
  }
  return nodes
}

/** Every type-0 placement whose real entrance is entirely blocked — by
 *  another object's solid footprint, water, or an unramped elevation wall
 *  (the same three-source rule `buildBlockedTileSet` already uses for the
 *  grid's own blocked-tile overlay). Evaluated per entrance cell
 *  (`footprint.ts`'s `entranceGroups`, one group per `value===2` cell) so an
 *  object with multiple entrance cells (e.g. `resource_dust`'s 8-cell ring
 *  around a solid center) is only flagged if EVERY group is blocked — one
 *  open side is enough to actually reach it. Objects with no `value===2`
 *  cell at all (plain decorations, mines, most environments) have no
 *  entrance concept and are never checked. */
export function findBlockedEntrancePlacements(
  context: EntranceValidationContext,
  catalog: GameCatalog | null,
): BlockedEntrancePlacement[] {
  const { sizeX, sizeZ } = context
  const catalogById = new Map((catalog?.mapObjects ?? []).map((o) => [o.id, o]))
  const blocked = buildBlockedTileSet(context, catalog)
  const violations: BlockedEntrancePlacement[] = []

  for (const placed of context.placedObjects as PlacedObject[]) {
    if (placed.type !== 0) continue
    const template = catalogById.get(placed.sid)
    const allCells = computeFootprintTiles(template, placed.x, placed.z, placed.rotation)
    const groups = entranceGroups(allCells, sizeX, sizeZ)
    if (groups.length === 0) continue
    const allBlocked = groups.every((g) => blocked.has(g.entranceNode) || [...g.protectedNodes].some((n) => blocked.has(n)))
    if (allBlocked) {
      violations.push({ sid: placed.sid, id: placed.id, x: placed.x, z: placed.z, node: placed.node, rotation: placed.rotation })
    }
  }

  return violations
}

/** The objects whose solid cells block a flagged object's entrance, for the group that needs the fewest removed (one open side is enough). Empty when
 *  every group is also blocked by water or an elevation wall: no object removal would help. */
export function findEntranceBlockers(
  context: EntranceValidationContext,
  catalog: GameCatalog | null,
  targetId: number,
): PlacedObject[] {
  const { sizeX, sizeZ } = context
  const catalogById = new Map((catalog?.mapObjects ?? []).map((o) => [o.id, o]))
  const placedObjects = (context.placedObjects as PlacedObject[]).filter((o) => o.type === 0)
  const target = placedObjects.find((o) => o.id === targetId)
  if (!target) return []
  const blocked = buildBlockedTileSet(context, catalog)
  const ownersByNode = new Map<number, PlacedObject[]>()
  for (const obj of placedObjects) {
    if (obj.id === targetId) continue
    for (const cell of computeFootprintTiles(catalogById.get(obj.sid), obj.x, obj.z, obj.rotation)) {
      if (cell.value !== 1) continue
      const node = cell.z * sizeX + cell.x
      const owners = ownersByNode.get(node)
      if (owners) owners.push(obj)
      else ownersByNode.set(node, [obj])
    }
  }
  let best: PlacedObject[] | null = null
  for (const group of entranceGroups(computeFootprintTiles(catalogById.get(target.sid), target.x, target.z, target.rotation), sizeX, sizeZ)) {
    const blockers = new Map<number, PlacedObject>()
    let removable = true
    for (const node of [group.entranceNode, ...group.protectedNodes]) {
      if (!blocked.has(node)) continue
      const owners = ownersByNode.get(node)
      if (!owners || owners.length === 0) { removable = false; break }
      for (const owner of owners) blockers.set(owner.id, owner)
    }
    if (removable && (best === null || blockers.size < best.length)) best = [...blockers.values()]
  }
  return best ?? []
}
