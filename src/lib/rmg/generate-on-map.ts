// ─── Random map generation on top of a map somebody already started ──────────
// Pure: takes the open map's container, returns a new container with the chosen layers added. Existing content is never touched:
// the placers only get free tiles (existing footprints, water, roads, rivers, elevation walls and anchors are seeded into the collision
// state), and nothing is moved or deleted. Zones come from the user's own biome regions (zones-from-terrain.ts), not from a zone graph.
// Layers run in the generator's own order (water, elevation, treasure, scenery, interactables, guards) so later ones see earlier ones.

import type { GameCatalog, CatalogMapObject } from '@/lib/catalog/types'
import { extractMapContext } from '@/lib/map-extract'
import { buildBlockedTileSet, isElevationWallTile } from '@/lib/map-grid/passability'
import type { BiomeId } from '@/lib/map-grid/terrain-colors'
import { resolveDecorationSubcategory, type DecorationSubcategory } from '@/lib/map-grid/decoration-subcategories'
import { addObjectInstance, addObjectInstances, paintClimbTiles, paintLevelTiles, paintRiverTiles, paintRoadTiles, paintTerrainTiles, paintWaterTiles, type MapContainer } from '@/lib/map-write'
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
import type { ZoneSpec } from './zone-graph'
import { createPlacementState, createZonePopulator, tryPlaceAt, type ConcreteSquadPlacement, type PlacementState, type ZonePlacement } from './zone-population'
import { carveRiversOnMap, layRoads } from './on-map-linework'
import { planBorderGates, wallZoneBorders, type BorderGatePlan } from './on-map-borders'
import { closeBorderLeaks } from './zone-boundary'
import { pickSquadRange, randomInRange, sampleFraction } from '@/lib/map-grid/squad-pool'
import { RMG_GUARD_DIFFICULTY_RANGES, RMG_GUARD_RANDOM_WEIGHTS } from './guard-value-bands'
import { paintOnMapTerrain, type OnMapTerrainLayer } from './on-map-terrain'
import { zonesFromTerrain } from './zones-from-terrain'
import i18n from '@/lib/i18n'
import { runPlacementAutoFix } from '@/lib/map-grid/auto-fix-pass'
import { describeMapValidationIssue, findMapValidationIssues } from '@/lib/map-grid/map-validation'

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
/** On a small map with many starts a fixed radius would leave almost no room, so the protected area is capped at this share of the map (radius never below 5). */
const START_PROTECT_MAX_SHARE = 0.35
const START_PROTECT_MIN_RADIUS = 5
/** Largest factor the treasure amount is raised by when only some kinds are ticked (the unticked ones are thrown away, so a plain amount would shrink). */
const MAX_KIND_COMPENSATION = 6
/** The ground around a start city that its mines and dust are placed in (the start kit puts them 5-17 tiles out). */
const START_ZONE_RADIUS = 20
const START_KIT_REACH = 17
/** Ids of the stand-in start zones, clear of the terrain regions' ids. */
const START_ZONE_ID_BASE = 100000
/** Tiles from the nearest start per guard-difficulty step: under one step only Easy guards, under two Easy/Normal, further out the full spread (the zone graph's hop count has no meaning on a hand-made map). */
const GUARD_DEPTH_STEP = 18
/** Gate guards use the Lethal band from this far out, Impossible before it. */
const LETHAL_GATE_DISTANCE = 30
/** Gate guards are stronger than the Impossible/Lethal band alone (the full generator's 'strong' border setting). */
const GATE_GUARD_SCALE = 1.5
/** Ceiling for a gate guard: the Lethal band times the scale reached 150K+, far past what a border should cost. */
const GATE_GUARD_MAX_VALUE = 60000
/** Chance a new treasure object gets a guard (the rest stand free, like the odd unguarded pile on a real map). */
const TREASURE_GUARD_CHANCE = 0.95
/** Resource piles (gold, ore, wood, ...) are cheap to take: only this share of them keeps a guard. */
const RESOURCE_GUARD_SHARE = 0.5

