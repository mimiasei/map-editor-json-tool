// ─── Map Grid — blocked-entrance auto-fix (Bug B root cause, 2026-09-10) ────
// Companion to entrance-validation.ts. Fix strategy mirrors accessibility-
// pass.ts's own established, real-game-tested repair rule: clear the object
// standing in the way — never the real target (a city's entrance is never
// itself relocated; its position is load-bearing for zone layout/roads,
// unlike a stray tree or a loose artifact). A blocker is handled by kind
// (tile-index.ts's own real `groupOf` categorization, not a new one): a pure
// decoration (`decorations`) is deleted outright; a pickable ground item
// (`artifacts`/`resources` — real loot, but never load-bearing the way a
// city/mine/dwelling is) is moved to a nearby free tile first and only
// deleted if no such tile exists. Confirmed needed against a real H3 import:
// Ville'de'Porte.h3m's city-spawner (id 1901) has a dead tree AND a loose
// artifact overlapping its entrance tile — deleting only decorations left
// the artifact still blocking it. Anything else (another real object placed
// too close — another city, a mine, ...) is a genuine design conflict this
// can't safely resolve unattended; blocking caused by water/an elevation
// wall has no "object" to clear at all — both land in `unresolved` rather
// than guessing at a fix.
//
// The blockable-node set for a group is its entrance cell (`entranceNode`)
// PLUS its approach ring (`protectedNodes`) — not just the ring. A blocker
// can sit directly on the entrance cell itself (Ville'de'Porte.h3m's
// tree_dead_3, found 2026-09-11 sitting exactly on city-spawner 1901's own
// entrance tile with the whole approach ring completely open) — matching
// entrance-validation.ts's own fix for the same gap.

import type { MapContext, PlacedObject } from '@/types/map-context'
import type { GameCatalog } from '@/lib/catalog/types'
import {computeFootprintTiles, entranceGroups, isFootprintInBounds} from './footprint'
import { groupOf } from './tile-index'
import { buildBlockedTileSet } from './passability'
import { findBlockedEntrancePlacements, type BlockedEntrancePlacement } from './entrance-validation'

export interface EntranceAutoFixDeletion {
  /** The object being removed — always type 0 (a footprint template is what
   *  creates the collision in the first place). Usually a pure decoration;
   *  can also be a pickable artifact/resource that had nowhere valid to be
   *  moved to (see EntranceAutoFixRelocation — a move is always tried
   *  first for those two groups). */
  id: number
  sid: string
  /** The real entrance this deletion unblocks — for the dialog's own
   *  "removed X because it was blocking Y" messaging. */
  unblocks: { sid: string; id: number }
}

export interface EntranceAutoFixRelocation {
  /** Either the violating object itself (moved because deleting/moving its
   *  blockers alone couldn't open any entrance group), or a pickable
   *  artifact/resource blocker moved out of someone else's entrance. */
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
  // Solid-cell nodes claimed by a relocation decided EARLIER in this same
  // pass — each relocation target below is validated against a static
  // snapshot (`blocked`, built once up front), so without this two different
  // violations processed in the same call could independently pick the same
  // destination tile. Confirmed via a real H3 import (Ville'de'Porte.h3m,
  // 2026-09-11): portal_2 (id 316) and portal_3 (id 467) both got relocated
  // onto the exact same node — each looked valid in isolation against the
  // pre-pass snapshot, but the map's own independent post-fix revalidation
  // caught the resulting overlap. Passed into findNearbyFreeTile/
  // findRelocationTarget so every later candidate search also avoids tiles
  // already spoken for.
  const claimedDestinations = new Set<number>()

