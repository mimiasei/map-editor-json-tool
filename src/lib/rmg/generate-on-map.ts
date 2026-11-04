// ─── Random map generation on top of a map somebody already started ──────────
// Pure: takes the open map's container, returns a new container with the chosen layers added. Existing content is never touched:
// the placers only get free tiles (existing footprints, water, roads, rivers, elevation walls and anchors are seeded into the collision
// state), and nothing is moved or deleted. Zones come from the user's own biome regions (zones-from-terrain.ts), not from a zone graph.
// Layers run in the generator's own order (water, elevation, treasure, scenery, interactables, guards) so later ones see earlier ones.

import type { GameCatalog, CatalogMapObject } from '@/lib/catalog/types'
import { extractMapContext } from '@/lib/map-extract'
import { buildBlockedTileSet, isElevationWallTile } from '@/lib/map-grid/passability'
import { resolveDecorationSubcategory, type DecorationSubcategory } from '@/lib/map-grid/decoration-subcategories'
import { addObjectInstance, addObjectInstances, paintClimbTiles, paintLevelTiles, paintWaterTiles, type MapContainer } from '@/lib/map-write'
import { containerToRawBlocks } from '@/store/useMapDocumentStore'
import { difficultyIndex, resolveRichness, type RmgDifficulty, type RmgRichness } from './classic-presets'
import { buildInteractableRarity } from './interactable-rarity'
import { applySchemaTuning, EMPTY_TUNING } from './rmg-tuning'
import { BUILTIN_RMG_SCHEMA } from './rmg-schema'
import { buildObjectLogicsIndex } from './value-model'
import { collectArtifactSids } from './object-variety'
import { isGuardCandidate, scatterProximityGuards } from './zone-guard-scatter'
import { scatterZoneElevation } from './zone-elevation'
import { scatterZoneFauna } from './zone-fauna'
import { scatterZoneInteractables } from './zone-interactables'
import { scatterZoneObstacles } from './zone-decoration'
import { scatterZoneWater } from './zone-water'
import { createPlacementState, createZonePopulator, tryPlaceAt, type ConcreteSquadPlacement, type PlacementState, type ZonePlacement } from './zone-population'
import { zonesFromTerrain } from './zones-from-terrain'

/** The Map Grid's own decoration subcategories (decoration-subcategories.ts), so the names match the object browser and the stats. The game has no bush
 *  objects; shrub-like things are in walkable (grass, flowers, mushrooms) or other. */
export const DECORATION_TYPES = ['trees', 'mountains', 'rocks', 'hills', 'walkable', 'pools', 'other', 'animals', 'fx'] as const satisfies readonly DecorationSubcategory[]
export type DecorationType = (typeof DECORATION_TYPES)[number]

export const TREASURE_TYPES = ['resources', 'artifacts', 'chests', 'hires', 'buildings'] as const
export type TreasureType = (typeof TREASURE_TYPES)[number]

/** Which treasure checkbox a treasure-loop object belongs to: resource piles and storages, artifacts, chests (incl. Pandora and scroll boxes), hires, and
 *  everything else the pools hand out (buildings, dwellings). */
const SCROLL_BOX_SIDS = new Set(['scroll_box', 'enchanted_scroll_box'])
/** The artifact pool hands out scroll boxes too, far more often than the game's maps have them: they count as chests and only this share is kept. */
const SCROLL_BOX_KEEP = 0.15

function treasureTypeOf(sid: string, artifactSids: Set<string>): TreasureType {
  if (sid.startsWith('resource_') || sid.startsWith('storage_') || sid === 'random-res') return 'resources'
  if (sid === 'chest' || SCROLL_BOX_SIDS.has(sid)) return 'chests'
  if (sid === 'random-item' || artifactSids.has(sid)) return 'artifacts'
  if (sid === 'random-hire') return 'hires'
  return 'buildings'
}

/** A guard counts as belonging to the nearest treasure object within this many tiles. */
const GUARD_TIE_RADIUS = 4