export interface OnMapLayers {
  /** Strength words shared by treasure and guards. */
  settings: { richness: RmgRichness; difficulty: RmgDifficulty }
  /** Biomes on free ground (see on-map-terrain.ts). Runs first: every other layer works on the new terrain. */
  terrain?: OnMapTerrainLayer
  /** Obstacles along the borders between zones, with gates (needs zones: the terrain layer's zones, or the map's own `areas`). */
  borders?: boolean
  /** Borders follow the player areas the user painted on the map, not the terrain layer's zones. */
  definedZones?: boolean
  /** Lakes in the zones that have no start city. `chance` is the full generator's waterChance (0-1). */
  water?: { chance: number }
  /** Hills and dry valleys (with their ramps). */
  elevation?: { hillChance: number; valleyChance: number }
  /** Roads: the cities are joined by stone roads and mines and dwellings get spurs (`spurChance`) to the nearest road. */
  roads?: { spurChance: number }
  /** Mines (and a start's dust) with their guards, placed like the generator does: start-kit distances around each start city, mine count by size in the other regions. */
  mines?: Record<string, never>
  /** Rivers with their source mountains and end pools. */
  rivers?: { count: number }
  /** Treasure piles, artifacts, dwellings and hires with their guards, in the zones that have no start city. */
  treasures?: { density: number; types: ReadonlySet<TreasureType> }
  /** Which decoration kinds to add. */
  /** `biomePurity` is the Map Grid brushes' slider: 1 = each region's own biome only, lower = more borrowed from other biomes. */
  decorations?: { types: ReadonlySet<DecorationType>; density: number; biomePurity: number; allowHighContrastBiomes: boolean }
  interactables?: { density: number; disabledSids: ReadonlySet<string> }
  /** Guards beside the new interactables, and optionally beside existing unguarded objects. */
  encounters?: { density: number; guardExisting: boolean }
}

