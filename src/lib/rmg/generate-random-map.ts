// ─── Random Map Generator — Milestone 3 (issue #210) ────────────────────────
// Builds on Milestone 2's economy/roads/rivers/obstacles with the
// "practical parity items" split out from the original Milestone 3 (see
// issue #210, 2026-09-03 — Penrose tiling + Fruchterman-Reingold layout
// optimization moved to a new Milestone 4 instead):
//
// - Town/faction matching: a player zone's city-spawner gets a real,
//   zone-biome-matched faction (propCities.factionSid/isDefined:true) —
//   previously left "unconfigured" like a freshly Add-object-ed one, an
//   editor-tolerated state CLAUDE.md's own "hard-won lessons" flag as never
//   proven at real game runtime (every real shipped map's own player-start
//   spawners are always fully configured before release).
// - `areas[]` recomputation (zone-areas.ts): each zone becomes a real
//   region (nodes/neighbors/biome), replacing `buildBlankMap`'s single
//   whole-map placeholder — a known, previously-flagged gap.
// - Water features (zone-water.ts): modest in-zone lakes for a subset of
//   neutral zones, real per real-sample-map convention (level -1 +
//   waterMap), routed through the SAME accessibility pass so a lake can
//   never silently seal off a real target.
//
// Still no Penrose-tiling zone shapes, Fruchterman-Reingold layout
// optimization, or a real RMG template JSON format/authoring UI beyond
// today's size/player-count dialog — those are Milestones 4/5 (issue #210).

import {
  addObjectInstances,
  buildBlankMap,
  paintLevelTiles,
  paintRiverTiles,
  paintRoadTiles,
  paintTerrainTiles,
  paintWaterTiles,
  setAreas,
  setCityFaction,
  BLANK_MAP_BIOME_NAMES,
  type BlankMapPlayer,
  type MapContainer,
} from '@/lib/map-write'
import { computeFootprintTiles } from '@/lib/map-grid/footprint'
import { classifyRiverNode, deriveRealShapeCode } from '@/lib/map-grid/river-shape'
import { BIOME_FACTION } from '@/lib/map-grid/squad-pool'
import type { CatalogMapObject, GameCatalog } from '@/lib/catalog/types'
import { applyAccessibilityPass, type ObjectPlacementGroup } from '@/lib/h3-import/accessibility-pass'
import { logWarn } from '@/lib/logger'
import { buildZoneGraph, zoneDistanceMatrix } from './zone-graph'
import { assignTilesToZones, layoutZoneCenters, type ZoneCenter } from './zone-layout'
import { assignZoneBiomes, createPlacementState, populateZones, ZONE_BIOMES, type ZonePlacement } from './zone-population'
import { scatterZoneObstacles } from './zone-decoration'
import { shortestPath } from './zone-connections'
import { buildObjectLogicsIndex } from './value-model'
import { computeZoneAreas } from './zone-areas'
import { scatterZoneWater } from './zone-water'

export interface GenerateRandomMapOptions {
  sizeX: number
  sizeZ: number
  playerCount: number
  playerSpawnerSid: 'city-spawner' | 'hero-spawner'
  /** 0-1 chance any given eligible neutral zone gets a lake (zone-water.ts). Defaults to that module's own default. */
  waterChance?: number
  /** 0-1 fraction of each zone's own tiles considered for obstacle scattering (zone-decoration.ts). Defaults to that module's own default. */
  obstacleDensity?: number
  /** Multiplier on neutral-zone treasure-pile count (zone-population.ts). Defaults to 1. */
  treasureDensity?: number
  /** Injectable for deterministic tests, or a template's fixed seed (see template.ts's `createSeededRng`); defaults to `Math.random`. */
  rng?: () => number
}

/** The tile within `tiles` closest to `(cx, cz)` — used to pick each zone's
 *  own real "anchor" tile (player spawn node, or a neutral zone's road/river
 *  endpoint) from its own Voronoi-assigned tiles, since a zone's raw layout
 *  center coordinate can itself belong to a neighboring zone at a
 *  boundary. */
function nearestTile(tiles: number[], sizeX: number, center: ZoneCenter): number {
  let best = tiles[0]
  let bestDist = Infinity
  for (const node of tiles) {
    const x = node % sizeX
    const z = Math.floor(node / sizeX)
    const dist = (x - center.x) ** 2 + (z - center.z) ** 2
    if (dist < bestDist) { bestDist = dist; best = node }
  }
  return best
}