/** Same stand-in as the full generator: classic zone/treasure guards are scaled up so their total value matches the game templates. */
const CLASSIC_ZONE_GUARD_SCALE = 1.8
/** An existing object with a squad this close (tiles) already counts as guarded. */
const GUARDED_RADIUS = 3
/** Water, hills, treasure and interactables keep this far from a start city: a hand-made map is often one big biome region around all its starts, so "the
 *  player zone" cannot be told apart by region the way the generator's zones can. */
const START_PROTECT_RADIUS = 12

export interface OnMapLayers {
  /** Strength words shared by treasure and guards. */
  settings: { richness: RmgRichness; difficulty: RmgDifficulty }
  /** Lakes in the zones that have no start city. `chance` is the full generator's waterChance (0-1). */
  water?: { chance: number }
  /** Hills and dry valleys (with their ramps). */
  elevation?: { hillChance: number; valleyChance: number }
  /** Treasure piles, artifacts, dwellings and hires with their guards, in the zones that have no start city. */
  treasures?: { density: number; types: ReadonlySet<TreasureType> }
  /** Which decoration kinds to add. */
  decorations?: { types: ReadonlySet<DecorationType>; density: number }
  interactables?: { density: number; disabledSids: ReadonlySet<string> }
  /** Guards beside the new interactables, and optionally beside existing unguarded objects. */
  encounters?: { density: number; guardExisting: boolean }
}

export interface OnMapResult {
  container: MapContainer
  /** Things added, by layer. */
  added: { water: number; elevation: number; treasures: number; decorations: number; fauna: number; interactables: number; encounters: number }
}