export interface OnMapResult {
  container: MapContainer
  /** Things added, by layer. */
  added: { terrain: number; borders: number; water: number; elevation: number; roads: number; rivers: number; mines: number; treasures: number; decorations: number; fauna: number; interactables: number; encounters: number }
  /** What the placement auto-fix did and what it could not fix, without the problems the map already had. */
  warnings: string[]
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
  // The terrain layer repaints this copy; everything below reads it, so each layer sees the new biomes.
  const tiles = [...ctx.tilesMap]
  let terrainChanges: { node: number; biomeId: number }[] = []
  let terrainZoneIds: number[] | undefined
  if (layers.terrain) {
    const occupied = buildBlockedTileSet({ sizeX, sizeZ, placedObjects: ctx.placedObjects, levelsMap: ctx.levelsMap, climbsMap: ctx.climbsMap, waterMap: ctx.waterMap }, catalog)
    for (const o of ctx.placedObjects) occupied.add(o.node)
    ctx.roadsMap.forEach((r, node) => { if (r !== 0) occupied.add(node) })
    for (const node of ctx.riverNodes.keys()) occupied.add(node)
    const painted = paintOnMapTerrain({ sizeX, sizeZ, tiles, occupied, startCount: startNodes.length, layer: layers.terrain, catalogById, rng })
    terrainChanges = painted.changes
    terrainZoneIds = painted.zoneIdByNode
  }
  const terrain = zonesFromTerrain({ sizeX, sizeZ, tilesMap: tiles, startNodes })
  // Every region takes part in the placers as a neutral zone; the start cities are protected by distance instead (see START_PROTECT_RADIUS).
  const placerZones = terrain.zones.map((z) => ({ ...z, kind: 'neutral' as const }))
  const nearStart = new Set<number>()
  const protectRadius = startNodes.length === 0 ? START_PROTECT_RADIUS : Math.max(START_PROTECT_MIN_RADIUS, Math.min(START_PROTECT_RADIUS, Math.floor(Math.sqrt((START_PROTECT_MAX_SHARE * tileCount) / (Math.PI * startNodes.length)))))
  for (const s of startNodes) {
    const sx = s % sizeX
    const sz = Math.floor(s / sizeX)
    for (let z = Math.max(0, sz - protectRadius); z <= Math.min(sizeZ - 1, sz + protectRadius); z++) {
      for (let x = Math.max(0, sx - protectRadius); x <= Math.min(sizeX - 1, sx + protectRadius); x++) {
        if (Math.hypot(x - sx, z - sz) <= protectRadius) nearStart.add(z * sizeX + x)
      }
    }
  }
  /** Tiles to the nearest start city (far away when the map has none, so everything gets the full guard spread). */
  const distanceToStart = (node: number): number => {
    let best = Infinity
    for (const s of startNodes) best = Math.min(best, Math.hypot((s % sizeX) - (node % sizeX), Math.floor(s / sizeX) - Math.floor(node / sizeX)))
    return best === Infinity ? 1000 : best
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
  state.tileBiome = tiles

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
  const roadChanges: { node: number; roadId: number }[] = []
  let riverChanges: { node: number; s: number; isWaterfall?: boolean }[] = []
  const squads: ConcreteSquadPlacement[] = []
  const added = { terrain: terrainChanges.length, borders: 0, water: 0, elevation: 0, roads: 0, rivers: 0, mines: 0, treasures: 0, decorations: 0, fauna: 0, interactables: 0, encounters: 0 }

  // Keeps lakes and hills off the things the player must be able to walk between: start cities, existing mines and dwellings, zone centres.
  const keyNodes = ctx.placedObjects.filter((o) => o.type === 0 && (o.sid === 'city-spawner' || o.sid.startsWith('mine_') || o.sid.startsWith('barracks_'))).map((o) => o.node)
  const connectNodes = [...keyNodes, ...terrain.zoneAnchorNode.values()]
  const protectedAnchors = new Set<number>([...state.usedAnchors, ...walkable, ...nearStart])

  if (layers.water) {
    const result = scatterZoneWater({
      sizeX, sizeZ, zones: placerZones, tilesByZone: terrain.tilesByZone, tileBiome: tiles,
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
  /** Treasure objects placed here: the guard pass rolls a guard for the ones the populator did not already guard. */
  const newTreasure: ZonePlacement[] = []
  /** Resource piles that rolled "no guard": neither the populator's guard nor the guard pass gives them one. */
  const unguardedResourceNodes = new Set<number>()

  if (layers.mines) {
    // The generator's own mine placement: every start gets its wood and ore mines and dust at the start-kit distances, and every neutral region gets
    // mines by its size. A start's "zone" is the ground around its city (a hand-made map has no player zones), the regions are the neutral zones.
    const claimedBy = new Map<number, number>()
    startNodes.forEach((s, i) => {
      const sx = s % sizeX
      const sz = Math.floor(s / sizeX)
      for (let z = Math.max(0, sz - START_ZONE_RADIUS); z <= Math.min(sizeZ - 1, sz + START_ZONE_RADIUS); z++) {
        for (let x = Math.max(0, sx - START_ZONE_RADIUS); x <= Math.min(sizeX - 1, sx + START_ZONE_RADIUS); x++) {
          const node = z * sizeX + x
          const d = Math.hypot(x - sx, z - sz)
          if (d > START_ZONE_RADIUS) continue
          const other = claimedBy.get(node)
          if (other === undefined || d < Math.hypot(x - (startNodes[other] % sizeX), z - Math.floor(startNodes[other] / sizeX))) claimedBy.set(node, i)
        }
      }
    })
    const mineZones: ZoneSpec[] = []
    const mineTiles = new Map<number, number[]>()
    const mineBiome = new Map<number, BiomeId>()
    const mineAnchor = new Map<number, number>()
    startNodes.forEach((s, i) => {
      const id = START_ZONE_ID_BASE + i
      mineZones.push({ id, kind: 'player', playerIndex: i + 1, size: 1 })
      mineTiles.set(id, [...claimedBy].filter(([node, owner]) => owner === i && !excluded.has(node)).map(([node]) => node))
      mineBiome.set(id, tiles[s] as BiomeId)
      mineAnchor.set(id, s)
    })
    for (const zone of terrain.zones) {
      mineZones.push({ id: zone.id, kind: 'neutral', size: zone.size })
      mineTiles.set(zone.id, (terrain.tilesByZone.get(zone.id) ?? []).filter((n) => !claimedBy.has(n) && !excluded.has(n)))
      mineBiome.set(zone.id, terrain.zoneBiome.get(zone.id) as BiomeId)
    }
    const scratchState: PlacementState = { ...state, blocked: new Set(state.blocked), usedAnchors: new Set(state.usedAnchors), guardTileByNode: new Map(state.guardTileByNode), reservedGuardTiles: new Set(state.reservedGuardTiles) }
    const result = createZonePopulator({
      sizeX, sizeZ, zones: mineZones, tilesByZone: mineTiles, zoneBiome: mineBiome, catalogById, objectLogicsById: buildObjectLogicsIndex(catalog), state: scratchState, rng,
      catalog, difficulty, guardTuning: EMPTY_TUNING.guards, zoneAnchorNode: mineAnchor, randomCityCount: 0,
    }).populateKeyObjects()
    const cheb = (a: number, b: number): number => Math.max(Math.abs((a % sizeX) - (b % sizeX)), Math.abs(Math.floor(a / sizeX) - Math.floor(b / sizeX)))
    // Only the mines and the dust are wanted (the populator also lays out a start's dwellings and hires). A start that already has such a resource keeps it.
    const objects = result.placements.filter((p) => p.sid !== 'random-squad')
    const isKept = (p: ZonePlacement): boolean => {
      if (!p.sid.startsWith('mine_') && p.sid !== 'resource_dust') return false
      const owner = claimedBy.get(p.node)
      if (owner === undefined || (p.sid !== 'mine_wood' && p.sid !== 'mine_ore' && p.sid !== 'resource_dust')) return true
      return !ctx.placedObjects.some((o) => o.type === 0 && o.sid === p.sid && cheb(o.node, startNodes[owner]) <= START_KIT_REACH)
    }
    const kept = new Map<ZonePlacement, boolean>(objects.map((o) => [o, isKept(o)]))
    const guardOwnerKept = (node: number): boolean => {
      let best: ZonePlacement | undefined
      for (const o of objects) if (cheb(o.node, node) <= GUARD_TIE_RADIUS && (!best || cheb(o.node, node) < cheb(best.node, node))) best = o
      return best ? kept.get(best) === true : false
    }
    let mineCount = 0
    for (const p of result.placements) {
      const keep = p.sid === 'random-squad' ? guardOwnerKept(p.node) : kept.get(p) === true
      if (!keep || !tryPlaceAt(p.sid, p.node, sizeX, sizeZ, catalogById, state)) continue
      additions.push({ ...p, tempId: state.nextTempId++ })
      if (p.sid !== 'random-squad') guardedByTreasure.add(p.node)
      mineCount++
    }
    for (const s of result.concreteSquads) {
      if (!guardOwnerKept(s.node)) continue
      state.usedAnchors.add(s.node)
      squads.push({ ...s, tempId: state.nextTempId++ })
      mineCount++
    }
    added.mines = mineCount
  }

  if (layers.roads) {
    const existingRoads = new Map<number, number>()
    ctx.roadsMap.forEach((r, node) => { if (r !== 0) existingRoads.set(node, r) })
    const toPoint = (o: (typeof ctx.placedObjects)[number]) => ({ sid: o.sid, node: o.node, rotation: o.rotation })
    // Spawner placeholders (random-squad, random-item, ...) have no solid cells, so a road would run over them: their tiles count as blocked too.
    const newRoads = layRoads({
      blocked: new Set([...state.blocked, ...state.usedAnchors]),
      sizeX, sizeZ, rng, catalogById, existingRoads, spurChance: layers.roads.spurChance,
      cities: ctx.placedObjects.filter((o) => o.type === 0 && (o.sid === 'city-spawner' || o.isCity)).map(toPoint),
      spurPoints: [
        ...ctx.placedObjects.filter((o) => o.type === 0 && (o.sid.startsWith('mine_') || o.sid.startsWith('barracks_'))).map(toPoint),
        ...additions.filter((p) => p.sid.startsWith('mine_')).map((p) => ({ sid: p.sid, node: p.node, rotation: p.rotation })),
      ],
    })
    for (const [node, roadId] of newRoads) {
      roadChanges.push({ node, roadId })
      roadNodes.add(node)
      walkable.add(node)
      excluded.add(node)
      state.blocked.add(node)
    }
    added.roads = newRoads.size
  }

  // The gates are decided before the treasure and decoration layers run, so they keep off the corridors; the walls themselves come after them.
  let borderSetup: { zoneIdByNode: number[]; zoneBiome: Map<number, BiomeId>; plan: BorderGatePlan } | undefined
  if (layers.borders) {
    // The zones the terrain layer just laid out, else the zones the map already has (a generated map's areas).
    let zoneIdByNode = terrainZoneIds
    if (layers.definedZones) {
      // The player areas the user painted (0 = no area): ground outside every area counts as one more zone, so each area gets a wall toward it.
      if (!ctx.customAreasPainting.some((id) => id !== 0)) throw new Error('The map has no player areas to put borders around')
      zoneIdByNode = Array.from({ length: tileCount }, (_, node) => ctx.customAreasPainting[node] ?? 0)
    }
    if (!zoneIdByNode && ctx.zoneAreas.length > 1) {
      const ids = new Array<number>(tileCount).fill(-1)
      for (const area of ctx.zoneAreas) for (const node of area.nodes) if (node >= 0 && node < tileCount) ids[node] = area.id
      if (ids.filter((id) => id !== -1).length >= tileCount / 2) zoneIdByNode = ids
    }
    if (!zoneIdByNode) throw new Error('The map has no zones to put borders between')
    const biomeVotes = new Map<number, Map<number, number>>()
    zoneIdByNode.forEach((zoneId, node) => {
      const votes = biomeVotes.get(zoneId) ?? new Map<number, number>()
      votes.set(tiles[node], (votes.get(tiles[node]) ?? 0) + 1)
      biomeVotes.set(zoneId, votes)
    })
    const zoneBiome = new Map<number, BiomeId>([...biomeVotes].map(([zoneId, votes]) => [zoneId, [...votes].sort((a, b) => b[1] - a[1])[0][0] as BiomeId]))
    const plan = planBorderGates({ sizeX, sizeZ, zoneIdByNode, state, roadNodes })
    for (const node of plan.corridors) excluded.add(node)
    borderSetup = { zoneIdByNode, zoneBiome, plan }
  }

  if (layers.treasures) {
    const landByZone = new Map<number, number[]>()
    for (const [zoneId, tiles] of awayFromStarts) landByZone.set(zoneId, tiles.filter((n) => !excluded.has(n)))
    const populatorOptions = {
      sizeX, sizeZ, zones: placerZones, tilesByZone: landByZone, zoneBiome: terrain.zoneBiome, catalogById, objectLogicsById: buildObjectLogicsIndex(catalog), state, rng,
      treasureDensity: layers.treasures.density, catalog, contentCountLimits: [{ sid: 'university', maxCount: 1 }, { sid: 'pandora_box', maxCount: 0 }], richness: resolveRichness(layers.settings.richness, EMPTY_TUNING),
      difficulty, guardTuning: EMPTY_TUNING.guards, zoneAnchorNode: terrain.zoneAnchorNode,
    }
    const artifactSids = new Set(collectArtifactSids(catalog))
    const copyState = (): PlacementState => ({ ...state, blocked: new Set(state.blocked), usedAnchors: new Set(state.usedAnchors), guardTileByNode: new Map(state.guardTileByNode), reservedGuardTiles: new Set(state.reservedGuardTiles) })
    // The unticked kinds are thrown away, so with only some kinds ticked the amount is raised by the share of the loop that is kept: ticking just
    // artifacts still gives about as many artifacts as the amount slider promises, not the artifact slice of the mixed total.
    let passDensity = layers.treasures.density
    if (layers.treasures.types.size < TREASURE_TYPES.length) {
      const probe = createZonePopulator({ ...populatorOptions, state: copyState() }).populateTreasure().placements.filter((p) => p.sid !== 'random-squad' && p.sid !== 'pandora_box')
      const kept = probe.filter((p) => layers.treasures?.types.has(treasureTypeOf(p.sid, artifactSids))).length
      passDensity *= Math.min(MAX_KIND_COMPENSATION, probe.length / Math.max(1, kept))
    }
    // Run on a scratch copy, keep the chosen kinds with the guards that stand beside them, and book only those into the real state.
    const result = createZonePopulator({ ...populatorOptions, treasureDensity: passDensity, state: copyState() }).populateTreasure()
    const objects = result.placements.filter((p) => p.sid !== 'random-squad')
    const near = (a: number, b: number): number => Math.max(Math.abs((a % sizeX) - (b % sizeX)), Math.abs(Math.floor(a / sizeX) - Math.floor(b / sizeX)))
    const wanted = layers.treasures.types
    // One decision per object (chosen kind; scroll boxes also only SCROLL_BOX_KEEP of the time; Pandora's boxes never), so its guard can follow it.
    const keepObject = new Map<ZonePlacement, boolean>(objects.map((o) => [o, o.sid !== 'pandora_box' && wanted.has(treasureTypeOf(o.sid, artifactSids)) && (!SCROLL_BOX_SIDS.has(o.sid) || rng() < SCROLL_BOX_KEEP)]))
    for (const o of objects) if (keepObject.get(o) && treasureTypeOf(o.sid, artifactSids) === 'resources' && rng() >= RESOURCE_GUARD_SHARE) unguardedResourceNodes.add(o.node)
    /** Whether the treasure object nearest to a guard is kept and may keep its guard (undefined: no treasure object close by). */
    const guardedObjectWanted = (node: number): boolean | undefined => {
      let best: ZonePlacement | undefined
      for (const o of objects) if (near(o.node, node) <= GUARD_TIE_RADIUS && (!best || near(o.node, node) < near(best.node, node))) best = o
      return best ? keepObject.get(best) === true && !unguardedResourceNodes.has(best.node) : undefined
    }
    let treasureCount = 0
    for (const p of result.placements) {
      const keep = p.sid === 'random-squad' ? guardedObjectWanted(p.node) ?? true : keepObject.get(p) === true
      if (!keep || !tryPlaceAt(p.sid, p.node, sizeX, sizeZ, catalogById, state)) continue
      const placed = { ...p, tempId: state.nextTempId++ }
      additions.push(placed)
      if (p.sid !== 'random-squad') newTreasure.push(placed)
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

  if (layers.rivers) {
    const wallNodes = new Set<number>()
    for (let node = 0; node < tileCount; node++) if (isElevationWallTile(node, sizeX, sizeZ, levels, climbs)) wallNodes.add(node)
    const river = carveRiversOnMap({
      sizeX, sizeZ, rng, catalog, catalogById, state, tileBiome: tiles, levels, climbs, waterNodes, wallNodes, roadNodes, riverNodes, count: layers.rivers.count,
    })
    riverChanges = river.changes
    additions.push(...river.placements)
    for (const node of riverNodes) { walkable.add(node); excluded.add(node); state.blocked.add(node) }
    added.rivers = river.tiles
  }

  const gateGuardTemplates: { node: number; overrides: NonNullable<ZonePlacement['randomSquadOverrides']> }[] = []
  if (borderSetup) {
    const { zoneIdByNode, zoneBiome, plan } = borderSetup
    const walls = wallZoneBorders({ sizeX, sizeZ, zoneIdByNode, zoneBiome, mapObjects: catalog.mapObjects, catalogById, state, rng, openNodes: excluded, plan })
    additions.push(...walls)
    added.borders = walls.length
    // A gate is a chokepoint on the way to everything past it: it gets a guard that is never easy, whatever its distance from a start.
    // An object already standing on the crossing's first tile (a walkable decoration) pushes the guard to the next tile of the gate.
    for (const candidates of plan.gates) {
      const node = candidates.find((c) => !state.usedAnchors.has(c))
      if (node === undefined) continue
      const label = distanceToStart(node) >= LETHAL_GATE_DISTANCE ? 'Lethal' : 'Impossible'
      const range = pickSquadRange([label], RMG_GUARD_DIFFICULTY_RANGES, RMG_GUARD_RANDOM_WEIGHTS, rng)
      const requestedValue = Math.min(GATE_GUARD_MAX_VALUE, Math.round(randomInRange(range.min, range.max, rng) * GATE_GUARD_SCALE * (baseDifficulty?.borderGuardMultiplier ?? 1)))
      const overrides = { requestedValue, fraction: sampleFraction(tiles[node] as BiomeId, 0.7, rng), weeklyIncrementBonus: baseDifficulty?.zoneGuardWeeklyIncrement }
      state.usedAnchors.add(node)
      additions.push({ tempId: state.nextTempId++, sid: 'random-squad', node, randomSquadOverrides: overrides })
      gateGuardTemplates.push({ node, overrides })
      added.borders++
    }
  }

  const deco = layers.decorations
  const sceneryTypes = deco ? DECORATION_TYPES.filter((type) => deco.types.has(type) && type !== 'animals' && type !== 'fx') : []
  if (deco && sceneryTypes.length > 0) {
    const scenery = scatterKeeping(state, (scratch) => scatterZoneObstacles({
      sizeX, sizeZ, zones: terrain.zones, centers: terrain.centers, tilesByZone: terrain.tilesByZone, zoneBiome: terrain.zoneBiome, catalogById,
      mapObjects: catalog.mapObjects, excludedNodes: excluded, state: scratch, rng, density: deco.density,
      crossBiomeChance: 1 - deco.biomePurity, allowHighContrastBiomes: deco.allowHighContrastBiomes, ownBiomeOnly: deco.biomePurity >= 1,
      levelsMap: levels, climbsMap: climbs, rmgEnvironmentAssets: catalog.rmgEnvironmentAssets, walkableNodes: walkable,
    }), (p) => deco.types.has(decorationTypeOf(p.sid, catalogById) as DecorationType), sizeX, sizeZ, catalogById)
    additions.push(...scenery)
    added.decorations = scenery.length
  }
  if (deco && (deco.types.has('animals') || deco.types.has('fx'))) {
    const fauna = scatterKeeping(state, (scratch) => scatterZoneFauna({
      sizeX, sizeZ, zones: terrain.zones, tilesByZone: terrain.tilesByZone, zoneBiome: terrain.zoneBiome, waterNodes, catalogById,
      mapObjects: catalog.mapObjects, excludedNodes: new Set([...roadNodes, ...riverNodes, ...(borderSetup?.plan.corridors ?? [])]), state: scratch, rng,
    }), (p) => deco.types.has(decorationTypeOf(p.sid, catalogById) as DecorationType), sizeX, sizeZ, catalogById)
    additions.push(...fauna)
    added.fauna = fauna.length
  }

  let newInteractables: ZonePlacement[] = []
  const inter = layers.interactables
  if (inter) {
    // Never Pandora's boxes, like the full generator (its reward is too strong); the interactables list does not exclude them.
    newInteractables = scatterZoneInteractables({
      sizeX, sizeZ, zones: placerZones, tilesByZone: awayFromStarts, catalogById, excludedNodes: excluded, state, rng, riverNodes,
      density: inter.density, disabledInteractableSids: new Set([...inter.disabledSids, 'pandora_box']), rarity: buildInteractableRarity(catalog),
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
    const decided = new Set<number>([...guardedByTreasure, ...unguardedResourceNodes])
    // A new treasure object counts as guarded only when a guard really stands beside it: the populator also decides "no guard" for some, and those get the roll below.
    const guardNodesNow = [...additions.filter((p) => p.sid === 'random-squad'), ...squads].map((g) => g.node)
    const cheb = (a: number, b: number): number => Math.max(Math.abs((a % sizeX) - (b % sizeX)), Math.abs(Math.floor(a / sizeX) - Math.floor(b / sizeX)))
    for (const o of newTreasure) if (guardNodesNow.some((g) => cheb(g, o.node) <= GUARDED_RADIUS)) decided.add(o.node)
    for (const o of ctx.placedObjects) {
      if (o.type !== 0 || !isGuardCandidate(o.sid, artifactSids)) continue
      if (!enc.guardExisting || isGuarded(o.node)) { decided.add(o.node); continue }
      existing.push({ tempId: state.nextTempId++, sid: o.sid, node: o.node })
    }
    const result = scatterProximityGuards({
      sizeX, sizeZ, placements: existing, depthOfNode: (node) => Math.floor(distanceToStart(node) / GUARD_DEPTH_STEP), zoneIdByNode: terrain.zoneIdByNode, zoneBiome: terrain.zoneBiome, zoneDistances: terrain.zoneDistances,
      playerZoneIds: terrain.zones.filter((z) => z.kind === 'player').map((z) => z.id), catalogById, catalog, objectVariety: 0.4,
      squadDensity: enc.density, state, rng, difficulty, guardTuning: EMPTY_TUNING.guards, decidedNodes: decided, laterPlacements: newInteractables,
    })
    additions.push(...result.guardPlacements)
    squads.push(...result.concreteSquads)
    added.encounters = result.guardPlacements.length + result.concreteSquads.length
    if (enc.density > 0 && newTreasure.length > 0) {
      const treasureGuards = scatterProximityGuards({
        sizeX, sizeZ, placements: newTreasure, depthOfNode: (node) => Math.floor(distanceToStart(node) / GUARD_DEPTH_STEP), zoneIdByNode: terrain.zoneIdByNode, zoneBiome: terrain.zoneBiome, zoneDistances: terrain.zoneDistances,
        playerZoneIds: [], catalogById, catalog, objectVariety: 0.4,
        squadDensity: TREASURE_GUARD_CHANCE, state, rng, difficulty, guardTuning: EMPTY_TUNING.guards, decidedNodes: decided,
      })
      additions.push(...treasureGuards.guardPlacements)
      squads.push(...treasureGuards.concreteSquads)
      added.encounters += treasureGuards.guardPlacements.length + treasureGuards.concreteSquads.length
    }
  }

  // Last word on the borders: walk the finished map like a hero and close every way between two zones that is still open (a gap the user left,
  // a crossing a later layer widened) with a wall plug, or with a gate-strength guard where nothing can be built.
  if (borderSetup && gateGuardTemplates.length > 0) {
    const { zoneIdByNode, zoneBiome, plan } = borderSetup
    const guardNodes = new Set<number>([
      ...ctx.placedObjects.filter((o) => o.type === 2 || (o.type === 0 && o.sid === 'random-squad')).map((o) => o.node),
      ...additions.filter((p) => p.sid === 'random-squad').map((p) => p.node),
      ...squads.map((s) => s.node),
    ])
    // Roads and rivers are in the blocked set so nothing is built on them, but a hero walks them.
    const blocked = new Set(state.blocked)
    for (const node of [...roadNodes, ...riverNodes]) blocked.delete(node)
    const leaks = closeBorderLeaks({
      sizeX, sizeZ, zoneIdByNode, zoneBiome, mapObjects: catalog.mapObjects, catalogById, blocked, guardNodes, importantNodes: new Set(state.usedAnchors),
      keepOpen: new Set([...roadNodes, ...riverNodes, ...plan.corridors]), guardTemplates: gateGuardTemplates, state, rng,
    })
    additions.push(...leaks.plugs, ...leaks.guards)
    added.borders += leaks.plugs.length + leaks.guards.length
  }

  // Commit onto a copy of the container: tile layers first, then objects, then the concrete squads (their own entity type).
  let block1 = container.chunks[0]
  let block2 = container.chunks[1]
  if (terrainChanges.length > 0) block2 = paintTerrainTiles(block2, terrainChanges)
  if (waterChanges.length > 0) block2 = paintWaterTiles(block2, waterChanges)
  if (levelChanges.length > 0) block2 = paintLevelTiles(block2, levelChanges)
  if (climbChanges.length > 0) block2 = paintClimbTiles(block2, climbChanges)
  if (roadChanges.length > 0) block2 = paintRoadTiles(block2, roadChanges)
  if (riverChanges.length > 0) block2 = paintRiverTiles(block2, riverChanges)
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
  const committed: MapContainer = { ...container, chunks }

  // The same placement auto-fix the full generator ends with (bounds, entrances, reachability, overlaps), but it may only move or remove what was just
  // generated: the user's own objects stay where they are.
  const before = new Set(ctx.placedObjects.map((o) => o.key))
  const fresh = new Set(extractMapContext(containerToRawBlocks(committed)).placedObjects.map((o) => o.key).filter((key) => !before.has(key)))
  const knownIssues = new Set(findMapValidationIssues(ctx, catalog).map((issue) => i18n.t('validate.map.unresolved', { issue: describeMapValidationIssue(issue) })))
  const fixedResult = runPlacementAutoFix(committed, catalog, { mayChange: (type, id) => fresh.has(`${type}:${id}`), fixElevation: !!layers.elevation })
  return { container: fixedResult.fixed, added, warnings: fixedResult.warnings.filter((w) => !knownIssues.has(w)) }
}
