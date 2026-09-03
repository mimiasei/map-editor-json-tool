// ─── Random Map Generator — Milestone 2 (issue #210) ────────────────────────
// Builds on Milestone 1's zone graph with: real roads along every zone-graph
// connection and one river across the map's most graph-distant zone pair
// (zone-connections.ts, plain BFS pathfinding avoiding placed-object
// footprints), biome-appropriate obstacle scattering filling each zone's
// remaining free tiles (zone-decoration.ts, composed with real collision
// checking — reusing this codebase's existing Obstacles-brush sampler), and
// a real per-mine guard-value model (value-model.ts) replacing Milestone
// 1's flat difficulty-band roll for neutral-zone guards, plus zone-size-
// scaled treasure-pile density.
//
// Obstacle placements are marked decorative for the reachability pass
// (accessibility-pass.ts), so — unlike Milestone 1, where nothing was ever
// sacrificial — the pass can now actually delete a scattered rock/tree if
// it turns out to be the only thing sealing off a real target, not just
// nudge the target itself.
//
// Still no Penrose-tiling zone shapes, Fruchterman-Reingold layout
// optimization, water zones, or RMG template authoring — those are
// Milestone 3 (issue #210).

import { addObjectInstances, buildBlankMap, paintRiverTiles, paintRoadTiles, paintTerrainTiles, type BlankMapPlayer, type MapContainer } from '@/lib/map-write'
import { computeFootprintTiles } from '@/lib/map-grid/footprint'
import { classifyRiverNode, deriveRealShapeCode } from '@/lib/map-grid/river-shape'
import type { CatalogMapObject, GameCatalog } from '@/lib/catalog/types'
import { applyAccessibilityPass, type ObjectPlacementGroup } from '@/lib/h3-import/accessibility-pass'
import { logWarn } from '@/lib/logger'
import { buildZoneGraph, zoneDistanceMatrix } from './zone-graph'
import { assignTilesToZones, layoutZoneCenters, type ZoneCenter } from './zone-layout'
import { assignZoneBiomes, createPlacementState, populateZones, ZONE_BIOMES, type ZonePlacement } from './zone-population'
import { scatterZoneObstacles } from './zone-decoration'
import { shortestPath } from './zone-connections'
import { buildObjectLogicsIndex } from './value-model'

export interface GenerateRandomMapOptions {
  sizeX: number
  sizeZ: number
  playerCount: number
  playerSpawnerSid: 'city-spawner' | 'hero-spawner'
  /** Injectable for deterministic tests; defaults to `Math.random`. */
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
  const { sizeX, sizeZ, playerCount, playerSpawnerSid, rng = Math.random } = options
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
    sizeX, sizeZ, zones: graph.zones, tilesByZone, zoneBiome, catalogById, objectLogicsById, state, rng,
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

  // Obstacle scattering — fills whatever each zone has left over, sharing
  // the same collision state so it never overlaps a real object, a road,
  // or the river.
  const obstaclePlacements = scatterZoneObstacles({
    sizeX, sizeZ, zones: graph.zones, centers, tilesByZone, zoneBiome, catalogById,
    mapObjects: catalog.mapObjects, excludedNodes: new Set([...roadNodes, ...riverNodes]), state, rng,
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
    { levelsMap: new Array(tileCount).fill(0), climbsMap: new Array(tileCount).fill(0), waterMap: new Array(tileCount).fill(0) },
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
  const finalChunks = container.chunks.slice()
  finalChunks[1] = block2Chunk
  return { ...container, chunks: finalChunks }
}