function decorationTypeOf(sid: string, catalogById: Map<string, CatalogMapObject>): DecorationSubcategory {
  return resolveDecorationSubcategory(sid, catalogById.get(sid)?.category)
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
  const tileCount = sizeX * sizeZ
  if (sizeX <= 0 || sizeZ <= 0 || ctx.tilesMap.length !== tileCount) throw new Error('The map has no tile data to generate on')
  const catalogById = new Map<string, CatalogMapObject>(catalog.mapObjects.map((o) => [o.id, o]))

  const startNodes = ctx.placedObjects.filter((o) => o.type === 0 && o.sid === 'city-spawner').map((o) => o.node)
  const terrain = zonesFromTerrain({ sizeX, sizeZ, tilesMap: ctx.tilesMap, startNodes })
  // Every region takes part in the placers as a neutral zone; the start cities are protected by distance instead (see START_PROTECT_RADIUS).
  const placerZones = terrain.zones.map((z) => ({ ...z, kind: 'neutral' as const }))
  const nearStart = new Set<number>()
  for (const s of startNodes) {
    const sx = s % sizeX
    const sz = Math.floor(s / sizeX)
    for (let z = Math.max(0, sz - START_PROTECT_RADIUS); z <= Math.min(sizeZ - 1, sz + START_PROTECT_RADIUS); z++) {
      for (let x = Math.max(0, sx - START_PROTECT_RADIUS); x <= Math.min(sizeX - 1, sx + START_PROTECT_RADIUS); x++) {
        if (Math.hypot(x - sx, z - sz) <= START_PROTECT_RADIUS) nearStart.add(z * sizeX + x)
      }
    }
  }
  const awayFromStarts = new Map<number, number[]>()
  for (const [zoneId, tiles] of terrain.tilesByZone) awayFromStarts.set(zoneId, tiles.filter((n) => !nearStart.has(n)))

  // Layers are written into these copies as they run, so each later layer sees the earlier ones.
  const levels = [...ctx.levelsMap]
  const climbs = [...ctx.climbsMap]
  const water = [...ctx.waterMap]
  const waterChanges: { node: number; waterId: number }[] = []
  const levelChanges: { node: number; level: number }[] = []
  const climbChanges: { node: number; climb: 1 }[] = []

  const state = createPlacementState(
    buildBlockedTileSet({ sizeX, sizeZ, placedObjects: ctx.placedObjects, levelsMap: levels, climbsMap: climbs, waterMap: water }, catalog),
    new Set(ctx.placedObjects.map((o) => o.node)),
  )
  state.tileBiome = ctx.tilesMap

  const roadNodes = new Set<number>()
  ctx.roadsMap.forEach((r, node) => { if (r !== 0) roadNodes.add(node) })
  const riverNodes = new Set<number>(ctx.riverNodes.keys())
  const walkable = new Set<number>([...roadNodes, ...riverNodes])
  // Nothing is placed on a road or a river, like the generator (it blocks the road tiles before it places treasure).
  for (const node of walkable) state.blocked.add(node)
  const waterNodes = new Set<number>()
  water.forEach((w, node) => { if (w !== 0) waterNodes.add(node) })
  const excluded = new Set<number>([...walkable, ...waterNodes])

  const additions: ZonePlacement[] = []
  const squads: ConcreteSquadPlacement[] = []
  const added = { water: 0, elevation: 0, treasures: 0, decorations: 0, fauna: 0, interactables: 0, encounters: 0 }

  // Keeps lakes and hills off the things the player must be able to walk between: start cities, existing mines and dwellings, zone centres.
  const keyNodes = ctx.placedObjects.filter((o) => o.type === 0 && (o.sid === 'city-spawner' || o.sid.startsWith('mine_') || o.sid.startsWith('barracks_'))).map((o) => o.node)
  const connectNodes = [...keyNodes, ...terrain.zoneAnchorNode.values()]
  const protectedAnchors = new Set<number>([...state.usedAnchors, ...walkable, ...nearStart])

  if (layers.water) {
    const result = scatterZoneWater({
      sizeX, sizeZ, zones: placerZones, tilesByZone: terrain.tilesByZone, tileBiome: ctx.tilesMap,
      excludedNodes: new Set(terrain.zoneAnchorNode.values()), connectNodes, blocked: state.blocked, usedAnchors: protectedAnchors, rng, chance: layers.water.chance,
    })
    for (const c of result.waterChanges) { water[c.node] = c.waterId; waterChanges.push(c) }
    for (const c of result.levelChanges) { levels[c.node] = c.level; levelChanges.push(c) }
    for (const node of result.waterNodes) { waterNodes.add(node); excluded.add(node); state.blocked.add(node) }
    added.water = result.waterNodes.size
  }

  if (layers.elevation) {
    const taken = new Set<number>(waterNodes)
    levels.forEach((l, node) => { if (l !== 0) taken.add(node) })
    const common = {
      sizeX, sizeZ, zones: placerZones, tilesByZone: terrain.tilesByZone, zoneAnchorNode: terrain.zoneAnchorNode,
      excludedNodes: new Set<number>([...terrain.zoneAnchorNode.values(), ...connectNodes]), blocked: state.blocked, usedAnchors: protectedAnchors, rng,
    }
    const hills = scatterZoneElevation({ ...common, kind: 'hill', chance: layers.elevation.hillChance, reservedNodes: taken })
    const valleys = scatterZoneElevation({ ...common, kind: 'valley', chance: layers.elevation.valleyChance, reservedNodes: new Set([...taken, ...hills.elevatedNodes]) })
    for (const r of [hills, valleys]) {
      for (const c of r.levelChanges) { levels[c.node] = c.level; levelChanges.push(c) }
      for (const c of r.climbChanges) { climbs[c.node] = c.climb; climbChanges.push(c) }
    }
    added.elevation = hills.elevatedNodes.size + valleys.elevatedNodes.size
    // Only the wall tiles of a raised or lowered area block walking (passability.ts), not the whole area.
    for (let node = 0; node < tileCount; node++) if (isElevationWallTile(node, sizeX, sizeZ, levels, climbs)) state.blocked.add(node)
  }

  const schema = applySchemaTuning(BUILTIN_RMG_SCHEMA, EMPTY_TUNING)
  const baseDifficulty = catalog.rmgSchema?.difficulties?.[difficultyIndex(layers.settings.difficulty)] ?? schema.difficulties[difficultyIndex(layers.settings.difficulty)]
  const difficulty = baseDifficulty ? { ...baseDifficulty, zoneGuardMultiplier: baseDifficulty.zoneGuardMultiplier * CLASSIC_ZONE_GUARD_SCALE } : undefined
  const guardedByTreasure = new Set<number>()

  if (layers.treasures) {
    const landByZone = new Map<number, number[]>()
    for (const [zoneId, tiles] of awayFromStarts) landByZone.set(zoneId, tiles.filter((n) => !excluded.has(n)))
    const populatorOptions = {
      sizeX, sizeZ, zones: placerZones, tilesByZone: landByZone, zoneBiome: terrain.zoneBiome, catalogById, objectLogicsById: buildObjectLogicsIndex(catalog), state, rng,
      treasureDensity: layers.treasures.density, catalog, contentCountLimits: [{ sid: 'university', maxCount: 1 }, { sid: 'pandora_box', maxCount: 0 }], richness: resolveRichness(layers.settings.richness, EMPTY_TUNING),
      difficulty, guardTuning: EMPTY_TUNING.guards, zoneAnchorNode: terrain.zoneAnchorNode,
    }
    // Run on a scratch copy, keep the chosen kinds with the guards that stand beside them, and book only those into the real state.
    const scratch: PlacementState = { ...state, blocked: new Set(state.blocked), usedAnchors: new Set(state.usedAnchors), guardTileByNode: new Map(state.guardTileByNode), reservedGuardTiles: new Set(state.reservedGuardTiles) }
    const result = createZonePopulator({ ...populatorOptions, state: scratch }).populateTreasure()
    const artifactSids = new Set(collectArtifactSids(catalog))
    const objects = result.placements.filter((p) => p.sid !== 'random-squad')
    const near = (a: number, b: number): number => Math.max(Math.abs((a % sizeX) - (b % sizeX)), Math.abs(Math.floor(a / sizeX) - Math.floor(b / sizeX)))
    const wanted = layers.treasures.types
    // One decision per object (chosen kind; scroll boxes also only SCROLL_BOX_KEEP of the time; Pandora's boxes never), so its guard can follow it.
    const keepObject = new Map<ZonePlacement, boolean>(objects.map((o) => [o, o.sid !== 'pandora_box' && wanted.has(treasureTypeOf(o.sid, artifactSids)) && (!SCROLL_BOX_SIDS.has(o.sid) || rng() < SCROLL_BOX_KEEP)]))
    /** Whether the treasure object nearest to a guard is kept (undefined: no treasure object close by). */
    const guardedObjectWanted = (node: number): boolean | undefined => {
      let best: ZonePlacement | undefined
      for (const o of objects) if (near(o.node, node) <= GUARD_TIE_RADIUS && (!best || near(o.node, node) < near(best.node, node))) best = o
      return best ? keepObject.get(best) : undefined
    }
    let treasureCount = 0
    for (const p of result.placements) {
      const keep = p.sid === 'random-squad' ? guardedObjectWanted(p.node) ?? true : keepObject.get(p) === true
      if (!keep || !tryPlaceAt(p.sid, p.node, sizeX, sizeZ, catalogById, state)) continue
      additions.push({ ...p, tempId: state.nextTempId++ })
      guardedByTreasure.add(p.node)
      treasureCount++
    }
    for (const s of result.concreteSquads) {
      if (guardedObjectWanted(s.node) === false) continue
      state.usedAnchors.add(s.node)
      squads.push({ ...s, tempId: state.nextTempId++ })
      treasureCount++
    }
    added.treasures = treasureCount
  }

  const deco = layers.decorations
  const sceneryTypes = deco ? DECORATION_TYPES.filter((type) => deco.types.has(type) && type !== 'animals' && type !== 'fx') : []
  if (deco && sceneryTypes.length > 0) {
    const scenery = scatterKeeping(state, (scratch) => scatterZoneObstacles({
      sizeX, sizeZ, zones: terrain.zones, centers: terrain.centers, tilesByZone: terrain.tilesByZone, zoneBiome: terrain.zoneBiome, catalogById,
      mapObjects: catalog.mapObjects, excludedNodes: excluded, state: scratch, rng, density: deco.density,
      levelsMap: levels, climbsMap: climbs, rmgEnvironmentAssets: catalog.rmgEnvironmentAssets, walkableNodes: walkable,
    }), (p) => deco.types.has(decorationTypeOf(p.sid, catalogById) as DecorationType), sizeX, sizeZ, catalogById)
    additions.push(...scenery)
    added.decorations = scenery.length
  }
  if (deco && (deco.types.has('animals') || deco.types.has('fx'))) {
    const fauna = scatterKeeping(state, (scratch) => scatterZoneFauna({
      sizeX, sizeZ, zones: terrain.zones, tilesByZone: terrain.tilesByZone, zoneBiome: terrain.zoneBiome, waterNodes, catalogById,
      mapObjects: catalog.mapObjects, excludedNodes: new Set([...roadNodes, ...riverNodes]), state: scratch, rng,
    }), (p) => deco.types.has(decorationTypeOf(p.sid, catalogById) as DecorationType), sizeX, sizeZ, catalogById)
    additions.push(...fauna)
    added.fauna = fauna.length
  }

  let newInteractables: ZonePlacement[] = []
  const inter = layers.interactables
  if (inter) {
    newInteractables = scatterZoneInteractables({
      sizeX, sizeZ, zones: placerZones, tilesByZone: awayFromStarts, catalogById, excludedNodes: excluded, state, rng, riverNodes,
      density: inter.density, disabledInteractableSids: new Set(inter.disabledSids), rarity: buildInteractableRarity(catalog),
    })
    additions.push(...newInteractables)
    added.interactables = newInteractables.length
  }

  const enc = layers.encounters
  if (enc) {
    const guardPositions = ctx.placedObjects.filter((o) => o.type === 2 || (o.type === 0 && o.sid === 'random-squad')).map((o) => o.node)
    const isGuarded = (node: number): boolean => guardPositions.some((g) => Math.max(Math.abs((g % sizeX) - (node % sizeX)), Math.abs(Math.floor(g / sizeX) - Math.floor(node / sizeX))) <= GUARDED_RADIUS)
    const artifactSids = new Set(collectArtifactSids(catalog))
    const existing: ZonePlacement[] = []
    const decided = new Set<number>(guardedByTreasure)
    for (const o of ctx.placedObjects) {
      if (o.type !== 0 || !isGuardCandidate(o.sid, artifactSids)) continue
      if (!enc.guardExisting || isGuarded(o.node)) { decided.add(o.node); continue }
      existing.push({ tempId: state.nextTempId++, sid: o.sid, node: o.node })
    }
    const result = scatterProximityGuards({
      sizeX, sizeZ, placements: existing, zoneIdByNode: terrain.zoneIdByNode, zoneBiome: terrain.zoneBiome, zoneDistances: terrain.zoneDistances,
      playerZoneIds: terrain.zones.filter((z) => z.kind === 'player').map((z) => z.id), catalogById, catalog, objectVariety: 0.4,
      squadDensity: enc.density, state, rng, difficulty, guardTuning: EMPTY_TUNING.guards, decidedNodes: decided, laterPlacements: newInteractables,
    })
    additions.push(...result.guardPlacements)
    squads.push(...result.concreteSquads)
    added.encounters = result.guardPlacements.length + result.concreteSquads.length
  }

  // Commit onto a copy of the container: tile layers first, then objects, then the concrete squads (their own entity type).
  let block1 = container.chunks[0]
  let block2 = container.chunks[1]
  if (waterChanges.length > 0) block2 = paintWaterTiles(block2, waterChanges)
  if (levelChanges.length > 0) block2 = paintLevelTiles(block2, levelChanges)
  if (climbChanges.length > 0) block2 = paintClimbTiles(block2, climbChanges)
  block2 = addObjectInstances(block2, additions.map((p) => ({
    sid: p.sid, node: p.node, rotation: p.rotation, randomSquadOverrides: p.randomSquadOverrides, randomItemOverrides: p.randomItemOverrides,
    randomCityOverrides: p.randomCityOverrides, randomHireOverrides: p.randomHireOverrides,
  }))).block2Chunk
  for (const squad of squads) {
    const r = addObjectInstance(block1, block2, 2, squad.sid, squad.node)
    block1 = r.block1Chunk
    block2 = r.block2Chunk
  }
  const chunks = [...container.chunks]
  chunks[0] = block1
  chunks[1] = block2
  return { container: { ...container, chunks }, added }
}
