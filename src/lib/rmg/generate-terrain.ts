// ─── RMG terrain generation — extracted for reuse (issue #210) ──────────────
// A real user request: a "live terrain preview" the user can tweak sliders
// against before committing to the rest of generation, plus a "terrain
// only" final mode for a map maker who wants the random fractal terrain but
// places everything else by hand. Both need the exact same zone-graph/
// layout/Penrose-tiling/biome logic `generate-random-map.ts` already had
// inlined as its own first phase — extracted here so there is ONE real
// implementation, not two, and a preview's terrain is byte-identical to
// what a real generation with the same seed/options produces.
//
// Confirmed via direct inspection: none of zone-graph.ts/zone-layout.ts/
// zone-shape-penrose.ts/zone-water.ts/zone-islands.ts import anything from
// `@/lib/catalog/*` — this whole phase needs only `catalogById` for the
// player-spawner sid's own footprint (to seed collision state), nothing
// else about a loaded GameCatalog. It's also fully deterministic given the
// injected `rng` (no other randomness anywhere in this phase), so the same
// seed reproduces byte-identical zone shapes/biomes every time.
//
// `computeWater` is a real, deliberate design choice, not an oversight:
// `zone-water.ts`'s `scatterZoneWater` treats `blocked`/`usedAnchors` as an
// ELIGIBILITY FILTER (a lake can't grow over an already-blocked tile) — in
// the real full pipeline, water is computed AFTER object population
// specifically so lakes avoid overlapping a real mine/dwelling/guard
// (confirmed by reading `zone-water.ts` directly). Computing water here
// instead — before any object exists — would flip that avoidance direction
// (objects would end up avoiding water instead of water avoiding objects),
// which risks crowding out real content in heavily-watered zones despite
// not being technically broken (whichever runs second still avoids the
// first via the shared `state.blocked`). To avoid that quality risk for
// real generations, `generate-random-map.ts`'s own call into this function
// passes `computeWater: false` and keeps computing water itself at its
// existing point in the sequence, completely unchanged. `computeWater: true`
// is only used by the terrain-only final mode and the live-preview's
// terrain phase — both have zero objects to avoid at this point anyway, so
// there's no discrepancy to worry about there. This is also why water
// (unlike zone shape/biome) is NOT guaranteed pixel-identical between a
// live preview and an eventual full generation — the full pipeline's real
// water avoids real objects the preview never had.

import {
  buildBlankMap,
  paintLevelTiles,
  paintTerrainTiles,
  paintWaterTiles,
  BLANK_MAP_BIOME_NAMES,
  type BlankMapPlayer,
  type MapContainer,
} from '@/lib/map-write'
import { computeFootprintTiles } from '@/lib/map-grid/footprint'
import type { BiomeId } from '@/lib/map-grid/terrain-colors'
import type { CatalogMapObject } from '@/lib/catalog/types'
import { buildZoneGraph, zoneDistanceMatrix, type ZoneGraph } from './zone-graph'
import { importGameTemplateTopology, deriveWaterOverrides, type ZoneLayoutOverrides } from './rmg-template-import'
import { layoutZoneCenters, nearestTile, relaxZoneCenters, type ZoneCenter } from './zone-layout'
import { assignTilesToZonesPenrose } from './zone-shape-penrose'
import { assignZoneBiomes, createPlacementState, ZONE_BIOMES, type PlacementState } from './zone-population'
import { computeIslandZones } from './zone-islands'
import { scatterZoneWater } from './zone-water'

export { BLANK_MAP_BIOME_NAMES }

/** `zoneJaggedness`'s 0-1 UI range onto zone-shape-penrose.ts's real `scale`
 *  parameter — see `generate-random-map.ts`'s own copy of this before the
 *  extraction for the full doc comment; kept identical here since both
 *  files need it and it's a one-line pure function, not worth a shared
 *  third module for. */
export function jaggednessToPenroseScale(jaggedness: number): number {
  return 7 - jaggedness * 6
}