/**
 * Build a brand-new random `.map` container from `template` (expected to be
 * `template.map`'s already-parsed container, exactly like `buildBlankMap`
 * itself expects — see `create-map.ts` for where that's read) and a loaded
 * `GameCatalog` (needed for real object footprints — mines/dwellings are
 * 3×3 real map objects, not 1-tile placeholders, so placement must know
 * their actual solid cells to avoid overlap).
 */
export function generateRandomMap(template: MapContainer, catalog: GameCatalog, options: GenerateRandomMapOptions): MapContainer {
  const { sizeX, sizeZ, playerCount, playerSpawnerSid, waterChance, obstacleDensity, treasureDensity, rng = Math.random } = options
  const tileCount = sizeX * sizeZ
  const catalogById = new Map<string, CatalogMapObject>(catalog.mapObjects.map((o) => [o.id, o]))
  const objectLogicsById = buildObjectLogicsIndex(catalog)

  const graph = buildZoneGraph(playerCount)
  // buildZoneGraph's own doc comment claims every ring it builds is fully
  // connected by construction — verified here via the real Dijkstra
  // distance graph (issue #210's own research notes) rather than trusted
  // blindly, since zone-layout.ts's BFS-order placement silently produces a
  // nonsensical layout (not a loud failure) if that claim were ever wrong.
  const zoneDistances = zoneDistanceMatrix(graph)
  if (zoneDistances.some((row) => row.some((d) => !Number.isFinite(d)))) {
    throw new Error('RMG zone graph is disconnected — buildZoneGraph should never produce this')
  }

  const centers = layoutZoneCenters(sizeX, sizeZ, graph)
  const { zoneIdByNode, tilesByZone } = assignTilesToZones(sizeX, sizeZ, centers, graph.zones)
  const zoneBiome = assignZoneBiomes(graph.zones)

  // Every zone's own real anchor tile — a player zone's spawn point, and
  // every zone's own road/river endpoint (zone-connections.ts below).
  const zoneAnchorNode = new Map<number, number>()
  for (const zone of graph.zones) {
    const tiles = tilesByZone.get(zone.id) ?? []
    const center = centers[zone.id]
    zoneAnchorNode.set(zone.id, tiles.length > 0 ? nearestTile(tiles, sizeX, center) : center.z * sizeX + center.x)
  }

  const players: BlankMapPlayer[] = graph.zones
    .filter((zone) => zone.kind === 'player')
    .map((zone) => ({ sid: playerSpawnerSid, node: zoneAnchorNode.get(zone.id) as number }))

  let container = buildBlankMap(template, { sizeX, sizeZ, biomeId: ZONE_BIOMES[0], players })

  // Overwrite the uniform fill from buildBlankMap with each zone's own
  // biome — one bulk pass, same paintTerrainTiles bulk writer the Terrain
  // brush/bucket-fill use.
  const terrainChanges: { node: number; biomeId: number }[] = new Array(tileCount)
  for (let node = 0; node < tileCount; node++) {
    terrainChanges[node] = { node, biomeId: zoneBiome.get(zoneIdByNode[node]) ?? ZONE_BIOMES[0] }
  }
  let block2 = paintTerrainTiles(container.chunks[1], terrainChanges)

  // Seed the collision state with the player spawners just placed, so every
  // later placement pass (mines/dwellings/guards, then obstacles) never
  // overlaps one.
  const seedBlocked = new Set<number>()
  const seedAnchors = new Set<number>()
  const spawnerGroup: ObjectPlacementGroup = { ids: [], nodes: [], rotations: [], levels: [] }
  const spawnerTemplate = catalogById.get(playerSpawnerSid)
  players.forEach((p, i) => {
    spawnerGroup.ids.push(i)
    spawnerGroup.nodes.push(p.node)
    spawnerGroup.rotations.push(0)
    spawnerGroup.levels.push(0)
    seedAnchors.add(p.node)
    for (const cell of computeFootprintTiles(spawnerTemplate, p.node % sizeX, Math.floor(p.node / sizeX))) {
      if (cell.value === 1) seedBlocked.add(cell.z * sizeX + cell.x)
    }
  })
  const state = createPlacementState(seedBlocked, seedAnchors)

  const placements = populateZones({
    sizeX, sizeZ, zones: graph.zones, tilesByZone, zoneBiome, catalogById, objectLogicsById, state, rng, treasureDensity,
  })
  const skippedScatter = graph.zones.length * 3 - placements.length // populateZones' own minimum per-zone attempt count (player zones attempt exactly 3; neutral zones attempt 3 + extra treasure piles, which count as bonus, not a shortfall)
  if (skippedScatter > 0) {
    logWarn(`Random map generation: ${skippedScatter} scatter object(s) skipped — no free tile found in a crowded zone`)
  }

  // Roads — one per zone-graph edge, connecting each pair's own anchor
  // tiles, routed around whatever's already placed (buildZoneGraph's ring
  // guarantees the underlying zone graph is connected; a specific road can
  // still fail to route around a crowded zone's own objects, which is why
  // this is a real BFS search with a real "not found" case, not an
  // assumed-successful straight line).
  const roadNodes = new Set<number>()
  for (const [a, b] of graph.edges) {
    const path = shortestPath(sizeX, sizeZ, zoneAnchorNode.get(a) as number, zoneAnchorNode.get(b) as number, state.blocked)
    if (path) for (const node of path) roadNodes.add(node)
  }
  if (roadNodes.size > 0) {
    block2 = paintRoadTiles(block2, [...roadNodes].map((node) => ({ node, roadId: 1 })))
  }

  // One river across the map's most graph-distant zone pair — a real
  // BFS path (same pathfinding as roads), then the real per-node
  // connectivity-bitmask shape codes river-shape.ts derives from actual
  // sample-map data, not a guessed texture id.
  let riverNodes = new Set<number>()
  let bestDistance = -1
  let riverEndpoints: [number, number] | null = null
  for (let a = 0; a < graph.zones.length; a++) {
    for (let b = a + 1; b < graph.zones.length; b++) {
      if (zoneDistances[a][b] > bestDistance) { bestDistance = zoneDistances[a][b]; riverEndpoints = [a, b] }
    }
  }
  if (riverEndpoints) {
    const [a, b] = riverEndpoints
    const path = shortestPath(sizeX, sizeZ, zoneAnchorNode.get(a) as number, zoneAnchorNode.get(b) as number, state.blocked)
    if (path && path.length > 1) {
      riverNodes = new Set(path)
      const changes = path.map((node) => {
        const { dirs } = classifyRiverNode(node, riverNodes, sizeX, sizeZ)
        return { node, s: deriveRealShapeCode(dirs) }
      })
      block2 = paintRiverTiles(block2, changes)
    }
  }

  // Water — modest in-zone lakes for a subset of neutral zones (see
  // zone-water.ts's own header comment for why this stops short of true
  // separate water zones/islands). Shares the same collision state so
  // nothing else can ever land on a lake, before or after this point.
  const waterResult = scatterZoneWater({
    sizeX, sizeZ, zones: graph.zones, tilesByZone,
    excludedNodes: new Set([...roadNodes, ...riverNodes]),
    blocked: state.blocked, usedAnchors: state.usedAnchors, rng, chance: waterChance,
  })
  if (waterResult.waterChanges.length > 0) {
    block2 = paintWaterTiles(block2, waterResult.waterChanges)
    block2 = paintLevelTiles(block2, waterResult.levelChanges)
    for (const node of waterResult.waterNodes) {
      state.blocked.add(node)
      state.usedAnchors.add(node)
    }
  }
  const levelsMapFinal = new Array(tileCount).fill(0)
  const waterMapFinal = new Array(tileCount).fill(0)
  for (const { node, waterId } of waterResult.waterChanges) waterMapFinal[node] = waterId
  for (const { node, level } of waterResult.levelChanges) levelsMapFinal[node] = level

  // Obstacle scattering — fills whatever each zone has left over, sharing
  // the same collision state so it never overlaps a real object, a road,
  // the river, or a lake.
  const obstaclePlacements = scatterZoneObstacles({
    sizeX, sizeZ, zones: graph.zones, centers, tilesByZone, zoneBiome, catalogById,
    mapObjects: catalog.mapObjects, excludedNodes: new Set([...roadNodes, ...riverNodes, ...waterResult.waterNodes]), state, rng,
    density: obstacleDensity,
  })

  // Reachability guarantee (issue #210's "connectivity-guaranteeing terrain
  // carving" milestone item) — reuses the H3-import accessibility pass
  // verbatim rather than inventing a second flood-fill repair algorithm.
  // Obstacle placements are marked decorative (deletable if they seal off a
  // real target); every dwelling/mine/guard/item/spawner is not, so the
  // pass can only ever nudge one of those, never delete it.
  const objectGroups = new Map<string, ObjectPlacementGroup>([[playerSpawnerSid, spawnerGroup]])
  const tempIdToPlacement = new Map<number, ZonePlacement>()
  const decorativeIds = new Set<number>()
  for (const placement of [...placements, ...obstaclePlacements]) {
    tempIdToPlacement.set(placement.tempId, placement)
    let group = objectGroups.get(placement.sid)
    if (!group) { group = { ids: [], nodes: [], rotations: [], levels: [] }; objectGroups.set(placement.sid, group) }
    group.ids.push(placement.tempId)
    group.nodes.push(placement.node)
    group.rotations.push(0)
    group.levels.push(0)
  }
  for (const placement of obstaclePlacements) decorativeIds.add(placement.tempId)

  const report = applyAccessibilityPass(
    objectGroups,
    sizeX,
    sizeZ,
    { levelsMap: levelsMapFinal, climbsMap: new Array(tileCount).fill(0), waterMap: waterMapFinal },
    catalog,
    catalogById,
    decorativeIds,
    new Map(),
    new Set(),
  )
  if (report.stillUnreachable > 0) {
    logWarn(`Random map generation: ${report.stillUnreachable} placed object(s) remained unreachable after the accessibility pass`)
  }

  const additions: { sid: string; node: number; randomSquadOverrides?: { requestedValue: number; fraction: string } }[] = []
  for (const [sid, group] of objectGroups) {
    if (sid === playerSpawnerSid) continue // already committed to the container by buildBlankMap
    for (let i = 0; i < group.ids.length; i++) {
      const placement = tempIdToPlacement.get(group.ids[i])
      if (!placement) continue
      additions.push({ sid, node: group.nodes[i], randomSquadOverrides: placement.randomSquadOverrides })
    }
  }

  const { block2Chunk } = addObjectInstances(block2, additions)
  let finalBlock1 = container.chunks[0]
  let finalBlock2 = block2Chunk

  // Town/faction matching — a player zone's own biome determines its
  // city-spawner's real faction, rather than leaving it unconfigured.
  // hero-spawner has no equivalent (picking a specific real hero identity
  // needs a hero-catalog lookup this milestone doesn't attempt — CLAUDE.md
  // already documents "random" as GME's own real default for an
  // unconfigured hero-spawner, unlike city-spawner's unconfigured state).
  const playerZoneIndex = new Map<number, number>()
  {
    let index = 0
    for (const zone of graph.zones) {
      if (zone.kind !== 'player') continue
      playerZoneIndex.set(zone.id, index)
      index += 1
    }
  }
  if (playerSpawnerSid === 'city-spawner') {
    for (const [zoneId, playerId] of playerZoneIndex) {
      const biome = zoneBiome.get(zoneId) ?? ZONE_BIOMES[0]
      const faction = BIOME_FACTION[biome]
      if (!faction) continue
      const result = setCityFaction(finalBlock1, finalBlock2, 0, playerId, faction)
      finalBlock1 = result.block1Chunk
      finalBlock2 = result.block2Chunk
    }
  }

  // areas[] recomputation — each zone becomes a real region (issue #210's
  // own flagged gap), replacing buildBlankMap's single whole-map
  // placeholder. Player zones get their own spawner as `keyObjectId` (a
  // real, already-known id — buildBlankMap assigns city/hero-spawner ids
  // 0..playerCount-1 in player order); neutral zones stay -1 rather than
  // chase a specific placed object's id through the accessibility pass's
  // own possible nudges (see zone-areas.ts's own doc comment on how
  // sparse real `keyObjectId` usage already is).
  const zoneBiomeName = new Map<number, string>()
  for (const [zoneId, biomeId] of zoneBiome) zoneBiomeName.set(zoneId, BLANK_MAP_BIOME_NAMES[biomeId] ?? 'Grass')
  const areas = computeZoneAreas(sizeX, sizeZ, zoneIdByNode, tilesByZone, zoneAnchorNode, zoneBiomeName, playerZoneIndex)
  finalBlock2 = setAreas(finalBlock2, areas)

  const finalChunks = container.chunks.slice()
  finalChunks[0] = finalBlock1
  finalChunks[1] = finalBlock2
  return { ...container, chunks: finalChunks }
}
