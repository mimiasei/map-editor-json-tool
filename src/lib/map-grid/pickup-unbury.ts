// ─── Moving pickups out from under other objects ─────────────────────────────
// A pickup (random-item, random-res, a real artifact or resource) is a small thing a hero walks onto. When a larger object's solid tiles end up
// on top of it, nobody can step there and it is reported unreachable (seen on Back For Revenge and [HotA] Barren Lands: a random-item under a
// dragon dwelling's body, random-res under portals and an observatory). The overlap fixer moves one side of an overlap, but picks the mover by
// id and gives up when it finds no place; this pass runs on the finished map and always moves the pickup, to the nearest tile that no other
// object covers and a player start can walk to.

import type { MapContainer } from '@/lib/map-write'
import type { GameCatalog } from '@/lib/catalog/types'
import type { PlacedObject } from '@/types/map-context'
import { applyMapEdit } from '@/lib/map-save'
import { extractMapContext } from '@/lib/map-extract'
import { containerToRawBlocks } from '@/store/useMapDocumentStore'
import { computeFootprintTiles } from './footprint'
import { buildBlockedTileSet, NON_BLOCKING_SPAWNER_SIDS } from './passability'
import { accessNodesFor, buildPortalEdges, floodFill, PLAYER_START_SIDS } from './reachability-validation'
import { groupOf } from './tile-index'

/** A pickup moved further than this is no longer where the author put it; beyond it the pickup stays (and is reported unreachable as before). */
const MAX_RADIUS = 12

export interface PickupUnburyResult {
  container: MapContainer
  moved: number
  /** Buried, and no free reachable tile within reach. */
  stuck: number
}

export function unburyPickups(container: MapContainer, catalog: GameCatalog, mayChange: (entityType: number, id: number) => boolean = () => true): PickupUnburyResult {
  const context = extractMapContext(containerToRawBlocks(container))
  const { sizeX, sizeZ, placedObjects } = context
  const catalogById = new Map(catalog.mapObjects.map((o) => [o.id, o]))
  const isPickup = (o: PlacedObject) => {
    if (o.type !== 0) return false
    if (o.sid === 'random-item' || o.sid === 'random-res') return true
    const group = groupOf(o, catalog)
    return group === 'artifacts' || group === 'resources'
  }
  const pickups = placedObjects.filter(isPickup)
  if (pickups.length === 0) return { container, moved: 0, stuck: 0 }

  // Walls the way the reachability check sees them: everything but pickups (a hero removes those by picking them up).
  const others = placedObjects.filter((o) => !isPickup(o))
  const walls = buildBlockedTileSet({ ...context, placedObjects: others }, catalog)
  const seeds = others.filter((o) => o.type === 0 && PLAYER_START_SIDS.has(o.sid)).flatMap((o) => accessNodesFor(o, catalogById, sizeX))
  const reachable = seeds.length > 0 ? floodFill(seeds, walls, sizeX, sizeZ, buildPortalEdges(placedObjects, catalogById, sizeX)) : null
  // Buried: its own tile is covered, or objects close its tile in so nobody can walk there (a sealed island far from anything reachable has no free
  // tile within reach below, so its pickups stay where they are).
  const buried = pickups.filter((p) => computeFootprintTiles(catalogById.get(p.sid), p.x, p.z, p.rotation).some((c) => c.value === 1 && walls.has(c.z * sizeX + c.x))
    || (NON_BLOCKING_SPAWNER_SIDS.has(p.sid) && walls.has(p.node))
    || (reachable !== null && !accessNodesFor(p, catalogById, sizeX).some((n) => reachable.has(n))))
  if (buried.length === 0) return { container, moved: 0, stuck: 0 }

  // Every tile another object covers (solid or entrance): a pickup never lands on one.
  const covered = new Set<number>()
  for (const o of others) {
    if (o.type !== 0) continue
    covered.add(o.node)
    for (const c of computeFootprintTiles(catalogById.get(o.sid), o.x, o.z, o.rotation)) if (c.value >= 1) covered.add(c.z * sizeX + c.x)
  }
  const taken = new Set<number>()
  for (const p of pickups) if (!buried.includes(p)) for (const c of computeFootprintTiles(catalogById.get(p.sid), p.x, p.z, p.rotation)) if (c.value === 1) taken.add(c.z * sizeX + c.x)
  for (const p of pickups) if (NON_BLOCKING_SPAWNER_SIDS.has(p.sid) && !buried.includes(p)) taken.add(p.node)

  let fixed = container
  let moved = 0
  let stuck = 0
  for (const pickup of buried) {
    if (!mayChange(pickup.type, pickup.id)) continue
    const template = catalogById.get(pickup.sid)
    let target: number | null = null
    let targetCells: number[] = []
    for (let radius = 1; radius <= MAX_RADIUS && target === null; radius++) {
      let best = Infinity
      for (let dz = -radius; dz <= radius; dz++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue
          const x = pickup.x + dx
          const z = pickup.z + dz
          if (x < 0 || z < 0 || x >= sizeX || z >= sizeZ) continue
          // A walk-onto placeholder only needs its own tile; its ring of entrance cells is not a body.
          const cells = NON_BLOCKING_SPAWNER_SIDS.has(pickup.sid) ? [] : computeFootprintTiles(template, x, z, pickup.rotation).filter((c) => c.value === 1)
          const nodes = [z * sizeX + x, ...cells.map((c) => c.z * sizeX + c.x)]
          if (cells.some((c) => c.x < 0 || c.z < 0 || c.x >= sizeX || c.z >= sizeZ)) continue
          if (nodes.some((n) => walls.has(n) || covered.has(n) || taken.has(n))) continue
          const access = accessNodesFor({ ...pickup, x, z, node: z * sizeX + x }, catalogById, sizeX)
          if (reachable && !access.some((n) => reachable.has(n))) continue
          const distance = dx * dx + dz * dz
          if (distance < best) { best = distance; target = z * sizeX + x; targetCells = nodes }
        }
      }
    }
    if (target === null) { stuck += 1; continue }
    fixed = applyMapEdit(fixed, { kind: 'moveObject', entityType: 0, entityId: pickup.id, newNode: target }).container
    for (const n of targetCells) taken.add(n)
    moved += 1
  }
  return { container: fixed, moved, stuck }
}
