// ─── RMG quality pass: does the finished map make sense? ──────────────────────
// Runs on the generated container (nothing of it was ever seen by a human, so anything the generator placed may be moved or deleted). Each
// iteration applies, in this order:
//   1. powerful interactables stay away from every start (distance floor by power tier, object-power.ts); a violator is moved to the nearest legal
//      tile beyond the floor, with the guard squads that stood at its entrance, or deleted with them when no tile exists
//   2. more of a tier than the map can carry (per 10K tiles) is thinned, the ones closest to a start first
//   3. village-type objects are pulled in until every start has a few close by (never added, only moved; guarded ones stay where they are)
//   4. unresolved reachability pairs: the less important of the unreachable placement and what blocks it is deleted (a chain that includes a
//      decoration, which may be part of a zone wall, only ever loses the placement)
// then the placement auto-fix runs, because the moves above may have opened a gap. Not run on mirrored maps (a one-sided move breaks the
// symmetry the layout was built for) or game-template maps (the template is authoritative about where its objects go).

import type { MapContainer } from '@/lib/map-write'
import type { CatalogMapObject, GameCatalog } from '@/lib/catalog/types'
import type { PlacedObject } from '@/types/map-context'
import { applyMapEdit, type MapSaveEdit } from '@/lib/map-save'
import { extractMapContext } from '@/lib/map-extract'
import { containerToRawBlocks } from '@/store/useMapDocumentStore'
import { computeFootprintTiles, entranceGroups, isFootprintInBounds } from '@/lib/map-grid/footprint'
import { buildBlockedTileSet } from '@/lib/map-grid/passability'
import { groupOf } from '@/lib/map-grid/tile-index'
import { findNearestValidPosition } from '@/lib/map-grid/relocate'
import { computeReachabilityAutoFix, PLAYER_START_SIDS } from '@/lib/map-grid/reachability-validation'
import { runPlacementAutoFix } from '@/lib/map-grid/auto-fix-pass'
import {
  interactablePower, powerTier, sizeScale, SETTLEMENT_SIDS, SETTLEMENT_PER_START, SETTLEMENT_RADIUS,
  TIER_MIN_START_DISTANCE, TIER_MAX_PER_10K, type PowerTier,
} from './object-power'

export interface QualityPassResult {
  container: MapContainer
  /** Powerful objects moved away from a start (guards included). */
  relocated: number
  /** Objects deleted: no legal tile, over the tier cap, or the less important side of a reachability pair. */
  removed: number
  /** Village-type objects pulled in next to a start. */
  pulled: number
}

/** Guard squads and objects count as "at an entrance" within this Chebyshev distance of an entrance tile. */
const GUARD_REACH = 1
/** A village object is never put closer to a start than this, so it does not crowd the city. */
const SETTLEMENT_MIN_DISTANCE = 5
/** Importance of things the map is built around: never deleted to repair something else. */
const PROTECTED = Number.POSITIVE_INFINITY
/** Same-group objects within this radius make one more of them expendable. */
const CROWD_RADIUS = 8
const CROWD_COUNT = 4

const isProtectedSid = (sid: string): boolean =>
  PLAYER_START_SIDS.has(sid) || sid.startsWith('mine_') || sid.startsWith('barracks_') || sid.startsWith('random-city') || sid.endsWith('_city') || sid === 'random-hire'

interface World {
  sizeX: number
  sizeZ: number
  catalog: GameCatalog
  templates: Map<string, CatalogMapObject>
  /** Live copies, updated as moves are queued so later decisions see them. */
  objects: PlacedObject[]
  squads: PlacedObject[]
  starts: PlacedObject[]
  blocked: Set<number>
  /** Every footprint cell of every object, and every squad tile. */
  occupied: Set<number>
  roads: number[]
  riverNodes: Map<number, unknown>
  edits: MapSaveEdit[]
}

const dist = (a: { x: number; z: number }, b: { x: number; z: number }): number => Math.hypot(a.x - b.x, a.z - b.z)
const nearestStartDistance = (w: World, p: { x: number; z: number }): number => w.starts.reduce((m, s) => Math.min(m, dist(s, p)), Number.POSITIVE_INFINITY)

