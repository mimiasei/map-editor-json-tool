// ─── Random Map Generator — Milestone 1 (issue #210) ────────────────────────
// Builds on Milestone 0's "does the pipeline work at all" skeleton with the
// first real zone graph: one player zone + one neutral "treasure" zone per
// player, laid out and shaped via zone-graph.ts/zone-layout.ts (see their own
// header comments for how this differs from — and deliberately simplifies —
// VCMI's own Fruchterman-Reingold layout + Penrose tiling), each zone
// painted its own biome and populated with a starting dwelling/mine/guard
// (player zones) or a mine/random-item/guard (neutral zones) via
// zone-population.ts's collision-aware placement. A final reachability pass
// (this project's own accessibility-pass.ts, built for H3 import — reused
// verbatim here) guarantees every placed object stays reachable from every
// player start even if two zones' scattered objects land close together.
//
// Still no real terrain-shape fractalization, obstacles, rivers, roads, or
// treasure-value economy — those are Milestone 2/3 (issue #210).

import { addObjectInstances, buildBlankMap, paintTerrainTiles, type BlankMapPlayer, type MapContainer } from '@/lib/map-write'
import { computeFootprintTiles } from '@/lib/map-grid/footprint'
import type { CatalogMapObject, GameCatalog } from '@/lib/catalog/types'
import { applyAccessibilityPass, type ObjectPlacementGroup } from '@/lib/h3-import/accessibility-pass'
import { logWarn } from '@/lib/logger'
import { buildZoneGraph, zoneDistanceMatrix } from './zone-graph'
import { assignTilesToZones, layoutZoneCenters } from './zone-layout'
import { assignZoneBiomes, populateZones, ZONE_BIOMES, type ZonePlacement } from './zone-population'

export interface GenerateRandomMapOptions {
  sizeX: number
  sizeZ: number
  playerCount: number
  playerSpawnerSid: 'city-spawner' | 'hero-spawner'
  /** Injectable for deterministic tests; defaults to `Math.random`. */
  rng?: () => number
}

/** The tile within `tiles` closest to `(cx, cz)` — used to pick each player
 *  zone's actual spawn tile from its own Voronoi-assigned tiles, since the
 *  zone's raw layout center coordinate can itself belong to a neighboring
 *  zone at a boundary. */
function nearestTile(tiles: number[], sizeX: number, cx: number, cz: number): number {
  let best = tiles[0]
  let bestDist = Infinity
  for (const node of tiles) {
    const x = node % sizeX
    const z = Math.floor(node / sizeX)
    const dist = (x - cx) ** 2 + (z - cz) ** 2
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
  const catalogById = new Map<string, CatalogMapObject>(catalog.mapObjects.map((o) => [o.id, o]))

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

  const players: BlankMapPlayer[] = []
  for (const zone of graph.zones) {
    if (zone.kind !== 'player') continue
    const center = centers[zone.id]
    const tiles = tilesByZone.get(zone.id) ?? []
    const node = tiles.length > 0 ? nearestTile(tiles, sizeX, center.x, center.z) : center.z * sizeX + center.x
    players.push({ sid: playerSpawnerSid, node })
  }

  let container = buildBlankMap(template, { sizeX, sizeZ, biomeId: ZONE_BIOMES[0], players })

  // Overwrite the uniform fill from buildBlankMap with each zone's own
  // biome — one bulk pass, same paintTerrainTiles bulk writer the Terrain
  // brush/bucket-fill use.
  const tileCount = sizeX * sizeZ
  const terrainChanges: { node: number; biomeId: number }[] = new Array(tileCount)
  for (let node = 0; node < tileCount; node++) {
    terrainChanges[node] = { node, biomeId: zoneBiome.get(zoneIdByNode[node]) ?? ZONE_BIOMES[0] }
  }
  const paintedChunks = container.chunks.slice()
  paintedChunks[1] = paintTerrainTiles(paintedChunks[1], terrainChanges)
  container = { ...container, chunks: paintedChunks }

  // Seed the collision state with the player spawners just placed, so
  // zone-population.ts's scattering never overlaps one.
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

  const placements = populateZones({
    sizeX, sizeZ, zones: graph.zones, tilesByZone, zoneBiome, catalogById, seedBlocked, seedAnchors, rng,
  })
  const skipped = graph.zones.length * 3 - placements.length // populateZones always attempts exactly 3 objects per zone
  if (skipped > 0) {
    logWarn(`Random map generation: ${skipped} scatter object(s) skipped — no free tile found in a crowded zone`)
  }

  // Reachability guarantee (issue #210's "connectivity-guaranteeing terrain
  // carving" milestone item) — reuses the H3-import accessibility pass
  // verbatim rather than inventing a second flood-fill repair algorithm.
  // `decorativeIds` is deliberately empty: nothing this generator places is
  // sacrificial decoration, so the pass can only ever nudge a stuck object
  // to a nearby free tile, never delete one.
  const objectGroups = new Map<string, ObjectPlacementGroup>([[playerSpawnerSid, spawnerGroup]])
  const tempIdToPlacement = new Map<number, ZonePlacement>()
  for (const placement of placements) {
    tempIdToPlacement.set(placement.tempId, placement)
    let group = objectGroups.get(placement.sid)
    if (!group) { group = { ids: [], nodes: [], rotations: [], levels: [] }; objectGroups.set(placement.sid, group) }
    group.ids.push(placement.tempId)
    group.nodes.push(placement.node)
    group.rotations.push(0)
    group.levels.push(0)
  }

  const report = applyAccessibilityPass(
    objectGroups,
    sizeX,
    sizeZ,
    { levelsMap: new Array(tileCount).fill(0), climbsMap: new Array(tileCount).fill(0), waterMap: new Array(tileCount).fill(0) },
    catalog,
    catalogById,
    new Set(),
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

  const { block2Chunk } = addObjectInstances(container.chunks[1], additions)
  const finalChunks = container.chunks.slice()
  finalChunks[1] = block2Chunk
  return { ...container, chunks: finalChunks }
}
