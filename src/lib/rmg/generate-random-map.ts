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
// - Water features (zone-water.ts/zone-islands.ts): modest in-zone lakes,
//   or fully water-locked "island" zones reconnected by a portal, per real
//   sample-map convention (level -1 + waterMap), routed through the SAME
//   accessibility pass so water can never silently seal off a real target.
//   Water is placed BEFORE roads/rivers (not after) specifically so their
//   own pathfinding already treats it as blocked — confirmed the hard way:
//   an earlier version placed water last, so a road could (and did, per a
//   real user report) get routed straight across open ocean to an island,
//   since nothing had told the road's own BFS that water was coming.
//
// Still no Penrose-tiling zone shapes, Fruchterman-Reingold layout
// optimization, or a real RMG template JSON format/authoring UI beyond
// today's size/player-count dialog — those are Milestones 4/5 (issue #210).

import {
  addObjectInstance,
  addObjectInstances,
  buildBlankMap,
  paintLevelTiles,
  paintRiverTiles,
  paintRoadTiles,
  paintTerrainTiles,
  paintWaterTiles,
  setAreas,
  setCityFaction,
  upsertPropPortals,
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
import { layoutZoneCenters, nearestTile, relaxZoneCenters } from './zone-layout'
import { assignTilesToZonesPenrose } from './zone-shape-penrose'
import { assignZoneBiomes, createPlacementState, populateZones, tryPlace, ZONE_BIOMES, type ZonePlacement } from './zone-population'
import { scatterZoneObstacles } from './zone-decoration'
import { createWindingCost, shortestPath, smoothPath, smoothRoadNetwork } from './zone-connections'
import { buildObjectLogicsIndex } from './value-model'
import { computeZoneAreas } from './zone-areas'
import { scatterZoneWater } from './zone-water'
import { computeIslandZones, nearestPlayerZone, PORTAL_SIDS } from './zone-islands'

export interface GenerateRandomMapOptions {
  sizeX: number
  sizeZ: number
  playerCount: number
  playerSpawnerSid: 'city-spawner' | 'hero-spawner'
  /** Overall water geography — VCMI's own `allowedWaterContent` concept
   *  (issue #210's research notes): `'none'` generates no water at all,
   *  `'normal'` (the default) is Milestone 3's original in-zone-lake
   *  behavior (zone-water.ts), `'islands'` fully water-locks a subset of
   *  neutral zones and reconnects each via a portal pair instead of a boat
   *  (zone-islands.ts — see its own header comment for why: no naval-
   *  travel mechanic exists in Olden Era). */
  waterContent?: 'none' | 'normal' | 'islands'
  /** Overall water amount, 0-1. In `'normal'` mode: per-zone lake chance
   *  and size (zone-water.ts). In `'islands'` mode: how many zones become
   *  islands and how little land each keeps. Defaults to 0.4. */
  waterChance?: number
  /** 0-1 fraction of each zone's own tiles considered for obstacle scattering (zone-decoration.ts). Defaults to that module's own default. */
  obstacleDensity?: number
  /** Multiplier on neutral-zone treasure-pile count (zone-population.ts). Defaults to 1. */
  treasureDensity?: number
  /** 0-1 chance a given treasure/guard slot places a real, concrete object
   *  (resource pile/artifact/pre-composed army — zone-population.ts's
   *  `placeTreasure`/`placeGuard`) instead of a `random-item`/`random-squad`
   *  placeholder. Defaults to 0.4. */
  objectVariety?: number
  /** Adds ONE bonus portal-pair shortcut connecting the single most
   *  graph-distant zone pair that isn't already a direct road edge — VCMI's
   *  own `forcePortal` connection concept ("connect zone to itself using
   *  pair of portals"), additional to every normal road/river connection,
   *  never a replacement for one. Independent of `waterContent` — works (or
   *  not) the same regardless of water mode, since portals are a real
   *  shortcut across any terrain, not just Islands mode's own
   *  water-crossing use of the same mechanic. User-toggleable per the
   *  user's own request; defaults to `false`. */
  usePortals?: boolean
  /** 0-1 — controls the Penrose-tiling zone-shaping pass's own vertex
   *  density (zone-shape-penrose.ts's `scale` param): 0 = coarse, blockier
   *  zone boundaries; 1 = fine, highly jagged boundaries. Maps onto that
   *  module's real `scale` range (7 down to 1) so the default 0.5 lands
   *  exactly on its own prior hardcoded value (4) — leaving this option
   *  untouched reproduces every map this generator made before it existed.
   *  User-requested control over "the shape of the landscape". */
  zoneJaggedness?: number
  /** Multiplier (default 1, unchanged prior behavior) on every zone's own
   *  Fruchterman-Reingold equilibrium radius (zone-layout.ts's
   *  `relaxZoneCenters` `radiusMultiplier` param): below 1 packs zones
   *  tighter (denser interiors, more obstacle/road crowding), above 1
   *  spreads them further apart (more open space, generally cleaner roads
   *  — see this generator's own Milestone 5 fix for why crowding matters
   *  there). User-requested control over "the shape of the landscape". */
  zoneSpread?: number
  /** Injectable for deterministic tests, or a template's fixed seed (see template.ts's `createSeededRng`); defaults to `Math.random`. */
  rng?: () => number
}

/** `zoneJaggedness`'s 0-1 UI range onto zone-shape-penrose.ts's real
 *  `scale` parameter (7 = coarsest it supports down to 1 = finest) — solved
 *  so the option's own default (0.5) reproduces that module's prior
 *  hardcoded constant (4) exactly. */
function jaggednessToPenroseScale(jaggedness: number): number {
  return 7 - jaggedness * 6
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
  const { sizeX, sizeZ, playerCount, playerSpawnerSid, waterContent = 'normal', waterChance = 0.4, obstacleDensity, treasureDensity, objectVariety, usePortals = false, zoneJaggedness = 0.5, zoneSpread = 1, rng = Math.random } = options
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

  // Milestone 4: a real Fruchterman-Reingold relaxation on top of the ring
  // seed (zones as size-weighted "soft spheres" — see relaxZoneCenters's
  // own doc comment), then real Penrose-tiling zone shaping (nearest
  // vertex, then nearest zone — zone-shape-penrose.ts) instead of the
  // plain weighted-Voronoi tessellation Milestones 1-3 used. Confirmed via
  // a real verification sweep: every zone still comes out as a single
  // connected tile region (not fragmented by the jagged vertex-based
  // boundary) across every tested map size/player count.
  const centers = relaxZoneCenters(sizeX, sizeZ, graph, layoutZoneCenters(sizeX, sizeZ, graph), rng, 300, zoneSpread)
  const { zoneIdByNode, tilesByZone } = assignTilesToZonesPenrose(sizeX, sizeZ, centers, graph.zones, rng, jaggednessToPenroseScale(zoneJaggedness))
  const zoneBiome = assignZoneBiomes(graph.zones)

  // Islands: shrink chosen neutral zones' own tile pool to a compact
  // landmass BEFORE anchors/population are computed, so a dwelling/mine/
  // guard placed "in this zone" naturally clusters within the landmass
  // rather than potentially landing in what's about to become open water.
  // `waterChance` doubles as "how island-y": more/bigger islands, less
  // land kept per island, at higher settings.
  let islandFloodNodes = new Set<number>()
  const islandLandmassByZone = new Map<number, number[]>()
  if (waterContent === 'islands') {
    const neutralZoneCount = graph.zones.filter((z) => z.kind === 'neutral').length
    const maxIslands = Math.max(1, Math.round(neutralZoneCount * waterChance))
    const landmassFraction = 0.6 - waterChance * 0.4 // 0.6 at chance→0 down to 0.2 at chance=1
    const islandResult = computeIslandZones(sizeX, sizeZ, graph.zones, tilesByZone, centers, rng, maxIslands, landmassFraction)
    for (const [zoneId, landmass] of islandResult.landmassByZone) {
      tilesByZone.set(zoneId, landmass)
      islandLandmassByZone.set(zoneId, landmass)
    }
    islandFloodNodes = islandResult.floodNodes
  }

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

  const { placements, concreteSquads } = populateZones({
    sizeX, sizeZ, zones: graph.zones, tilesByZone, zoneBiome, catalogById, objectLogicsById, state, rng, treasureDensity, catalog, objectVariety,
  })
  const skippedScatter = graph.zones.length * 3 - placements.length - concreteSquads.length // populateZones' own minimum per-zone attempt count (player zones attempt exactly 3; neutral zones attempt 3 + extra treasure piles, which count as bonus, not a shortfall); concrete-squad guard slots count as filled, not skipped
  if (skippedScatter > 0) {
    logWarn(`Random map generation: ${skippedScatter} scatter object(s) skipped — no free tile found in a crowded zone`)
  }

  // Water. Deliberately computed BEFORE roads/rivers (see this file's own
  // header comment) so their own BFS pathfinding already treats it as
  // blocked, instead of discovering it after the fact. `'normal'` = modest
  // in-zone lakes for a subset of neutral zones (zone-water.ts) — every
  // zone's own anchor is excluded from lake eligibility so a lake can never
  // flood the exact point roads/river are about to target. `'islands'` =
  // the flood computed above around each island zone's landmass, plus a
  // portal pair per island reconnecting it to its graph-nearest player
  // zone (zone-islands.ts's own header comment on why a portal, not a
  // boat). `'none'` does nothing. Whichever ran, everything downstream
  // shares the same collision state so nothing else can ever land on it.
  let waterNodesAll = new Set<number>()
  let waterChangesAll: { node: number; waterId: number }[] = []
  let levelChangesAll: { node: number; level: number }[] = []
  const portalPlacements: ZonePlacement[] = []
  const portalAdjacency = new Map<number, number>()

  if (waterContent === 'normal') {
    const waterResult = scatterZoneWater({
      sizeX, sizeZ, zones: graph.zones, tilesByZone,
      excludedNodes: new Set(zoneAnchorNode.values()),
      blocked: state.blocked, usedAnchors: state.usedAnchors, rng, chance: waterChance,
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

    // One portal pair per island zone: one end on the island's own
    // landmass, the other on its graph-nearest player zone — every player
    // zone stays fully land-connected (computeIslandZones never turns one
    // into an island), so this always gives a real, walkable mainland end.
    let portalColorIndex = 0
    for (const islandZoneId of islandLandmassByZone.keys()) {
      const mainlandZoneId = nearestPlayerZone(islandZoneId, graph.zones, zoneDistances)
      if (mainlandZoneId === null) continue
      const portalSid = PORTAL_SIDS[portalColorIndex % PORTAL_SIDS.length]
      portalColorIndex += 1

      const islandTiles = tilesByZone.get(islandZoneId) ?? []
      const mainlandTiles = tilesByZone.get(mainlandZoneId) ?? []
      const islandNode = tryPlace(portalSid, islandTiles, sizeX, sizeZ, catalogById, state, rng)
      const mainlandNode = tryPlace(portalSid, mainlandTiles, sizeX, sizeZ, catalogById, state, rng)
      if (islandNode === null || mainlandNode === null) {
        logWarn(`Random map generation: an island's portal pair (${portalSid}) couldn't be placed — that island may be unreachable`)
        continue
      }

      const islandTempId = state.nextTempId++
      const mainlandTempId = state.nextTempId++
      portalPlacements.push({ tempId: islandTempId, sid: portalSid, node: islandNode })
      portalPlacements.push({ tempId: mainlandTempId, sid: portalSid, node: mainlandNode })
      portalAdjacency.set(islandTempId, mainlandTempId)
      portalAdjacency.set(mainlandTempId, islandTempId)
    }
  }

  // Optional bonus portal shortcut (VCMI's own `forcePortal` connection
  // concept, see this option's own doc comment above) — the single most
  // graph-distant zone pair that ISN'T already a direct road edge, so the
  // portal actually shortens something instead of duplicating an edge that
  // already has a road. Independent of `waterContent`/the islands portal
  // logic above (a different portal pair, on a fresh color/temp-id pair —
  // reusing a color across separate pairs is safe, see zone-islands.ts's
  // own `PORTAL_SIDS` doc comment on why OE's `propPortals` link doesn't
  // rely on same-color auto-connect the way H3 does).
  if (usePortals) {
    const edgeKey = (a: number, b: number): string => `${Math.min(a, b)}:${Math.max(a, b)}`
    const roadEdgeSet = new Set(graph.edges.map(([a, b]) => edgeKey(a, b)))
    let bonusPair: [number, number] | null = null
    let bonusDistance = -1
    for (let a = 0; a < graph.zones.length; a++) {
      for (let b = a + 1; b < graph.zones.length; b++) {
        if (roadEdgeSet.has(edgeKey(a, b))) continue
        if (zoneDistances[a][b] > bonusDistance) { bonusDistance = zoneDistances[a][b]; bonusPair = [a, b] }
      }
    }
    if (bonusPair) {
      const [a, b] = bonusPair
      const portalSid = PORTAL_SIDS[Math.floor(rng() * PORTAL_SIDS.length)]
      const tilesA = tilesByZone.get(graph.zones[a].id) ?? []
      const tilesB = tilesByZone.get(graph.zones[b].id) ?? []
      const nodeA = tryPlace(portalSid, tilesA, sizeX, sizeZ, catalogById, state, rng)
      const nodeB = tryPlace(portalSid, tilesB, sizeX, sizeZ, catalogById, state, rng)
      if (nodeA !== null && nodeB !== null) {
        const tempIdA = state.nextTempId++
        const tempIdB = state.nextTempId++
        portalPlacements.push({ tempId: tempIdA, sid: portalSid, node: nodeA })
        portalPlacements.push({ tempId: tempIdB, sid: portalSid, node: nodeB })
        portalAdjacency.set(tempIdA, tempIdB)
        portalAdjacency.set(tempIdB, tempIdA)
      } else {
        logWarn('Random map generation: the bonus portal shortcut could not be placed — no free tile in one of its zones')
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

  // Roads — one per zone-graph edge, connecting each pair's own anchor
  // tiles, routed around whatever's already placed OR flooded (water is
  // already in `state.blocked` by this point, so a road can never cross
  // open water — buildZoneGraph's ring guarantees the underlying zone
  // graph is connected, but a specific road can still fail to route
  // around a crowded/watery zone, which is why this is a real search with
  // a real "not found" case, not an assumed-successful straight line — an
  // island zone's own road edges are expected to fail this way, since the
  // only way in is the portal). Each edge gets its own `createWindingCost`
  // field (a real user-reported fix — a plain shortest path between two
  // open-ground points is almost always a dead-straight line, which reads
  // as obviously artificial once painted), so a long stretch curves
  // organically instead of repeating one unbroken straight segment. Each
  // edge is smoothed on its own RAW path first (`smoothPath` — deliberately
  // BEFORE merging: raw, unsmoothed zigzag paths are "thicker" and touch
  // each other far more often than smoothed ones, so running the network
  // pass on raw data fragments what should be one long smoothable run into
  // many short ones at spurious near-miss junctions, making things WORSE,
  // not better — confirmed by direct comparison against a real generated
  // map's own ladder-pair count). `smoothRoadNetwork` below then runs ONE
  // more cleanup pass over the whole ALREADY-SMOOTHED merged network — a
  // real follow-up user report: per-edge smoothing alone still left a
  // "ladder" wherever two independently-generated (and independently
  // ALREADY-smooth) roads ran close together and interleaved, which is
  // invisible to a pass that only ever sees one edge's own path.
  const roadNodesStage1 = new Set<number>()
  for (const [a, b] of graph.edges) {
    const from = zoneAnchorNode.get(a) as number
    const to = zoneAnchorNode.get(b) as number
    const path = shortestPath(sizeX, sizeZ, from, to, state.blocked, createWindingCost(sizeX, from, to, rng))
    if (path) for (const node of smoothPath(path, sizeX, state.blocked)) roadNodesStage1.add(node)
  }
  const roadNodes = smoothRoadNetwork(roadNodesStage1, sizeX, sizeZ, state.blocked, new Set(zoneAnchorNode.values()))
  if (roadNodes.size > 0) {
    block2 = paintRoadTiles(block2, [...roadNodes].map((node) => ({ node, roadId: 1 })))
  }

  // One river across the map's most graph-distant zone pair — same
  // winding pathfinding as roads (so it also can't cross water, and winds
  // organically instead of a dead-straight line), then the real per-node
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
    const riverFrom = zoneAnchorNode.get(a) as number
    const riverTo = zoneAnchorNode.get(b) as number
    const rawPath = shortestPath(sizeX, sizeZ, riverFrom, riverTo, state.blocked, createWindingCost(sizeX, riverFrom, riverTo, rng))
    const path = rawPath && rawPath.length > 1 ? smoothPath(rawPath, sizeX, state.blocked) : rawPath
    if (path && path.length > 1) {
      riverNodes = new Set(path)
      const changes = path.map((node) => {
        const { dirs } = classifyRiverNode(node, riverNodes, sizeX, sizeZ)
        return { node, s: deriveRealShapeCode(dirs) }
      })
      block2 = paintRiverTiles(block2, changes)
    }
  }

  // Road/river tiles join `state.blocked` here (water already did, right
  // after it was painted above) — a real bug found this session's own
  // validation sweep: `scatterZoneObstacles`'s `excludedNodes` only ever
  // filtered a CANDIDATE's anchor tile before the anchor was even chosen,
  // so a multi-tile obstacle (a real mountain/tree-cluster footprint, not a
  // 1-tile placeholder) could still land with a NON-anchor cell overlapping
  // a road/river tile — confirmed on a real generated map (dead_shadowy_
  // hill, mountain_lava_big_2, dirt_rock_1, and others, each with an
  // off-road anchor but an on-road secondary cell). Adding these nodes to
  // `state.blocked` itself makes `tryPlaceAt`'s own existing full-footprint
  // check (already used for every other collision kind) cover this too,
  // rather than adding a second parallel check. Deliberately doesn't affect
  // the road/river computation above (each already ran before this point).
  for (const node of roadNodes) state.blocked.add(node)
  for (const node of riverNodes) state.blocked.add(node)

  // Obstacle scattering — fills whatever each zone has left over, sharing
  // the same collision state so it never overlaps a real object, a road,
  // the river, or the water.
  const obstaclePlacements = scatterZoneObstacles({
    sizeX, sizeZ, zones: graph.zones, centers, tilesByZone, zoneBiome, catalogById,
    mapObjects: catalog.mapObjects, excludedNodes: new Set([...roadNodes, ...riverNodes, ...waterNodesAll]), state, rng,
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
  for (const placement of [...placements, ...obstaclePlacements, ...portalPlacements]) {
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
    portalAdjacency,
    new Set(),
    new Set([...roadNodes, ...riverNodes]),
  )
  if (report.stillUnreachable > 0) {
    logWarn(`Random map generation: ${report.stillUnreachable} placed object(s) remained unreachable after the accessibility pass`)
  }

  const additions: { sid: string; node: number; randomSquadOverrides?: { requestedValue: number; fraction: string } }[] = []
  const additionTempIds: number[] = [] // parallel to additions — needed to remap portal temp ids to real ids below
  for (const [sid, group] of objectGroups) {
    if (sid === playerSpawnerSid) continue // already committed to the container by buildBlankMap
    for (let i = 0; i < group.ids.length; i++) {
      const tempId = group.ids[i]
      const placement = tempIdToPlacement.get(tempId)
      if (!placement) continue
      additions.push({ sid, node: group.nodes[i], randomSquadOverrides: placement.randomSquadOverrides })
      additionTempIds.push(tempId)
    }
  }

  const { block2Chunk, newIds } = addObjectInstances(block2, additions)
  let finalBlock1 = container.chunks[0]
  let finalBlock2 = block2Chunk

  // Concrete-squad guards (zone-population.ts's `placeGuard` variety roll) —
  // real `squads[]` (entityType 2) army placements, written one at a time
  // via `addObjectInstance` since `addObjectInstances`'s bulk path is
  // `objectsFreeId`/type-0-only. These never went through `objectGroups`/
  // the accessibility pass above (squads aren't terrain in this codebase's
  // own passability model, so they have nothing for that pass to nudge or
  // check), so they're added here, after it, exactly like `setCityFaction`
  // and `upsertPropPortals` below are.
  for (const squad of concreteSquads) {
    const result = addObjectInstance(finalBlock1, finalBlock2, 2, squad.sid, squad.node)
    finalBlock1 = result.block1Chunk
    finalBlock2 = result.block2Chunk
  }

  // Portal linkage — real propPortals rows, reusing the exact same
  // adjacency `applyAccessibilityPass` above already validated reachability
  // against, remapped from temp ids to the real ids `addObjectInstances`
  // just assigned (a placed-but-unlinked portal is very likely inert
  // in-game — see portal-links.ts's own header comment on why this isn't
  // optional).
  if (portalAdjacency.size > 0) {
    const tempIdToFinalId = new Map<number, number>()
    newIds.forEach((finalId, i) => tempIdToFinalId.set(additionTempIds[i], finalId))
    for (const [fromTempId, toTempId] of portalAdjacency) {
      const fromId = tempIdToFinalId.get(fromTempId)
      const toId = tempIdToFinalId.get(toTempId)
      if (fromId === undefined || toId === undefined) continue
      finalBlock2 = upsertPropPortals(finalBlock2, 0, fromId, { targetIdx: toId, isActive: true })
    }
  }

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
  //
  // Deliberately rebuilds each zone's own FULL tile list from `zoneIdByNode`
  // here rather than reusing `tilesByZone` — islands mode shrinks that map's
  // entries to just each island's landmass (for population purposes), and
  // every real sample map's own areas[] cover 100% of tiles with no gaps;
  // reusing the shrunk version would silently orphan every flooded tile
  // from any area at all.
  const tilesByZoneFull = new Map<number, number[]>(graph.zones.map((z) => [z.id, []]))
  for (let node = 0; node < tileCount; node++) tilesByZoneFull.get(zoneIdByNode[node])!.push(node)
  const zoneBiomeName = new Map<number, string>()
  for (const [zoneId, biomeId] of zoneBiome) zoneBiomeName.set(zoneId, BLANK_MAP_BIOME_NAMES[biomeId] ?? 'Grass')
  const areas = computeZoneAreas(sizeX, sizeZ, zoneIdByNode, tilesByZoneFull, zoneAnchorNode, zoneBiomeName, playerZoneIndex)
  finalBlock2 = setAreas(finalBlock2, areas)

  const finalChunks = container.chunks.slice()
  finalChunks[0] = finalBlock1
  finalChunks[1] = finalBlock2
  return { ...container, chunks: finalChunks }
}