function footprintOf(w: World, o: { sid: string; x: number; z: number; rotation?: number }): { z: number; x: number; value: number }[] {
  return computeFootprintTiles(w.templates.get(o.sid), o.x, o.z, o.rotation)
}

function buildWorld(container: MapContainer, catalog: GameCatalog): World {
  const ctx = extractMapContext(containerToRawBlocks(container))
  const templates = new Map(catalog.mapObjects.map((o) => [o.id, o]))
  const placed = ctx.placedObjects as PlacedObject[]
  const objects = placed.filter((o) => o.type === 0).map((o) => ({ ...o }))
  const squads = placed.filter((o) => o.type === 2).map((o) => ({ ...o }))
  const world: World = {
    sizeX: ctx.sizeX, sizeZ: ctx.sizeZ, catalog, templates, objects, squads,
    starts: objects.filter((o) => o.sid === 'city-spawner'),
    blocked: buildBlockedTileSet(ctx, catalog),
    occupied: new Set(), roads: ctx.roadsMap, riverNodes: ctx.riverNodes, edits: [],
  }
  for (const o of objects) for (const c of footprintOf(world, o)) world.occupied.add(c.z * ctx.sizeX + c.x)
  for (const s of squads) world.occupied.add(s.node)
  return world
}

/** Squads standing at one of the object's entrance tiles: its guards. */
function guardsOf(w: World, o: PlacedObject): PlacedObject[] {
  const entrances = entranceGroups(footprintOf(w, o), w.sizeX, w.sizeZ).map((g) => g.entranceNode)
  if (entrances.length === 0) return []
  return w.squads.filter((s) => entrances.some((n) => Math.max(Math.abs((n % w.sizeX) - s.x), Math.abs(Math.floor(n / w.sizeX) - s.z)) <= GUARD_REACH))
}

function deleteWithGuards(w: World, o: PlacedObject): void {
  for (const g of guardsOf(w, o)) {
    w.edits.push({ kind: 'deleteObject', entityType: 2, entityId: g.id })
    w.occupied.delete(g.node)
    w.squads.splice(w.squads.indexOf(g), 1)
  }
  w.edits.push({ kind: 'deleteObject', entityType: 0, entityId: o.id })
  for (const c of footprintOf(w, o)) w.occupied.delete(c.z * w.sizeX + c.x)
  w.objects.splice(w.objects.indexOf(o), 1)
}

/** Whether `o` (with the squads that stand guard) can stand at (x, z): footprint on free dry tiles off roads and rivers, an open entrance, guards on free tiles. */
function canStandAt(w: World, o: PlacedObject, guards: PlacedObject[], x: number, z: number): boolean {
  const cells = computeFootprintTiles(w.templates.get(o.sid), x, z, o.rotation)
  if (!isFootprintInBounds(cells, w.sizeX, w.sizeZ)) return false
  // What the object and its guards stand on now is theirs to reuse.
  const mine = new Set([...footprintOf(w, o).map((c) => c.z * w.sizeX + c.x), ...guards.map((g) => g.node)])
  const open = (n: number): boolean => !w.blocked.has(n) && (!w.occupied.has(n) || mine.has(n))
  for (const c of cells) {
    const n = c.z * w.sizeX + c.x
    if ((w.roads[n] ?? 0) > 0 || w.riverNodes.has(n)) return false
    if (w.occupied.has(n) && !mine.has(n)) return false
    if (c.value === 1 && w.blocked.has(n) && !mine.has(n)) return false
  }
  const groups = entranceGroups(cells, w.sizeX, w.sizeZ)
  if (groups.length > 0 && !groups.some((g) => [g.entranceNode, ...g.protectedNodes].every(open))) return false
  const footprint = new Set(cells.map((c) => c.z * w.sizeX + c.x))
  for (const g of guards) {
    const gx = g.x + (x - o.x)
    const gz = g.z + (z - o.z)
    if (gx < 0 || gx >= w.sizeX || gz < 0 || gz >= w.sizeZ) return false
    const n = gz * w.sizeX + gx
    if (!open(n) || (w.roads[n] ?? 0) > 0 || footprint.has(n)) return false
  }
  return true
}