export interface GenerateTerrainOptions {
  sizeX: number
  sizeZ: number
  playerCount: number
  waterContent?: 'none' | 'normal' | 'islands'
  waterChance?: number
  zoneJaggedness?: number
  zoneSpread?: number
  rng?: () => number
  /** A real user request: override `zone-islands.ts`'s own default (every
   *  player's own start stays land-connected, only neutral "treasure"
   *  zones become islands) so a player's own start can be an island too —
   *  "the whole map looks like it was flooded, then random-sized islands
   *  spread around" instead of a mostly-solid mainland with a few carved-
   *  out neutral islands. `waterChance` ("Island amount") still controls
   *  ISLAND COUNT the same way either way (more = more islands) — this
   *  only widens which zones are ELIGIBLE to become one; per-island SIZE
   *  is `islandLandRatio`'s own, independent concern (see its doc comment).
   *  At `waterChance` 1 (100%), every eligible zone — including every
   *  player's own start once this is on — becomes an island, leaving no
   *  "mainland" at all; connectivity still holds because
   *  generate-random-map.ts's own road loop places one portal per
   *  island-touching zone-graph edge rather than routing every island to
   *  some nearest non-island zone. Defaults to false (today's original
   *  behavior). */
  islandsIncludePlayerZones?: boolean
  /** `'islands'` mode only — a real user request to decouple "how many
   *  islands" (`waterChance`) from "how big is each one." 0 = mostly
   *  water, each island small ("dead space" ocean with small islands
   *  dotted around — this mode's original, still-default look); 1 = mostly
   *  land, each island large (little open water beyond a thin moat).
   *  Maps directly onto `computeIslandZones`'s own `landmassFraction`
   *  param (the fraction of each chosen zone's own tile pool that stays
   *  land) — previously derived from `waterChance` itself
   *  (`0.6 - waterChance * 0.4`), which meant there was no way to have
   *  MANY small islands or a FEW large ones independently of each other;
   *  now genuinely independent. Defaults to 0.4, close to that old
   *  formula's own default-`waterChance` result, so a template that never
   *  sets this explicitly still looks like it did before this option
   *  existed. */
  islandLandRatio?: number
  /** false for the "terrain only" final mode (no spawners at all — the map
   *  maker places everything themselves) and for the real generator's own
   *  initial phase when its own `terrainOnly` option is set; true for the
   *  live-preview flow (spawners are needed for the roads-preview phase
   *  and for a subsequent full generation to continue from) and for the
   *  real generator's own normal (non-terrain-only) initial phase. */
  includeSpawners: boolean
  /** Required when `includeSpawners` is true. */
  playerSpawnerSid?: 'city-spawner' | 'hero-spawner'
  /** See this file's own header comment on why this defaults to false and
   *  why the real full-pipeline generator deliberately passes false. */
  computeWater?: boolean
  /** Which of the 7 real biomes generation may use at all (template.ts's
   *  own doc comment has the full rationale). Defaults to all 7. */
  enabledBiomes?: BiomeId[]
  /** Raw JSON text of a real game RMG template (`maps/templates/*.rmg.json`
   *  shape — issue #210, Stage 1) — when set, its own zone/connection
   *  topology REPLACES `buildZoneGraph`'s fixed ring entirely (`playerCount`
   *  is then derived from the template's own Spawn zones, not this option).
   *  See rmg-template-import.ts's own header comment for exactly what's
   *  imported (topology only — biome/water/decoration/population all still
   *  run as this generator's own logic on top of the imported shape). */
  gameTemplateJson?: string
}

export interface TerrainResult {
  sizeX: number
  sizeZ: number
  /** Terrain-painted (and, if `computeWater`, water/level-painted) —
   *  spawners already committed by `buildBlankMap` if `includeSpawners`. */
  container: MapContainer
  graph: ZoneGraph
  zoneDistances: number[][]
  centers: ZoneCenter[]
  zoneIdByNode: number[]
  /** Shrunk to each island's own landmass for `waterContent: 'islands'`. */
  tilesByZone: Map<number, number[]>
  zoneBiome: Map<number, BiomeId>
  zoneAnchorNode: Map<number, number>
  /** Only populated for `waterContent: 'islands'` — each island zone's own
   *  shrunk landmass tile list, needed by the real generator's own
   *  portal-placement pass (not run here — see header comment). */
  islandLandmassByZone: Map<number, number[]>
  /** Every tile outside an island zone's own landmass, not yet painted as
   *  water unless `computeWater` — the real generator floods these itself
   *  at its own existing point in the sequence when `computeWater` is
   *  false. */
  islandFloodNodes: Set<number>
  players: BlankMapPlayer[]
  /** Seeded from spawner footprints (if `includeSpawners`) and, if
   *  `computeWater`, water tiles too. */
  state: PlacementState
  waterNodesAll: Set<number>
  waterMapFinal: number[]
  levelsMapFinal: number[]
  /** Zone-graph edge keys (`"${min}:${max}"`) a Stage 1 game-template import
   *  declared as `connectionType: "Portal"` — the road loop
   *  (generate-random-map.ts) treats these as portals unconditionally,
   *  independent of island detection. Empty when no template was
   *  imported. */
  portalEdges: Set<string>
  /** Zone-graph edge keys that exist for connectivity only and should
   *  never be painted as a road or portal (rmg-template-import.ts's own
   *  header comment). Empty when no template was imported. */
  unpaintedEdges: Set<string>
  /** Per-zone terrain-shape overrides from a Stage 1 game-template import
   *  (Stage 3a/3c — rmg-template-import.ts's own `ZoneLayoutOverrides` doc
   *  comment). Empty when no template was imported. */
  zoneLayoutByZoneId: Map<number, ZoneLayoutOverrides>
}