  for (const violation of violations) {
    const template = catalogById.get(violation.sid)
    const allCells = computeFootprintTiles(template, violation.x, violation.z)
    const groups = entranceGroups(allCells, sizeX, sizeZ)

    // Pick whichever entrance group can be opened with the FEWEST blockers —
    // a violation is only flagged when EVERY group is blocked, so opening
    // just one group (not every blocker on every group) is enough to make
    // the object valid again. A group only counts as clearable when every
    // blocking owner is a decoration or a pickable item (artifacts/
    // resources) — anything else (another real placed object, or a
    // water/wall cell with no owner at all) can't be safely cleared here.
    let bestGroupBlockers: PlacedObject[] | null = null
    for (const group of groups) {
      const blockers = new Map<number, PlacedObject>()
      let clearable = true
      // The entrance cell itself (group.entranceNode) needs the same check as
      // the approach ring (protectedNodes) — another object's solid footprint
      // can land directly on it (Ville'de'Porte.h3m's tree_dead_3 on city-
      // spawner 1901's own entrance cell), which the approach-ring check alone
      // never catches since that tile isn't part of protectedNodes at all.
      for (const node of [group.entranceNode, ...group.protectedNodes]) {
        if (!blocked.has(node)) continue
        const owners = solidOwnersByNode.get(node)
        if (!owners || owners.length === 0) { clearable = false; break } // water/wall — no object to delete
        for (const owner of owners) {
          const ownerGroup = groupOf(owner, catalog)
          if (ownerGroup !== 'decorations' && ownerGroup !== 'artifacts' && ownerGroup !== 'resources') { clearable = false; break }
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
        const blockerGroup = groupOf(blocker, catalog)
        if (blockerGroup === 'artifacts' || blockerGroup === 'resources') {
          const blockerTemplate = catalogById.get(blocker.sid)
          const target = findNearbyFreeTile(blocker, blockerTemplate, context, catalog, claimedDestinations)
          if (target !== null) {
            claimNode(target, blockerTemplate, sizeX, claimedDestinations)
            relocations.push({ id: blocker.id, sid: blocker.sid, fromNode: blocker.node, toNode: target })
            continue
          }
        }
        deletions.push({ id: blocker.id, sid: blocker.sid, unblocks: { sid: violation.sid, id: violation.id } })
      }
      continue
    }

    // No group could be opened by clearing blockers alone — a real
    // object is in the way on every side. A player-start spawner's position
    // is load-bearing (zone layout/roads) and is never relocated, matching
    // the existing rule; everything else gets moved to a nearby valid tile
    // instead of being left permanently blocked.
    if (PLAYER_START_SIDS.has(violation.sid)) { unresolved.push(violation); continue }

    const relocated = findRelocationTarget(violation, template, context, catalog, claimedDestinations)
    if (relocated) {
      claimNode(relocated, template, sizeX, claimedDestinations)
      relocations.push({ id: violation.id, sid: violation.sid, fromNode: violation.node, toNode: relocated })
    } else {
      unresolved.push(violation)
    }
  }

  return { deletions, relocations, unresolved }
}

/** Marks a relocation destination's own SOLID cells as claimed, so a later
 *  violation's search in the same pass won't pick the same tile — see
 *  `claimedDestinations`'s doc comment above. */
function claimNode(
  node: number,
  template: ReturnType<Map<string, import('@/lib/catalog/types').CatalogMapObject>['get']>,
  sizeX: number,
  claimedDestinations: Set<number>,
): void {
  const x = node % sizeX
  const z = Math.floor(node / sizeX)
  for (const cell of computeFootprintTiles(template, x, z)) {
    if (cell.value === 1) claimedDestinations.add(cell.z * sizeX + cell.x)
  }
}

/** Nearest free tile (expanding ring search) for relocating a pickable
 *  blocker (artifact/resource) out of another object's entrance. Unlike
 *  findRelocationTarget below, this never checks the mover's OWN entrance
 *  groups — a ground pickup is frequently a single fully-solid cell with no
 *  "2" interaction ring at all, which would make that check always fail —
 *  it only needs a spot where the mover's own footprint isn't itself
 *  blocked. Always searches outward from radius 1 (never returns the
 *  mover's current tile — that's the one place we already know is blocking
 *  something).
 *
 *  The blocked set is built with the mover's OWN placement excluded from
 *  `placedObjects` entirely (not by deleting its footprint's nodes from an
 *  already-built set) — a real H3 import (Ville'de'Porte.h3m's 4 portals,
 *  found 2026-09-11) showed why the naive delete is wrong: a template's
 *  non-solid (`0`/`2`) footprint cells routinely spatially coincide with a
 *  completely different, unrelated object's solid cell (e.g. a portal's own
 *  empty padding cell landing on a tree's trunk tile) — blindly deleting
 *  every node the mover's footprint touches erases that unrelated object's
 *  real block too, so a candidate right next to a real obstacle could pass
 *  as "valid" here yet still fail the map's own independent post-fix
 *  revalidation. */
function findNearbyFreeTile(
  obj: PlacedObject,
  template: ReturnType<Map<string, import('@/lib/catalog/types').CatalogMapObject>['get']>,
  context: EntranceAutoFixContext,
  catalog: GameCatalog | null,
  claimedDestinations: Set<number>,
): number | null {
  const { sizeX, sizeZ } = context
  const blocked = buildBlockedTileSet(
    { ...context, placedObjects: (context.placedObjects as PlacedObject[]).filter((o) => !(o.type === 0 && o.id === obj.id)) },
    catalog,
  )

  const isValidCandidate = (x: number, z: number): boolean => {
    const cells = computeFootprintTiles(template, x, z)
    if (!isFootprintInBounds(cells, sizeX, sizeZ)) return false
    return cells.every((cell) => cell.value !== 1 || (!blocked.has(cell.z * sizeX + cell.x) && !claimedDestinations.has(cell.z * sizeX + cell.x)))
  }

  const maxRadius = Math.max(sizeX, sizeZ)
  for (let radius = 1; radius <= maxRadius; radius++) {
    for (const [x, z] of ringOffsets(obj.x, obj.z, radius)) {
      if (x < 0 || x >= sizeX || z < 0 || z >= sizeZ) continue
      if (isValidCandidate(x, z)) return z * sizeX + x
    }
  }
  return null
}

/** Nearest tile (expanding ring search, same shape as bounds-autofix.ts's
 *  own) where relocating this object would leave at least one entrance
 *  group fully open — its own current footprint is excluded from the
 *  collision set first so it never blocks itself, same fix bounds-autofix.ts
 *  needed for the same reason. No reachability/flood-fill check here
 *  (unlike bounds-autofix.ts) — this only needs "not blocked," not "on the
 *  same connected landmass as a player start."
 *
 *  Same exclude-by-filtering-placedObjects fix as `findNearbyFreeTile`
 *  above, for the same reason — see its doc comment. Confirmed needed here
 *  too: Ville'de'Porte.h3m's 4 blocked portals (all `portal_1`/`portal_2`/
 *  `portal_3`, 2x2 templates with a non-solid padding cell alongside their
 *  solid+entrance cells) each got "relocated" to a candidate whose
 *  entrance/approach ring was only clear because the old delete-by-node
 *  logic wiped out a real neighboring tree/city/portal's genuine block that
 *  happened to spatially coincide with one of the mover's own non-solid
 *  cells — passing this function's own check yet still showing up as
 *  blocked in the map's independent post-fix revalidation. */
function findRelocationTarget(
  violation: BlockedEntrancePlacement,
  template: ReturnType<Map<string, import('@/lib/catalog/types').CatalogMapObject>['get']>,
  context: EntranceAutoFixContext,
  catalog: GameCatalog | null,
  claimedDestinations: Set<number>,
): number | null {
  const { sizeX, sizeZ } = context
  const blocked = buildBlockedTileSet(
    { ...context, placedObjects: (context.placedObjects as PlacedObject[]).filter((o) => !(o.type === 0 && o.id === violation.id)) },
    catalog,
  )
  const isBlocked = (n: number) => blocked.has(n) || claimedDestinations.has(n)

  const isValidCandidate = (x: number, z: number): boolean => {
    const cells = computeFootprintTiles(template, x, z)
    if (!isFootprintInBounds(cells, sizeX, sizeZ)) return false
    for (const cell of cells) {
      if (cell.value === 1 && isBlocked(cell.z * sizeX + cell.x)) return false
    }
    return entranceGroups(cells, sizeX, sizeZ).some((g) => !isBlocked(g.entranceNode) && ![...g.protectedNodes].some((n) => isBlocked(n)))
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
