// ─── Keeping encounters off interactive objects ──────────────────────────────
// H3 lets a monster stand on an object's own tile (a guard on a dwelling's visit tile). In OE an encounter on an interactable's tile leaves the
// object with a squad on top of it (Back For Revenge: 12 of 20 squads sat on a dwelling or portal tile after the import). So, once everything
// else has settled, an encounter (a squad, or a random-squad placeholder) standing on any footprint tile of an interactable moves to the nearest
// tile that is free of every object's footprint, walkable and reachable from a player start; the nearest such tile is normally the one in front.

import type { MapContainer } from '@/lib/map-write'
import type { GameCatalog } from '@/lib/catalog/types'
import { applyMapEdit } from '@/lib/map-save'
import { extractMapContext } from '@/lib/map-extract'
import { containerToRawBlocks } from '@/store/useMapDocumentStore'
import { computeFootprintTiles } from './footprint'
import { buildBlockedTileSet } from './passability'
import { accessNodesFor, buildPortalEdges, floodFill, PLAYER_START_SIDS } from './reachability-validation'
import { groupOf } from './tile-index'

/** Looking further than this is not "next to the object"; the encounter then stays where it is. */
const MAX_RADIUS = 6

export interface EncounterSeparationResult {
  container: MapContainer
  moved: number
  /** On an interactable's tile with no free tile within reach. */
  stuck: number
}

export function separateEncountersFromInteractables(container: MapContainer, catalog: GameCatalog): EncounterSeparationResult {
  const context = extractMapContext(containerToRawBlocks(container))
  const { sizeX, sizeZ, placedObjects } = context
  const catalogById = new Map(catalog.mapObjects.map((o) => [o.id, o]))
  const isEncounter = (o: { type: number; sid: string }) => o.type === 2 || (o.type === 0 && o.sid === 'random-squad')

  const interactableTiles = new Set<number>()
  const footprintTiles = new Set<number>()
  for (const o of placedObjects) {
    if (o.type !== 0 || isEncounter(o)) continue
    const tiles = [o.node]
    for (const c of computeFootprintTiles(catalogById.get(o.sid), o.x, o.z, o.rotation)) if (c.value >= 1) tiles.push(c.z * sizeX + c.x)
    for (const n of tiles) {
      footprintTiles.add(n)
      if (groupOf(o, catalog) === 'interactables') interactableTiles.add(n)
    }
  }
  const encounters = placedObjects.filter(isEncounter)
  const onInteractable = encounters.filter((e) => interactableTiles.has(e.node))
  if (onInteractable.length === 0) return { container, moved: 0, stuck: 0 }

  const blocked = buildBlockedTileSet(context, catalog)
  const seeds = placedObjects.filter((o) => o.type === 0 && PLAYER_START_SIDS.has(o.sid)).flatMap((o) => accessNodesFor(o, catalogById, sizeX))
  const reachable = seeds.length > 0 ? floodFill(seeds, blocked, sizeX, sizeZ, buildPortalEdges(placedObjects, catalogById, sizeX)) : null
  const taken = new Set(encounters.map((e) => e.node))

  let fixed = container
  let moved = 0
  let stuck = 0
  for (const enc of onInteractable) {
    let target: number | null = null
    for (let radius = 1; radius <= MAX_RADIUS && target === null; radius++) {
      let bestDistance = Infinity
      for (let dz = -radius; dz <= radius; dz++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue
          const x = enc.x + dx
          const z = enc.z + dz
          if (x < 0 || z < 0 || x >= sizeX || z >= sizeZ) continue
          const n = z * sizeX + x
          if (blocked.has(n) || footprintTiles.has(n) || taken.has(n) || (reachable && !reachable.has(n))) continue
          const distance = dx * dx + dz * dz
          if (distance < bestDistance) { bestDistance = distance; target = n }
        }
      }
    }
    if (target === null) { stuck += 1; continue }
    fixed = applyMapEdit(fixed, { kind: 'moveObject', entityType: enc.type as 0 | 2, entityId: enc.id, newNode: target }).container
    taken.delete(enc.node)
    taken.add(target)
    moved += 1
  }
  return { container: fixed, moved, stuck }
}