function moveWithGuards(w: World, o: PlacedObject, guards: PlacedObject[], x: number, z: number): void {
  const dx = x - o.x
  const dz = z - o.z
  for (const c of footprintOf(w, o)) w.occupied.delete(c.z * w.sizeX + c.x)
  for (const g of guards) {
    w.occupied.delete(g.node)
    g.x += dx
    g.z += dz
    g.node = g.z * w.sizeX + g.x
    w.occupied.add(g.node)
    w.edits.push({ kind: 'moveObject', entityType: 2, entityId: g.id, newNode: g.node })
  }
  o.x = x
  o.z = z
  o.node = z * w.sizeX + x
  for (const c of footprintOf(w, o)) w.occupied.add(c.z * w.sizeX + c.x)
  w.edits.push({ kind: 'moveObject', entityType: 0, entityId: o.id, newNode: o.node })
}

/** Ranked interactables: priced, not village-type. */
function rankedObjects(w: World): { obj: PlacedObject; tier: PowerTier }[] {
  const out: { obj: PlacedObject; tier: PowerTier }[] = []
  for (const obj of w.objects) {
    if (SETTLEMENT_SIDS.has(obj.sid)) continue
    const power = interactablePower(w.catalog, obj.sid)
    if (power !== undefined) out.push({ obj, tier: powerTier(power) })
  }
  return out
}

/** 1. Powerful objects away from the starts. */
function keepPowerAwayFromStarts(w: World): { relocated: number; removed: number } {
  const scale = sizeScale(w.sizeX, w.sizeZ)
  const result = { relocated: 0, removed: 0 }
  const violators = rankedObjects(w)
    .map((r) => ({ ...r, floor: TIER_MIN_START_DISTANCE[r.tier] * scale }))
    .filter((r) => r.floor > 0 && nearestStartDistance(w, r.obj) < r.floor)
    .sort((a, b) => (b.floor - nearestStartDistance(w, b.obj)) - (a.floor - nearestStartDistance(w, a.obj)))
  for (const { obj, floor } of violators) {
    const guards = guardsOf(w, obj)
    const spot = findNearestValidPosition(obj.x, obj.z, w.sizeX, w.sizeZ, (x, z) => nearestStartDistance(w, { x, z }) >= floor && canStandAt(w, obj, guards, x, z))
    if (spot) {
      moveWithGuards(w, obj, guards, spot.x, spot.z)
      result.relocated++
    } else {
      deleteWithGuards(w, obj)
      result.removed++
    }
  }
  return result
}

/** 2. Thin a tier that exceeds what this map's area carries; the ones nearest a start go first. */
function thinOverfullTiers(w: World): number {
  let removed = 0
  const per10k = (w.sizeX * w.sizeZ) / 10000
  for (const tier of ['veryStrong', 'strong'] as const) {
    const cap = Math.round((TIER_MAX_PER_10K[tier] ?? Number.POSITIVE_INFINITY) * per10k)
    const ofTier = rankedObjects(w).filter((r) => r.tier === tier).sort((a, b) => nearestStartDistance(w, a.obj) - nearestStartDistance(w, b.obj))
    for (let i = 0; i < ofTier.length - cap; i++) {
      deleteWithGuards(w, ofTier[i].obj)
      removed++
    }
  }
  return removed
}

/** 3. Each start gets village-type objects close by; spares from elsewhere are moved in. Guarded ones and ones already near a start stay. */
function pullSettlementsToStarts(w: World, rng: () => number): number {
  const scale = sizeScale(w.sizeX, w.sizeZ)
  const radius = SETTLEMENT_RADIUS * scale
  const minDistance = SETTLEMENT_MIN_DISTANCE * scale
  let pulled = 0
  for (const start of w.starts) {
    const village = w.objects.filter((o) => SETTLEMENT_SIDS.has(o.sid))
    const near = village.filter((o) => dist(start, o) <= radius).length
    const spares = village
      .filter((o) => nearestStartDistance(w, o) > radius * 1.5 && guardsOf(w, o).length === 0)
      .sort((a, b) => dist(start, a) - dist(start, b))
    for (let need = SETTLEMENT_PER_START - near; need > 0 && spares.length > 0; need--) {
      const obj = spares.shift() as PlacedObject
      const angle = rng() * Math.PI * 2
      const range = minDistance + rng() * (radius - minDistance)
      const spot = findNearestValidPosition(
        Math.round(start.x + Math.cos(angle) * range), Math.round(start.z + Math.sin(angle) * range), w.sizeX, w.sizeZ,
        (x, z) => dist(start, { x, z }) >= minDistance && dist(start, { x, z }) <= radius && canStandAt(w, obj, [], x, z),
      )
      if (!spot) continue
      moveWithGuards(w, obj, [], spot.x, spot.z)
      pulled++
    }
  }
  return pulled
}

