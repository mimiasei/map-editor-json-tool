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
import {computeFootprintTiles, entranceGroups, isFootprintInBounds} from './footprint'
import { groupOf } from './tile-index'
import { buildBlockedTileSet } from './passability'
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

export interface EntranceAutoFixRelocation {
  id: number
  sid: string
  fromNode: number
  toNode: number
}

export interface EntranceAutoFixResult {
  deletions: EntranceAutoFixDeletion[]
  /** The blocked object itself moved to a nearby valid tile — used when no
   *  entrance group could be opened by deleting decorations alone. Never
   *  used for `city-spawner`/`hero-spawner` (their position stays load-
   *  bearing, same rule `deletions` already follows). */
  relocations: EntranceAutoFixRelocation[]
  /** Blocked entrances nothing above could resolve — always a
   *  `city-spawner`/`hero-spawner` with a real (non-decorative) blocker and
   *  no valid relocation target, since every other case is now
   *  auto-resolved one way or another. */
  unresolved: BlockedEntrancePlacement[]
}

const PLAYER_START_SIDS = new Set(['city-spawner', 'hero-spawner'])

function* ringOffsets(cx: number, cz: number, radius: number): Generator<[number, number]> {
  for (let x = cx - radius; x <= cx + radius; x++) {
    yield [x, cz - radius]
    yield [x, cz + radius]
  }
  for (let z = cz - radius + 1; z <= cz + radius - 1; z++) {
    yield [cx - radius, z]
    yield [cx + radius, z]
  }
}

type EntranceAutoFixContext = Pick<MapContext, 'sizeX' | 'sizeZ' | 'placedObjects' | 'levelsMap' | 'climbsMap' | 'waterMap'>

export function computeEntranceAutoFix(
  context: EntranceAutoFixContext,
  catalog: GameCatalog | null,
): EntranceAutoFixResult {
  const { sizeX, sizeZ } = context
  const violations = findBlockedEntrancePlacements(context, catalog)
  if (violations.length === 0) return { deletions: [], relocations: [], unresolved: [] }

  const catalogById = new Map((catalog?.mapObjects ?? []).map((o) => [o.id, o]))
  const placedObjects = context.placedObjects as PlacedObject[]
  // Real blocked-tile membership (objects + water + elevation walls) — needed
  // because `solidOwnersByNode` below only ever indexes OBJECT-caused blocks,
  // so a node blocked by water/a wall has no entry there at all. Checking
  // `blocked.has(node)` first (before falling back to `solidOwnersByNode`)
  // is what tells the two cases apart.
  const blocked = buildBlockedTileSet(context, catalog)

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
  const relocations: EntranceAutoFixRelocation[] = []
  const unresolved: BlockedEntrancePlacement[] = []
  const alreadyMarked = new Set<number>()

  for (const violation of violations) {
    const template = catalogById.get(violation.sid)
    const allCells = computeFootprintTiles(template, violation.x, violation.z)
    const groups = entranceGroups(allCells, sizeX, sizeZ)

    // Pick whichever entrance group can be opened with the FEWEST decorative
    // deletions — a violation is only flagged when EVERY group is blocked,
    // so opening just one group (not every blocker on every group) is
    // enough to make the object valid again.
    let bestGroupBlockers: PlacedObject[] | null = null
    for (const group of groups) {
      const blockers = new Map<number, PlacedObject>()
      let clearable = true
      for (const node of group.protectedNodes) {
        if (!blocked.has(node)) continue
        const owners = solidOwnersByNode.get(node)
        if (!owners || owners.length === 0) { clearable = false; break } // water/wall — no object to delete
        for (const owner of owners) {
          if (groupOf(owner, catalog) !== 'decorations') { clearable = false; break }
          blockers.set(owner.id, owner)
        }
        if (!clearable) break
      }
      if (!clearable) continue
      const candidate = [...blockers.values()]
      if (bestGroupBlockers === null || candidate.length < bestGroupBlockers.length) bestGroupBlockers = candidate
    }

    if (bestGroupBlockers) {
      for (const blocker of bestGroupBlockers) {
        if (alreadyMarked.has(blocker.id)) continue
        alreadyMarked.add(blocker.id)
        deletions.push({ id: blocker.id, sid: blocker.sid, unblocks: { sid: violation.sid, id: violation.id } })
      }
      continue
    }

    // No group could be opened by deleting decorations alone — a real
    // object is in the way on every side. A player-start spawner's position
    // is load-bearing (zone layout/roads) and is never relocated, matching
    // the existing rule; everything else gets moved to a nearby valid tile
    // instead of being left permanently blocked.
    if (PLAYER_START_SIDS.has(violation.sid)) { unresolved.push(violation); continue }

    const relocated = findRelocationTarget(violation, template, context, catalog)
    if (relocated) {
      relocations.push({ id: violation.id, sid: violation.sid, fromNode: violation.node, toNode: relocated })
    } else {
      unresolved.push(violation)
    }
  }

  return { deletions, relocations, unresolved }
}

/** Nearest tile (expanding ring search, same shape as bounds-autofix.ts's
 *  own) where relocating this object would leave at least one entrance
 *  group fully open — its own current footprint is excluded from the
 *  collision set first so it never blocks itself, same fix bounds-autofix.ts
 *  needed for the same reason. No reachability/flood-fill check here
 *  (unlike bounds-autofix.ts) — this only needs "not blocked," not "on the
 *  same connected landmass as a player start." */
function findRelocationTarget(
  violation: BlockedEntrancePlacement,
  template: ReturnType<Map<string, import('@/lib/catalog/types').CatalogMapObject>['get']>,
  context: EntranceAutoFixContext,
  catalog: GameCatalog | null,
): number | null {
  const { sizeX, sizeZ } = context
  const blocked = buildBlockedTileSet(context, catalog)
  for (const cell of computeFootprintTiles(template, violation.x, violation.z)) {
    if (cell.x < 0 || cell.x >= sizeX || cell.z < 0 || cell.z >= sizeZ) continue
    blocked.delete(cell.z * sizeX + cell.x)
  }

  const isValidCandidate = (x: number, z: number): boolean => {
    const cells = computeFootprintTiles(template, x, z)
    if (!isFootprintInBounds(cells, sizeX, sizeZ)) return false
    for (const cell of cells) {
      if (cell.value === 1 && blocked.has(cell.z * sizeX + cell.x)) return false
    }
    return entranceGroups(cells, sizeX, sizeZ).some((g) => ![...g.protectedNodes].some((n) => blocked.has(n)))
  }

  if (isValidCandidate(violation.x, violation.z)) return violation.z * sizeX + violation.x
  const maxRadius = Math.max(sizeX, sizeZ)
  for (let radius = 1; radius <= maxRadius; radius++) {
    for (const [x, z] of ringOffsets(violation.x, violation.z, radius)) {
      if (x < 0 || x >= sizeX || z < 0 || z >= sizeZ) continue
      if (isValidCandidate(x, z)) return z * sizeX + x
    }
  }
  return null
}