/**
 * Zone graph → Fruchterman-Reingold layout → Penrose-tiling zone shaping →
 * biome assignment → (optional) water — the fully catalog-independent,
 * deterministic, cheap phase of random map generation. See this file's own
 * header comment for why water is gated behind `computeWater` rather than
 * always computed here.
 */
export function generateTerrain(
  template: MapContainer,
  catalogById: Map<string, CatalogMapObject>,
  options: GenerateTerrainOptions,
): TerrainResult {
  const {
    sizeX, sizeZ, playerCount, waterContent = 'normal', waterChance = 0.4,
    zoneJaggedness = 0.5, zoneSpread = 1, rng = Math.random,
    islandsIncludePlayerZones = false, islandLandRatio = 0.4, includeSpawners, playerSpawnerSid, computeWater = false,
    enabledBiomes, gameTemplateJson,
  } = options
  const tileCount = sizeX * sizeZ

  const importedTopology = gameTemplateJson ? importGameTemplateTopology(gameTemplateJson, rng) : null
  const graph = importedTopology ? importedTopology.graph : buildZoneGraph(playerCount)
  const portalEdges = importedTopology?.portalEdges ?? new Set<string>()
  const unpaintedEdges = importedTopology?.unpaintedEdges ?? new Set<string>()
  const zoneLayoutByZoneId = importedTopology?.zoneLayoutByZoneId ?? new Map<number, ZoneLayoutOverrides>()
  const zoneDistances = zoneDistanceMatrix(graph)
  if (zoneDistances.some((row) => row.some((d) => !Number.isFinite(d)))) {
    throw new Error(importedTopology
      ? 'RMG game template graph is disconnected — its own zones/connections do not form a single connected graph'
      : 'RMG zone graph is disconnected — buildZoneGraph should never produce this')
  }

  const centers = relaxZoneCenters(sizeX, sizeZ, graph, layoutZoneCenters(sizeX, sizeZ, graph), rng, 300, zoneSpread)
  const { zoneIdByNode, tilesByZone } = assignTilesToZonesPenrose(sizeX, sizeZ, centers, graph.zones, rng, jaggednessToPenroseScale(zoneJaggedness))
  const zoneBiome = assignZoneBiomes(graph.zones, rng, enabledBiomes)

  let islandFloodNodes = new Set<number>()
  const islandLandmassByZone = new Map<number, number[]>()
  if (waterContent === 'islands') {
    // "Island amount" is a real 0-100% of the eligible zones — at 100% (
    // `waterChance` 1), EVERY eligible zone becomes an island, including
    // every player's own start once `islandsIncludePlayerZones` is on (no
    // "always leave one non-island mainland" cap here: generate-random-
    // map.ts's own road loop places one portal per island-touching
    // zone-graph edge, so full connectivity holds via portals even when
    // nothing is left non-island at all — see that loop's own comment).
    const eligibleZoneCount = islandsIncludePlayerZones ? graph.zones.length : graph.zones.filter((z) => z.kind === 'neutral').length
    const maxIslands = Math.max(1, Math.round(eligibleZoneCount * waterChance))
    const islandResult = computeIslandZones(sizeX, sizeZ, graph.zones, tilesByZone, centers, rng, maxIslands, islandLandRatio, islandsIncludePlayerZones)
    for (const [zoneId, landmass] of islandResult.landmassByZone) {
      tilesByZone.set(zoneId, landmass)
      islandLandmassByZone.set(zoneId, landmass)
    }
    islandFloodNodes = islandResult.floodNodes
  }

  const zoneAnchorNode = new Map<number, number>()
  for (const zone of graph.zones) {
    const tiles = tilesByZone.get(zone.id) ?? []
    const center = centers[zone.id]
    zoneAnchorNode.set(zone.id, tiles.length > 0 ? nearestTile(tiles, sizeX, center) : center.z * sizeX + center.x)
  }

  // Sorted by `playerIndex` rather than relied on array order — `buildZoneGraph`'s
  // own ring happens to already list player zones in ascending order, but a
  // real imported game-template's own zones[] array has no such guarantee
  // (Stage 1, rmg-template-import.ts), and `buildBlankMap`'s own player
  // slots are assigned strictly by THIS array's order (owner 1, 2, 3...).
  const players: BlankMapPlayer[] = includeSpawners
    ? graph.zones
        .filter((zone) => zone.kind === 'player')
        .sort((a, b) => (a.playerIndex ?? 0) - (b.playerIndex ?? 0))
        .map((zone) => ({ sid: playerSpawnerSid as 'city-spawner' | 'hero-spawner', node: zoneAnchorNode.get(zone.id) as number }))
    : []

  let container = buildBlankMap(template, { sizeX, sizeZ, biomeId: ZONE_BIOMES[0], players })

  const terrainChanges: { node: number; biomeId: number }[] = new Array(tileCount)
  for (let node = 0; node < tileCount; node++) {
    terrainChanges[node] = { node, biomeId: zoneBiome.get(zoneIdByNode[node]) ?? ZONE_BIOMES[0] }
  }
  let block2 = paintTerrainTiles(container.chunks[1], terrainChanges)

  const seedBlocked = new Set<number>()
  const seedAnchors = new Set<number>()
  if (includeSpawners && playerSpawnerSid) {
    const spawnerTemplate = catalogById.get(playerSpawnerSid)
    for (const p of players) {
      seedAnchors.add(p.node)
      for (const cell of computeFootprintTiles(spawnerTemplate, p.node % sizeX, Math.floor(p.node / sizeX))) {
        if (cell.value === 1) seedBlocked.add(cell.z * sizeX + cell.x)
      }
    }
  }
  const state = createPlacementState(seedBlocked, seedAnchors)

  let waterNodesAll = new Set<number>()
  let waterChangesAll: { node: number; waterId: number }[] = []
  let levelChangesAll: { node: number; level: number }[] = []
  if (computeWater) {
    if (waterContent === 'normal') {
      const { chanceByZone, minSizeByZone } = deriveWaterOverrides(zoneLayoutByZoneId)
      const waterResult = scatterZoneWater({
        sizeX, sizeZ, zones: graph.zones, tilesByZone,
        excludedNodes: new Set(zoneAnchorNode.values()),
        blocked: state.blocked, usedAnchors: state.usedAnchors, rng, chance: waterChance,
        chanceByZone, minSizeByZone,
      })
      waterNodesAll = waterResult.waterNodes
      waterChangesAll = waterResult.waterChanges
      levelChangesAll = waterResult.levelChanges
    } else if (waterContent === 'islands') {
      for (const node of islandFloodNodes) {
        waterNodesAll.add(node)
        waterChangesAll.push({ node, waterId: 1 })
        levelChangesAll.push({ node, level: -1 })
      }
    }
  }

  if (waterChangesAll.length > 0) {
    block2 = paintWaterTiles(block2, waterChangesAll)
    block2 = paintLevelTiles(block2, levelChangesAll)
    for (const node of waterNodesAll) {
      state.blocked.add(node)
      state.usedAnchors.add(node)
    }
  }
  const levelsMapFinal = new Array(tileCount).fill(0)
  const waterMapFinal = new Array(tileCount).fill(0)
  for (const { node, waterId } of waterChangesAll) waterMapFinal[node] = waterId
  for (const { node, level } of levelChangesAll) levelsMapFinal[node] = level

  const finalChunks = container.chunks.slice()
  finalChunks[1] = block2
  container = { ...container, chunks: finalChunks }

  return {
    sizeX, sizeZ, container, graph, zoneDistances, centers, zoneIdByNode, tilesByZone, zoneBiome,
    zoneAnchorNode, islandLandmassByZone, islandFloodNodes, players, state,
    waterNodesAll, waterMapFinal, levelsMapFinal, portalEdges, unpaintedEdges, zoneLayoutByZoneId,
  }
}