/** How much the map would miss this placement. Protected things (starts, cities, mines, dwellings) are never traded away. */
function importanceOf(w: World, o: PlacedObject): number {
  if (o.type === 0 && isProtectedSid(o.sid)) return PROTECTED
  const power = o.type === 0 ? interactablePower(w.catalog, o.sid) : undefined
  if (power !== undefined) return power
  const group = groupOf(o, w.catalog)
  if (group === 'decorations') return 1
  const base = group === 'units' ? 400 : group === 'interactables' ? 2000 : 300
  // One of many alike nearby (items, resources, squads in one area) is the first to go.
  const alike = [...w.objects, ...w.squads].filter((p) => p !== o && groupOf(p, w.catalog) === group && dist(p, o) <= CROWD_RADIUS).length
  return alike > CROWD_COUNT ? base * 0.5 : base
}

/** 4. A placement the auto-fix could not reach and cannot clear: delete whichever of it and its blockers matters less. */
function repairByImportance(container: MapContainer, catalog: GameCatalog): { container: MapContainer; removed: number } {
  const w = buildWorld(container, catalog)
  const ctx = extractMapContext(containerToRawBlocks(container))
  const { unresolved } = computeReachabilityAutoFix(ctx, catalog)
  let removed = 0
  const gone = new Set<string>()
  for (const issue of unresolved) {
    if (issue.blockedBy.length === 0) continue
    const target = (issue.entityType === 0 ? w.objects : w.squads).find((p) => p.id === issue.id)
    const blockers = issue.blockedBy.map((b) => w.objects.find((p) => p.id === b.id)).filter((p): p is PlacedObject => !!p)
    if (!target || blockers.length === 0 || gone.has(`${issue.entityType}:${issue.id}`)) continue
    const targetWeight = importanceOf(w, target)
    const blockerWeight = Math.max(...blockers.map((b) => importanceOf(w, b)))
    if (targetWeight < blockerWeight) {
      if (target.type === 0) deleteWithGuards(w, target)
      else { w.edits.push({ kind: 'deleteObject', entityType: 2, entityId: target.id }); w.squads.splice(w.squads.indexOf(target), 1) }
      gone.add(`${issue.entityType}:${issue.id}`)
      removed++
    } else if (blockerWeight < targetWeight && !blockers.some((b) => groupOf(b, catalog) === 'decorations')) {
      for (const b of blockers) { if (!w.objects.includes(b)) continue; deleteWithGuards(w, b); gone.add(`0:${b.id}`); removed++ }
    }
  }
  return { container: applyEdits(container, w.edits), removed }
}

function applyEdits(container: MapContainer, edits: MapSaveEdit[]): MapContainer {
  let out = container
  for (const edit of edits) out = applyMapEdit(out, edit).container
  return out
}

/** `iterations` rounds of the rules above, each followed by the placement auto-fix; stops early when a round changes nothing. */
export function runQualityPass(container: MapContainer, catalog: GameCatalog, options: { iterations: number; rng: () => number }): QualityPassResult {
  const total = { relocated: 0, removed: 0, pulled: 0 }
  let current = container
  for (let i = 0; i < options.iterations; i++) {
    const w = buildWorld(current, catalog)
    if (w.starts.length === 0) break
    const away = keepPowerAwayFromStarts(w)
    const thinned = thinOverfullTiers(w)
    const pulled = pullSettlementsToStarts(w, options.rng)
    current = applyEdits(current, w.edits)
    const repaired = repairByImportance(current, catalog)
    current = repaired.container
    const changed = away.relocated + away.removed + thinned + pulled + repaired.removed
    total.relocated += away.relocated
    total.removed += away.removed + thinned + repaired.removed
    total.pulled += pulled
    if (changed === 0) break
    current = runPlacementAutoFix(current, catalog, { guaranteeReachability: true }).fixed
  }
  return { container: current, ...total }
}
