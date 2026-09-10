// ─── Map Grid — blocked-entrance auto-fix (Bug B root cause, 2026-09-10) ────
// Companion to entrance-validation.ts. Fix strategy mirrors accessibility-
// pass.ts's own established, real-game-tested repair rule: delete the
// decorative object standing in the way — never the real target (a city's
// entrance is never itself relocated; its position is load-bearing for zone
// layout/roads, unlike a stray tree). Only ever deletes a PURELY decorative
// blocker (`groupOf(...) === 'decorations'` — environments/animals/fxs/test/
// blocks, tile-index.ts's own real categorization, not a new one); a real
// object placed too close (another city, a mine, ...) is a genuine design
// conflict this can't safely resolve unattended, and blocking caused by
// water/an elevation wall has no "object" to delete at all — both land in
// `unresolved` rather than guessing at a relocation.

import type { MapContext, PlacedObject } from '@/types/map-context'
import type { GameCatalog } from '@/lib/catalog/types'
import {computeFootprintTiles, protectedNeighborNodes} from './footprint'
import { groupOf } from './tile-index'
import { findBlockedEntrancePlacements, type BlockedEntrancePlacement } from './entrance-validation'

export interface EntranceAutoFixDeletion {
  /** The decorative object being removed — always type 0 (a footprint
   *  template is what creates the collision in the first place). */
  id: number
  sid: string
  /** The real entrance this deletion unblocks — for the dialog's own
   *  "removed X because it was blocking Y" messaging. */
  unblocks: { sid: string; id: number }
}

export interface EntranceAutoFixResult {
  deletions: EntranceAutoFixDeletion[]
  /** Blocked entrances no purely-decorative deletion could resolve — a real
   *  non-decorative object, water, or an elevation wall is in the way, all
   *  of which need a human decision, not an automatic delete. */
  unresolved: BlockedEntrancePlacement[]
}

type EntranceAutoFixContext = Pick<MapContext, 'sizeX' | 'sizeZ' | 'placedObjects' | 'levelsMap' | 'climbsMap' | 'waterMap'>

export function computeEntranceAutoFix(
  context: EntranceAutoFixContext,
  catalog: GameCatalog | null,
): EntranceAutoFixResult {
  const { sizeX } = context
  const violations = findBlockedEntrancePlacements(context, catalog)
  if (violations.length === 0) return { deletions: [], unresolved: [] }

  const catalogById = new Map((catalog?.mapObjects ?? []).map((o) => [o.id, o]))
  const placedObjects = context.placedObjects as PlacedObject[]

  // Index every type-0 object's own solid (value===1) cells by node, so a
  // violation's blocked entrance node(s) can be traced back to whichever
  // object(s) actually occupy them.
  const solidOwnersByNode = new Map<number, PlacedObject[]>()
  for (const obj of placedObjects) {
    if (obj.type !== 0) continue
    const template = catalogById.get(obj.sid)

    for (const cell of computeFootprintTiles(template, obj.x, obj.z)) {
      if (cell.value !== 1) continue
      const node = cell.z * sizeX + cell.x
      const owners = solidOwnersByNode.get(node)
      if (owners) owners.push(obj)
      else solidOwnersByNode.set(node, [obj])
    }
  }

  const deletions: EntranceAutoFixDeletion[] = []
  const unresolved: BlockedEntrancePlacement[] = []
  const alreadyMarked = new Set<number>()

  for (const violation of violations) {
    const template = catalogById.get(violation.sid)
    const allCells = computeFootprintTiles(template, violation.x, violation.z)
    const protectedNodes = protectedNeighborNodes(allCells, sizeX, context.sizeZ)
    const blockers = new Map<number, PlacedObject>()
    let resolvable = true
    for (const node of protectedNodes) {
      const owners = solidOwnersByNode.get(node)
      if (!owners) continue // this protected tile is not blocked so move on to the next
      for (const owner of owners) {
        if (groupOf(owner, catalog) !== 'decorations') { resolvable = false; break }
        blockers.set(owner.id, owner)
      }
      if (!resolvable) break
    }
    if (!resolvable) { unresolved.push(violation); continue }
    for (const blocker of blockers.values()) {
      if (alreadyMarked.has(blocker.id)) continue
      alreadyMarked.add(blocker.id)
      deletions.push({ id: blocker.id, sid: blocker.sid, unblocks: { sid: violation.sid, id: violation.id } })
    }
  }

  return { deletions, unresolved }
}
