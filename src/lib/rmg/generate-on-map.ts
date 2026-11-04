// ─── Random map generation on top of a map somebody already started ──────────
// Pure: takes the open map's container, returns a new container with the chosen layers added. Existing content is never touched:
// the placers only get free tiles (existing footprints, water, elevation walls and anchors are seeded into the collision state),
// and nothing is moved or deleted. Zones come from the user's own biome regions (zones-from-terrain.ts), not from a zone graph.

import type { GameCatalog, CatalogMapObject } from '@/lib/catalog/types'
import { extractMapContext } from '@/lib/map-extract'
import { buildBlockedTileSet } from '@/lib/map-grid/passability'
import { isTreeDecoration } from '@/lib/map-grid/fuzzy-obstacle'
import { addObjectInstances, type MapContainer } from '@/lib/map-write'
import { containerToRawBlocks } from '@/store/useMapDocumentStore'
import { buildInteractableRarity } from './interactable-rarity'
import { scatterZoneFauna } from './zone-fauna'
import { scatterZoneInteractables } from './zone-interactables'
import { scatterZoneObstacles } from './zone-decoration'
import { createPlacementState, tryPlaceAt, type PlacementState, type ZonePlacement } from './zone-population'
import { zonesFromTerrain } from './zones-from-terrain'

export const DECORATION_TYPES = ['trees', 'mountains', 'rocks', 'pools', 'fauna'] as const
export type DecorationType = (typeof DECORATION_TYPES)[number]

export interface OnMapLayers {
  /** Which decoration kinds to add. `rocks` is everything else the scenery scatter picks (rocks, bushes, clutter). */
  decorations?: { types: ReadonlySet<DecorationType>; density: number }
  interactables?: { density: number; disabledSids: ReadonlySet<string> }
}

export interface OnMapResult {
  container: MapContainer
  /** Objects added, by layer. */
  added: { decorations: number; fauna: number; interactables: number }
}

function decorationTypeOf(sid: string): DecorationType {
  if (isTreeDecoration(sid)) return 'trees'
  if (sid.startsWith('mountain_')) return 'mountains'
  if (sid.startsWith('pool_')) return 'pools'
  return 'rocks'
}

/** Runs a scatter on a throw-away copy of the state, keeps the placements `keep` accepts, and books those into the real state. The placers mark
 *  every tile they try, so a dropped placement would otherwise leave an empty patch behind. */
function scatterKeeping(state: PlacementState, run: (scratch: PlacementState) => ZonePlacement[], keep: (p: ZonePlacement) => boolean, sizeX: number, sizeZ: number, catalogById: Map<string, CatalogMapObject>): ZonePlacement[] {
  const scratch: PlacementState = { ...state, blocked: new Set(state.blocked), usedAnchors: new Set(state.usedAnchors), guardTileByNode: new Map(state.guardTileByNode), reservedGuardTiles: new Set(state.reservedGuardTiles) }
  const kept: ZonePlacement[] = []
  for (const p of run(scratch)) {
    if (!keep(p)) continue
    if (tryPlaceAt(p.sid, p.node, sizeX, sizeZ, catalogById, state)) kept.push({ ...p, tempId: state.nextTempId++ })
  }
  return kept
}

export function generateOnMap(container: MapContainer, catalog: GameCatalog, layers: OnMapLayers, rng: () => number): OnMapResult {
  const ctx = extractMapContext(containerToRawBlocks(container))
  const { sizeX, sizeZ } = ctx
  if (sizeX <= 0 || sizeZ <= 0 || ctx.tilesMap.length !== sizeX * sizeZ) throw new Error('The map has no tile data to generate on')
  const catalogById = new Map<string, CatalogMapObject>(catalog.mapObjects.map((o) => [o.id, o]))

  const startNodes = ctx.placedObjects.filter((o) => o.type === 0 && o.sid === 'city-spawner').map((o) => o.node)
  const terrain = zonesFromTerrain({ sizeX, sizeZ, tilesMap: ctx.tilesMap, startNodes })

  const blocked = buildBlockedTileSet({ sizeX, sizeZ, placedObjects: ctx.placedObjects, levelsMap: ctx.levelsMap, climbsMap: ctx.climbsMap, waterMap: ctx.waterMap }, catalog)
  const state = createPlacementState(blocked, new Set(ctx.placedObjects.map((o) => o.node)))
  state.tileBiome = ctx.tilesMap

  const waterNodes = new Set<number>()
  ctx.waterMap.forEach((w, node) => { if (w !== 0) waterNodes.add(node) })
  const roadNodes = new Set<number>()
  ctx.roadsMap.forEach((r, node) => { if (r !== 0) roadNodes.add(node) })
  const riverNodes = new Set<number>(ctx.riverNodes.keys())
  const walkable = new Set<number>([...roadNodes, ...riverNodes])
  // Scenery never covers a road, a river or water.
  const excluded = new Set<number>([...roadNodes, ...riverNodes, ...waterNodes])

  const additions: ZonePlacement[] = []
  const added = { decorations: 0, fauna: 0, interactables: 0 }

  const deco = layers.decorations
  if (deco && deco.types.size > 0) {
    const scenery = scatterKeeping(state, (scratch) => scatterZoneObstacles({
      sizeX, sizeZ, zones: terrain.zones, centers: terrain.centers, tilesByZone: terrain.tilesByZone, zoneBiome: terrain.zoneBiome, catalogById,
      mapObjects: catalog.mapObjects, excludedNodes: excluded, state: scratch, rng, density: deco.density,
      levelsMap: ctx.levelsMap, climbsMap: ctx.climbsMap, rmgEnvironmentAssets: catalog.rmgEnvironmentAssets, walkableNodes: walkable,
    }), (p) => deco.types.has(decorationTypeOf(p.sid)), sizeX, sizeZ, catalogById)
    additions.push(...scenery)
    added.decorations = scenery.length
    if (deco.types.has('fauna')) {
      const fauna = scatterZoneFauna({
        sizeX, sizeZ, zones: terrain.zones, tilesByZone: terrain.tilesByZone, zoneBiome: terrain.zoneBiome, waterNodes, catalogById,
        mapObjects: catalog.mapObjects, excludedNodes: new Set([...roadNodes, ...riverNodes]), state, rng,
      })
      additions.push(...fauna)
      added.fauna = fauna.length
    }
  }

  const inter = layers.interactables
  if (inter) {
    const placed = scatterZoneInteractables({
      sizeX, sizeZ, zones: terrain.zones, tilesByZone: terrain.tilesByZone, catalogById, excludedNodes: excluded, state, rng, riverNodes,
      density: inter.density, disabledInteractableSids: new Set(inter.disabledSids), rarity: buildInteractableRarity(catalog),
    })
    additions.push(...placed)
    added.interactables = placed.length
  }

  const block2 = addObjectInstances(container.chunks[1], additions.map((p) => ({ sid: p.sid, node: p.node, rotation: p.rotation, randomItemOverrides: p.randomItemOverrides, randomHireOverrides: p.randomHireOverrides }))).block2Chunk
  const chunks = [...container.chunks]
  chunks[1] = block2
  return { container: { ...container, chunks }, added }
}
