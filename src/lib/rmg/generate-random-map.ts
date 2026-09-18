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
  paintClimbTiles,
  paintLevelTiles,
  paintRiverTiles,
  paintRoadTiles,
  paintWaterTiles,
  setAreas,
  setCityFaction,
  setCitySpawnHero,
  upsertPropHero,
  upsertPropPortals,
  patchGameRules,
  BLANK_MAP_BIOME_NAMES,
  type MapContainer,
} from '@/lib/map-write'
import { classifyRiverNode, deriveRealShapeCode } from '@/lib/map-grid/river-shape'
import { isElevationWallTile } from '@/lib/map-grid/passability'
import { BIOME_FACTION } from '@/lib/map-grid/squad-pool'
import type { BiomeId } from '@/lib/map-grid/terrain-colors'
import type { CatalogMapObject, GameCatalog } from '@/lib/catalog/types'
import { applyAccessibilityPass, type ObjectPlacementGroup } from '@/lib/h3-import/accessibility-pass'
import { logWarn } from '@/lib/logger'
import { generateTerrain } from './generate-terrain'
import { populateZones, tryPlace, ZONE_BIOMES, type ZonePlacement } from './zone-population'
import { scatterZoneObstacles } from './zone-decoration'
import { scatterZoneFauna, WATER_COMPATIBLE_FAUNA_SIDS } from './zone-fauna'
import { computeRoadDistanceField, createRoadAvoidanceCost, createWindingCost, shortestPath, smoothPath } from './zone-connections'
import { buildObjectLogicsIndex } from './value-model'
import { computeZoneAreas } from './zone-areas'
import { scatterZoneWater } from './zone-water'
import { scatterZoneElevation, findAdjacentLevelZeroNode } from './zone-elevation'
import { PORTAL_SIDS, selectIslandConnections } from './zone-islands'
import { fortifyZoneBoundaries, type BoundaryGuardStrength } from './zone-boundary'
import { scatterProximityGuards } from './zone-guard-scatter'
import { reclaimWaterCollisions, repairSealedZones } from './zone-validation'
import { analyzeBalance, computeExitGuardsByZone, computeZoneWealth, type BalanceReport } from './balance-analyzer'
import { extractGameRulesPatch, parseGameTemplateJson, deriveWaterOverrides, deriveObstacleOverrides } from './rmg-template-import'

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
  /** A real user request: in `'islands'` mode, let a player's own start be
   *  one of the islands too, instead of every player always staying
   *  land-connected (this module's own original default) — see
   *  generate-terrain.ts's own doc comment on this same option for the
   *  full rationale. No effect for `'none'`/`'normal'` water content. */
  islandsIncludePlayerZones?: boolean
  /** `'islands'` mode only — 0-1, decoupled from `waterChance` (a real user
   *  request): 0 = mostly water, each island small; 1 = mostly land, each
   *  island large. See generate-terrain.ts's own doc comment on this same
   *  option for the full rationale. Defaults to 0.4. */
  islandLandRatio?: number
  /** Overall hill (level 1) amount, 0-1 — see zone-elevation.ts's own header
   *  comment. Unlike water, hills/valleys are eligible on BOTH player and
   *  neutral zones (a player's own spawn tile itself stays protected via
   *  the same anchor exclusion water gets). Defaults to 0 (opt-in — no
   *  behavior change unless set). */
  hillChance?: number
  /** Overall dry-valley (level -1, decoupled from water) amount, 0-1 — same
   *  shape as `hillChance`. Defaults to 0. */
  valleyChance?: number
  /** 0-1 fraction of each zone's own tiles considered for obstacle scattering (zone-decoration.ts). Defaults to that module's own default. */
  obstacleDensity?: number
  /** 0-1 fraction of the chance to have mountains in the zone boundary walls. */
  mountainDensity?: number
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
  /** VCMI-style zone-to-zone guarded chokepoints (issue #210 Milestone 6,
   *  researched directly from VCMI's own `ConnectionsPlacer.cpp`/
   *  `ObjectManager.cpp::chooseGuard`) — `'none'` (the default) skips this
   *  entirely; `'normal'`/`'strong'` wall every zone-to-zone boundary tile
   *  solid except at each connection's own real road-crossing gate, and
   *  place one guard at each gate sized by connection depth (`'strong'` is
   *  a 1.5x value multiplier on `'normal'`) — see zone-boundary.ts's own
   *  header comment for the full design and why it's opt-in (walling zone
   *  boundaries is a real structural change to every zone's own shape). */
  boundaryGuardStrength?: BoundaryGuardStrength
  /** 0-1 chance a given real mine/dwelling/resource/artifact
   *  `populateZones` placed gets an extra nearby guard, on top of that
   *  zone's own single mine/treasure guard (zone-guard-scatter.ts's own
   *  header comment has the full design — a real user request, including
   *  the ordering: this runs as its own pass right after resources/
   *  artifacts exist to guard). Defaults to 0.15 — `'none'` (0) fully
   *  disables it. */
  squadDensity?: number
  /** Road/river winding amplitude, in tiles — how far the organic S-curve
   *  swings away from the direct line (`createWindingCost`'s own `amplitude`
   *  param). Defaults to 3 (this generator's own tuned default — see
   *  `createWindingCost`'s doc comment for how that value was reached).
   *  User-requested direct control over "how organic" roads/rivers look,
   *  after a real user report that the tuned default still wasn't windy
   *  enough for their taste on some maps. */
  roadWindingAmplitude?: number
  /** Road/river winding wavelength, in tiles per S-curve cycle — how often
   *  it curves (`createWindingCost`'s own `wavelength` param). Defaults to
   *  50. Lower = more frequent curves (more organic-looking, but pushed too
   *  low this is exactly the "ladder" artifact a real prior fix addressed —
   *  see `createWindingCost`'s own doc comment); higher = fewer, broader
   *  sweeps (straighter-reading overall). */
  roadWindingWavelength?: number
  /** Injectable for deterministic tests, or a template's fixed seed (see template.ts's `createSeededRng`); defaults to `Math.random`. */
  rng?: () => number
  /** "Terrain only" mode (a real user request): produce just the tile
   *  arrays (biome/water/elevation) — no player spawners, no roads/rivers,
   *  no objects/guards/decoration at all — for a map maker who wants the
   *  random fractal terrain shape but places everything else themselves.
   *  Returns immediately after `generate-terrain.ts`'s own terrain phase.
   *  Defaults to `false` (normal full generation). */
  terrainOnly?: boolean
  /** Which of the 7 real biomes generation may use at all (template.ts's
   *  own doc comment has the full rationale). Defaults to all 7. */
  enabledBiomes?: BiomeId[]
  /** Total `random-city` (neutral) placements scattered across neutral
   *  zones. Defaults to 1. */
  randomCityCount?: number
  /** Map-wide per-sid placement caps (template.ts's own doc comment).
   *  Defaults to capping `university` at 1. */
  contentCountLimits?: { sid: string; maxCount: number }[]
  /** Chance a road segment is painted Stone instead of Dirt. Defaults to 0.35. */
  stoneRoadChance?: number
  /** Chance a neutral-zone road endpoint targets a real mine/interactable/
   *  random-city node instead of the zone's own anchor. Defaults to 0.8. */
  roadPointOfInterestChance?: number
  /** Independent per-edge chance a road is painted at all. Defaults to 0.8. */
  roadFullConnectivityChance?: number
  /** Raw JSON text of a real game RMG template (issue #210, Stage 1) — see
   *  `GenerateTerrainOptions.gameTemplateJson`'s own doc comment (this
   *  option is threaded straight through to `generateTerrain`). */
  gameTemplateJson?: string
}

/**
 * Build a brand-new random `.map` container from `template` (expected to be
 * `template.map`'s already-parsed container, exactly like `buildBlankMap`
 * itself expects — see `create-map.ts` for where that's read) and a loaded
 * `GameCatalog` (needed for real object footprints — mines/dwellings are
 * 3×3 real map objects, not 1-tile placeholders, so placement must know
 * their actual solid cells to avoid overlap).
 */
export interface GenerateRandomMapResult {
  container: MapContainer
  /** Advisory-only 0-100 symmetry score (issue #210, Stage 0) — see
   *  balance-analyzer.ts's own header comment. */
  balanceReport: BalanceReport
}

export function generateRandomMap(template: MapContainer, catalog: GameCatalog, options: GenerateRandomMapOptions): GenerateRandomMapResult {
  const { sizeX, sizeZ, playerCount, playerSpawnerSid, waterContent = 'normal', waterChance = 0.4, islandsIncludePlayerZones = false, islandLandRatio = 0.4, hillChance = 0, valleyChance = 0, obstacleDensity, mountainDensity = 0.35, treasureDensity, objectVariety, usePortals = false, zoneJaggedness = 0.5, zoneSpread = 1, boundaryGuardStrength = 'strong', squadDensity = 0.45, roadWindingAmplitude = 3, roadWindingWavelength = 50, rng = Math.random, terrainOnly = false, enabledBiomes, randomCityCount = 1, contentCountLimits = [{ sid: 'university', maxCount: 1 }], stoneRoadChance = 0.35, roadPointOfInterestChance = 0.8, roadFullConnectivityChance = 0.8, gameTemplateJson } = options
  const tileCount = sizeX * sizeZ
  const catalogById = new Map<string, CatalogMapObject>(catalog.mapObjects.map((o) => [o.id, o]))

  // Zone graph → Fruchterman-Reingold layout → Penrose-tiling zone shaping →
  // biome assignment (Milestone 4 — see generate-terrain.ts's own header
  // comment for why this is a shared, extracted function: byte-identical
  // terrain for the same seed whether called standalone for a preview/
  // terrain-only map or as this real pipeline's own first phase).
  // `computeWater: terrainOnly` — a real full generation computes its own
  // water itself, below, AFTER object population (so lakes still avoid
  // overlapping a real object, exactly as before this extraction); a
  // terrain-only run has no objects to avoid, so it's fine (and necessary,
  // since it returns immediately after this) to have generateTerrain
  // compute water itself.
  const terrain = generateTerrain(template, catalogById, {
    sizeX, sizeZ, playerCount, waterContent, waterChance, islandsIncludePlayerZones, islandLandRatio, hillChance, valleyChance, zoneJaggedness, zoneSpread, rng, enabledBiomes, gameTemplateJson,
    includeSpawners: !terrainOnly, playerSpawnerSid: terrainOnly ? undefined : playerSpawnerSid,
    computeWater: terrainOnly, computeElevation: terrainOnly,
  })
  if (terrainOnly) {
    return { container: terrain.container, balanceReport: { score: null, findings: [], summary: { zones: 0, players: 0, totalWealth: 0, wealthPerPlayer: 0, wealthSpread: 0 } } }
  }

  const objectLogicsById = buildObjectLogicsIndex(catalog)
  const {
    graph, zoneDistances, centers, zoneIdByNode, tilesByZone, zoneBiome, zoneAnchorNode, islandLandmassByZone, islandFloodNodes, players, state,
    portalEdges: templatePortalEdges, unpaintedEdges: templateUnpaintedEdges, zoneLayoutByZoneId,
    guardCutoffValueByZoneId, zoneContentValueByZoneId, contentCountLimitsByZoneId, neutralCityExclusionsByZoneId,
    mandatoryContentSidsByZoneId, roadMaterialByEdgeKey,
  } = terrain
  let container = terrain.container
  let block2 = container.chunks[1]
  // A hard rule (zone-islands.ts's own header comment has the full
  // rationale): an island is reachable ONLY by portal, never a road — the
  // road loop below consults this set to skip every edge touching one
  // entirely, rather than let its usual water-partition-repair fallback
  // silently pave through the moat.
  const islandZoneIds = new Set(islandLandmassByZone.keys())

  // `objectGroups`' own spawner entry — same shape as before this
  // extraction, just sourced from the players `generateTerrain` already
  // committed via `buildBlankMap`.
  const spawnerGroup: ObjectPlacementGroup = { ids: [], nodes: [], rotations: [], levels: [] }
  players.forEach((p, i) => {
    spawnerGroup.ids.push(i)
    spawnerGroup.nodes.push(p.node)
    spawnerGroup.rotations.push(0)
    spawnerGroup.levels.push(0)
  })

  const { placements, concreteSquads } = populateZones({
    sizeX, sizeZ, zones: graph.zones, tilesByZone, zoneBiome, catalogById, objectLogicsById, state, rng, treasureDensity, catalog, objectVariety, randomCityCount, contentCountLimits,
    guardCutoffValueByZoneId, zoneContentValueByZoneId, contentCountLimitsByZoneId, neutralCityExclusionsByZoneId, mandatoryContentSidsByZoneId,
  })
  const skippedScatter = graph.zones.length * 3 - placements.length - concreteSquads.length // populateZones' own minimum per-zone attempt count (player zones attempt exactly 3; neutral zones attempt 3 + extra treasure piles, which count as bonus, not a shortfall); concrete-squad guard slots count as filled, not skipped

  // Proximity guards (real user request) — a random chance of a guard next
  // to a real mine/dwelling/resource/artifact `populateZones` just placed,
  // ON TOP OF that zone's own single mine/treasure guard. Deliberately a
  // SEPARATE pass run right here, immediately after resources/artifacts
  // exist to guard (the user's own explicit ordering), not folded into
  // `populateZones` itself.
  const playerZoneIds = graph.zones.filter((z) => z.kind === 'player').map((z) => z.id)
  const proximityGuards = scatterProximityGuards({
    sizeX, sizeZ, placements, zoneIdByNode, zoneBiome, zoneDistances, playerZoneIds,
    catalogById, catalog, objectVariety, squadDensity, state, rng,
  })
  if (skippedScatter > 0) {
    logWarn(`Random map generation: ${skippedScatter} scatter object(s) skipped — no free tile found in a crowded zone`)
  }

  // Water. Deliberately computed BEFORE roads/rivers (see this file's own
  // header comment) so their own BFS pathfinding already treats it as
  // blocked, instead of discovering it after the fact. `'normal'` = modest
  // in-zone lakes for a subset of neutral zones (zone-water.ts) — every
  // zone's own anchor is excluded from lake eligibility so a lake can never
  // flood the exact point roads/river are about to target. `'islands'` =
  // the flood computed above around each island zone's landmass; the road
  // loop below places one portal pair per zone-graph edge that touches an
  // island, instead of a road (zone-islands.ts's own header comment on why
  // a portal, not a boat, and why this is per-edge). `'none'` does
  // nothing. Whichever ran, everything downstream
  // shares the same collision state so nothing else can ever land on it.
  let waterNodesAll = new Set<number>()
  let waterChangesAll: { node: number; waterId: number }[] = []
  let levelChangesAll: { node: number; level: number }[] = []
  const portalPlacements: ZonePlacement[] = []
  const portalAdjacency = new Map<number, number>()

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
    // Per-edge portal placement (one island-touching zone-graph edge = one
    // portal pair, exactly mirroring how a non-island edge gets one road)
    // happens inside the road loop below, not here — see that loop's own
    // comment for why: it needs to replace "one portal per island to some
    // nearest mainland" (which breaks once EVERY zone, including every
    // player's, can be an island — "100% island amount" — leaving no
    // mainland at all for that model to fall back to).
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
    for (const node of waterNodesAll) {
      state.blocked.add(node)
      state.usedAnchors.add(node)
    }
  }

  // Elevation (hills + dry valleys) — same timing as water above (before
  // roads/rivers, so their own BFS pathfinding already sees the real wall
  // tiles as blocked; after object population, so blobs avoid overlapping
  // a real mine/dwelling/guard) — see zone-elevation.ts's own header
  // comment. Unlike water, both player AND neutral zones are eligible.
  let climbChangesAll: { node: number; climb: 1 }[] = []
  let elevationNodesAll = new Set<number>()
  {
    const excludedNodes = new Set(zoneAnchorNode.values())
    const hillResult = scatterZoneElevation({
      sizeX, sizeZ, zones: graph.zones, tilesByZone, zoneAnchorNode, excludedNodes,
      blocked: state.blocked, usedAnchors: state.usedAnchors, rng, kind: 'hill', chance: hillChance,
      reservedNodes: waterNodesAll,
    })
    const valleyResult = scatterZoneElevation({
      sizeX, sizeZ, zones: graph.zones, tilesByZone, zoneAnchorNode, excludedNodes,
      blocked: state.blocked, usedAnchors: state.usedAnchors, rng, kind: 'valley', chance: valleyChance,
      reservedNodes: new Set([...waterNodesAll, ...hillResult.elevatedNodes]),
    })
    levelChangesAll = [...levelChangesAll, ...hillResult.levelChanges, ...valleyResult.levelChanges]
    climbChangesAll = [...hillResult.climbChanges, ...valleyResult.climbChanges]
    elevationNodesAll = new Set([...hillResult.elevatedNodes, ...valleyResult.elevatedNodes])
  }

  if (waterChangesAll.length > 0) block2 = paintWaterTiles(block2, waterChangesAll)
  if (levelChangesAll.length > 0) block2 = paintLevelTiles(block2, levelChangesAll)
  if (climbChangesAll.length > 0) block2 = paintClimbTiles(block2, climbChangesAll)

  const levelsMapFinal = new Array(tileCount).fill(0)
  const waterMapFinal = new Array(tileCount).fill(0)
  const climbsMapFinal = new Array(tileCount).fill(0)
  for (const { node, waterId } of waterChangesAll) waterMapFinal[node] = waterId
  for (const { node, level } of levelChangesAll) levelsMapFinal[node] = level
  for (const { node, climb } of climbChangesAll) climbsMapFinal[node] = climb

  // Only elevation WALL tiles (passability.ts's real rule) are actually
  // impassable — most of a hill/valley (interior + any boundary tile with a
  // ramp neighbor) is ordinary walkable ground. Added to `state.blocked`
  // NOW, before roads/rivers route below, same reason water's own nodes
  // were added above. Kept as its own named set (not just folded into
  // `state.blocked`) so the road loop's own water-partition repair below
  // can retry excluding these too, and punch a ramp through the specific
  // wall tile a route actually needed instead of just failing to connect.
  const elevationWallNodesAll = new Set<number>()
  if (elevationNodesAll.size > 0) {
    for (const node of elevationNodesAll) {
      if (isElevationWallTile(node, sizeX, sizeZ, levelsMapFinal, climbsMapFinal)) {
        elevationWallNodesAll.add(node)
        state.blocked.add(node)
      }
    }
  }

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
  // organically instead of repeating one unbroken straight segment, then
  // `smoothPath` cleans up that edge's own local zigzag.
  //
  // `createWindingCost`'s own doc comment has the real story on its
  // `wavelength` param — the single biggest fix for a real "ladder"
  // regression, found by replaying an actual failing generation's exact
  // edges/blocked-tiles/rng draws outside the full pipeline until the true
  // cause (most real edges are short-to-medium, and a FIXED wave-cycle
  // count squeezed onto a short edge is an impossibly steep grid slope)
  // was isolated from several other things that looked plausible but
  // measured flat or worse on the same real case (a global post-hoc
  // network-smoothing pass — reverted, see git history — over-straightened
  // the intentional winding AND still produced more ladders; a larger
  // `smoothPath` window; a lower winding `strength`; an obstacle-clearance
  // cost).
  //
  // Edges are ALSO processed in order (this loop's own order) with each one
  // steering away from every road tile already drawn by an earlier edge in
  // this same pass (`computeRoadDistanceField` + `createRoadAvoidanceCost` —
  // a soft, never-blocking cost penalty, not a hard avoid), addressing a
  // second real cause the same user report raised: two independently-
  // generated roads running close together and interleaving (more likely
  // at higher player counts, with more edges sharing the same map).
  const roadNodes = new Set<number>()
  const roadIdByNode = new Map<number, number>()
  const roadPathsByEdge = new Map<string, number[]>()
  const reclaimedWaterNodes = new Set<number>()
  // A road route that needed to cross an elevation wall gets a ramp punched
  // through the exact tile it used (never a level change — see the repair
  // block below), same "carve exactly what a real route needed" convention
  // as `reclaimedWaterNodes` above.
  const roadClimbChanges: { node: number; climb: 1 }[] = []
  // "Points of interest" a road should prefer over a zone's own abstract
  // anchor — real user request. Mines (`MINE_SIDS`, this file's own local
  // copy — zone-guard-scatter.ts/zone-population.ts each keep their own
  // too, this codebase's established convention for a short constant used
  // in one place) + weekly-resource interactables (`windmill` confirmed
  // real via Core/DB/map/objects/4_interactables.json; a short starter
  // list, not claimed exhaustive) + `random-city` (Phase 2, this session).
  const MINE_SIDS_LOCAL = new Set(['mine_wood', 'mine_ore', 'mine_gold', 'mine_gemstones', 'mine_crystals', 'mine_mercury'])
  const WEEKLY_RESOURCE_SIDS = new Set(['windmill'])
  const isNotableSid = (sid: string): boolean => MINE_SIDS_LOCAL.has(sid) || WEEKLY_RESOURCE_SIDS.has(sid) || sid === 'random-city'
  const notableNodesByZone = new Map<number, number[]>()
  for (const p of [...placements, ...concreteSquads]) {
    if (!isNotableSid(p.sid)) continue
    const zoneId = zoneIdByNode[p.node]
    const list = notableNodesByZone.get(zoneId)
    if (list) list.push(p.node)
    else notableNodesByZone.set(zoneId, [p.node])
  }
  const zoneKindById = new Map(graph.zones.map((z) => [z.id, z.kind]))
  const roadEndpointForZone = (zoneId: number): number => {
    // Player zones always target the player's own city (the anchor IS the
    // spawner's own node — generate-terrain.ts places it there) — the
    // user's own "roads should certainly start from the player's own
    // starting city" — never substituted for one of that zone's own mines.
    const notable = zoneKindById.get(zoneId) === 'neutral' ? notableNodesByZone.get(zoneId) : undefined
    if (notable && notable.length > 0 && rng() < roadPointOfInterestChance) {
      return notable[Math.floor(rng() * notable.length)]
    }
    return zoneAnchorNode.get(zoneId) as number
  }
  const ROAD_AVOIDANCE_RADIUS = 4
  const ROAD_AVOIDANCE_STRENGTH = 1.5
  // `smoothPath`'s own window was a flat 12 tiles — real ASCII-rendered
  // comparison (a follow-up user report: "roads end up fairly straight and
  // unorganic... they were much better earlier") found that window
  // aggressively flattens the INTENDED sine-wave curve, not just genuine
  // local zigzag noise — at the default wavelength (50) it collapsed a
  // real multi-bend S-curve down to a single long L-turn, and pushing
  // `roadWindingWavelength` even lower (for MORE visible winding) made no
  // difference at all, since window=12 flattened that even harder. Scaling
  // the window down with wavelength (a real fraction of one wave's own
  // quarter-period, not an arbitrary constant) lets `roadWindingWavelength`
  // actually control the visible result, while still cleaning up real
  // short zigzags the same way it always did.
  const roadSmoothWindow = Math.max(4, Math.round(roadWindingWavelength / 10))
  let unroutableEdges = 0
  // Islands: a real, hard rule (zone-islands.ts's own header comment has
  // the full story) — an island is reachable ONLY by portal, never a road,
  // regardless of the separate `usePortals` bonus-shortcut toggle. Every
  // zone-graph edge touching an island is a CANDIDATE portal connection,
  // but `selectIslandConnections` reduces that down to the real minimum
  // each island actually needs (1 normally, 2 for a "large" one — a real
  // user report that naively portaling every candidate edge left small
  // islands with 4+ portal objects) while a real connectivity check keeps
  // the whole zone graph from ever fragmenting (see that function's own
  // doc comment for why a naive "1 per island" rule alone isn't safe on a
  // ring topology).
  // "Large" is relative to what THIS generation actually produced (the
  // average island landmass size this run), not a fixed fraction of the
  // whole map — a fixed map-wide percentage miscalibrated badly across
  // player counts/map sizes in real testing (at typical settings on a
  // modest player count, EVERY island's own landmass already exceeded a
  // naive "5% of the whole map" bar, so nearly every island got 2 portals
  // instead of the intended "usually 1, occasionally 2" split). Only an
  // island MEANINGFULLY bigger than this run's own typical one gets 2.
  const islandSizes = [...islandLandmassByZone.values()].map((l) => l.length)
  const avgIslandSize = islandSizes.length > 0 ? islandSizes.reduce((sum, n) => sum + n, 0) / islandSizes.length : 0
  const desiredPortalCount = (zoneId: number): number => ((islandLandmassByZone.get(zoneId)?.length ?? 0) > avgIslandSize * 1.5 ? 2 : 1)
  const selectedPortalEdges = new Set(
    selectIslandConnections(graph.zones, graph.edges, islandZoneIds, desiredPortalCount).map(([a, b]) => `${a}:${b}`),
  )
  const islandGotPortal = new Set<number>()
  const islandPortalNodesByZone = new Map<number, number[]>()
  const addIslandPortalNode = (zoneId: number, node: number): void => {
    const list = islandPortalNodesByZone.get(zoneId)
    if (list) list.push(node)
    else islandPortalNodesByZone.set(zoneId, [node])
  }
  let islandPortalColorIndex = 0
  const placeIslandPortal = (a: number, b: number): boolean => {
    const portalSid = PORTAL_SIDS[islandPortalColorIndex % PORTAL_SIDS.length]
    islandPortalColorIndex += 1
    const nodeA = tryPlace(portalSid, tilesByZone.get(a) ?? [], sizeX, sizeZ, catalogById, state, rng)
    const nodeB = tryPlace(portalSid, tilesByZone.get(b) ?? [], sizeX, sizeZ, catalogById, state, rng)
    if (nodeA === null || nodeB === null) return false
    const tempIdA = state.nextTempId++
    const tempIdB = state.nextTempId++
    portalPlacements.push({ tempId: tempIdA, sid: portalSid, node: nodeA })
    portalPlacements.push({ tempId: tempIdB, sid: portalSid, node: nodeB })
    portalAdjacency.set(tempIdA, tempIdB)
    portalAdjacency.set(tempIdB, tempIdA)
    if (islandZoneIds.has(a)) { islandGotPortal.add(a); addIslandPortalNode(a, nodeA) }
    if (islandZoneIds.has(b)) { islandGotPortal.add(b); addIslandPortalNode(b, nodeB) }
    return true
  }
  // Deduplicated by zone pair before this loop — a Stage 1 game-template
  // import can (and, confirmed on a real template, does) list more than one
  // raw connection between the same two zones (e.g. a real Portal
  // connection plus a separate "Pseudo" Proximity spring between the exact
  // same pair, presumably so the layout physics pulls them close AND a real
  // passage exists) — `graph.edges` legitimately contains both as parallel
  // tuples (harmless for `zoneDistanceMatrix`'s own BFS), but processing
  // the pair twice here would double-place whatever the first pass already
  // placed (confirmed: an early version of this loop placed 2 redundant
  // portal pairs for Crossroads.rmg.json's own single Portal connection).
  const seenEdgeKeys = new Set<string>()
  for (const [a, b] of graph.edges) {
    const dedupeKey = `${Math.min(a, b)}:${Math.max(a, b)}`
    if (seenEdgeKeys.has(dedupeKey)) continue
    seenEdgeKeys.add(dedupeKey)
    // Stage 1 game-template import: a connection the template itself
    // declared `connectionType: "Portal"` gets a portal unconditionally —
    // authored, not inferred from island/water status the way this
    // generator's own procedural islands mode works below. Empty
    // `templatePortalEdges` (no template imported) makes this a no-op.
    if (templatePortalEdges.has(`${Math.min(a, b)}:${Math.max(a, b)}`)) {
      placeIslandPortal(a, b)
      continue
    }
    // A template-declared connectivity-only edge (Proximity/GladiatorArena/
    // anything not road-flagged Direct) — real graph edge (zoneDistances
    // already reflects it), but nothing painted for it.
    if (templateUnpaintedEdges.has(`${Math.min(a, b)}:${Math.max(a, b)}`)) continue
    if (islandZoneIds.has(a) || islandZoneIds.has(b)) {
      // Only place a portal for edges `selectIslandConnections` actually
      // kept — every OTHER island-touching edge is real, deliberate
      // redundancy (the ring's own topology still lists it, but it's not
      // needed for connectivity once its island already has a portal
      // elsewhere) and gets neither a road nor a portal.
      if (selectedPortalEdges.has(`${a}:${b}`)) placeIslandPortal(a, b)
      continue
    }
    // Progressively-uncertain long-haul connectivity — a real user
    // request: full player-to-player paved routes should get less certain
    // over distance, not guaranteed. Every edge here already connects a
    // player zone to its OWN immediate neutral neighbor (buildZoneGraph's
    // ring never has a player-player or neutral-neutral edge), so a miss
    // just leaves one local stretch unpaved — a route spanning several
    // edges to a distant player compounds this naturally, no separate
    // distance-aware logic needed. Roads are cosmetic (never gate
    // walkability), so skipping some is a style choice, not a
    // connectivity risk. Skipped entirely for a Stage 1 template-driven
    // generation — the template already curated exactly which connections
    // exist as real edges at all (a Proximity/GladiatorArena connection
    // was never added as one), so every edge that survives here is one the
    // template author actually wanted painted.
    if (!gameTemplateJson && rng() >= roadFullConnectivityChance) continue
    const from = roadEndpointForZone(a)
    const to = roadEndpointForZone(b)
    const distanceField = computeRoadDistanceField(roadNodes, sizeX, sizeZ, ROAD_AVOIDANCE_RADIUS)
    const avoidanceCost = createRoadAvoidanceCost(distanceField, sizeX, ROAD_AVOIDANCE_RADIUS, ROAD_AVOIDANCE_STRENGTH)
    const windingCost = createWindingCost(sizeX, from, to, rng, roadWindingAmplitude, 0.5, roadWindingWavelength)
    const combinedCost = (x: number, z: number): number => windingCost(x, z) + avoidanceCost(x, z)
    let path = shortestPath(sizeX, sizeZ, from, to, state.blocked, combinedCost)

    // Water-partition repair: a real, user-reported "impossible case" —
    // large organic lakes (zone-water.ts, up to 60% of a zone's own tiles)
    // can, especially with several adjacent zones each rolling their own,
    // combine into a genuine full partition of the plain tile-adjacency
    // graph, leaving NO route between two zone anchors at all (confirmed:
    // a plain uniform-cost search fails too, not just the winding-cost
    // one — this isn't a cost-function artifact). Retrying with water
    // excluded from `blocked` almost always finds a route (mine/dwelling
    // footprints alone essentially never fully partition a zone graph
    // `zoneDistanceMatrix` already proved connected), and every water tile
    // that specific route needed gets reclaimed back to land — a real
    // "land bridge" carved exactly where required, rather than the road
    // crossing open water (CLAUDE.md's own standing rule this session
    // already fixed once: roads can never cross water).
    // Same repair, extended to elevation walls (a hill/valley whose ramps
    // happen not to cover the one crossing a route needed) — retrying with
    // BOTH water and elevation walls excluded at once, since either (or
    // both together) could be the real partition; a wall tile the repair
    // path used gets a ramp punched through it (climb=1, level UNCHANGED —
    // unlike water, there's no "flatten it back to land" equivalent for a
    // hill/valley, a ramp is the correct fix) instead of being reclaimed.
    if (!path && (waterNodesAll.size > 0 || elevationWallNodesAll.size > 0)) {
      const blockedWithoutWaterOrWalls = new Set([...state.blocked].filter((n) => !waterNodesAll.has(n) && !elevationWallNodesAll.has(n)))
      const repairPath = shortestPath(sizeX, sizeZ, from, to, blockedWithoutWaterOrWalls, combinedCost)
      if (repairPath) {
        for (const node of repairPath) {
          if (waterNodesAll.has(node)) {
            waterNodesAll.delete(node)
            reclaimedWaterNodes.add(node)
            state.blocked.delete(node)
            state.usedAnchors.delete(node)
          } else if (elevationWallNodesAll.has(node)) {
            // A ramp is only ever legal on the LOWER side of the boundary
            // (isValidRampNode's real rule — MapGridDialog.tsx) — for a
            // valley wall tile (level -1) that's the tile itself; for a
            // hill wall tile (level 1) the ramp must go on the adjacent
            // level-0 tile instead, never on the elevated tile itself (no
            // real climbsMap===1 tile is ever found at level 1).
            const rampNode = levelsMapFinal[node] < 0 ? node : findAdjacentLevelZeroNode(node, sizeX, sizeZ, levelsMapFinal, state.blocked)
            elevationWallNodesAll.delete(node)
            if (rampNode !== null && climbsMapFinal[rampNode] !== 1) {
              climbsMapFinal[rampNode] = 1
              roadClimbChanges.push({ node: rampNode, climb: 1 })
            }
            state.blocked.delete(node)
          }
        }
        path = repairPath
      }
    }

    if (path) {
      const smoothed = smoothPath(path, sizeX, state.blocked, roadSmoothWindow)
      roadPathsByEdge.set(`${a}:${b}`, smoothed)
      // A real template's own road material for this exact connection
      // (issue #210 second follow-up milestone — see rmg-template-
      // import.ts's own roadMaterialByEdgeKey doc comment) takes priority
      // over the generic stoneRoadChance roll; empty map (no template, or
      // this specific edge has no resolvable road entry) falls through.
      const templateMaterial = roadMaterialByEdgeKey.get(`${Math.min(a, b)}:${Math.max(a, b)}`)
      const roadId = templateMaterial ? (templateMaterial === 'Stone' ? 2 : 1) : (rng() < stoneRoadChance ? 2 : 1)
      for (const node of smoothed) { roadNodes.add(node); roadIdByNode.set(node, roadId) }
    } else {
      unroutableEdges += 1
    }
  }
  if (unroutableEdges > 0) {
    logWarn(`Random map generation: ${unroutableEdges} zone connection(s) could not be routed at all — those two zones have no road between them (a genuine blocked-tile partition even after the water-repair pass; extremely crowded/watery map)`)
  }

  // Failsafe (a real user report: "I see islands with no portal at all") —
  // an island can end up here with zero portals if `selectIslandConnections`
  // gave it none of its own edges (should only happen if every one of its
  // edges was safely redundant, i.e. it already has a portal from THIS
  // pass — but guard against it anyway) or if its one selected edge's
  // `tryPlace` genuinely failed (no free tile on either side). Every
  // island MUST have at least one way in — try every other zone in the
  // whole map, nearest first, until one placement succeeds.
  for (const islandZoneId of islandZoneIds) {
    if (islandGotPortal.has(islandZoneId)) continue
    const candidates = graph.zones
      .map((z) => z.id)
      .filter((id) => id !== islandZoneId)
      .sort((x, y) => zoneDistances[islandZoneId][x] - zoneDistances[islandZoneId][y])
    let rescued = false
    for (const candidateId of candidates) {
      if (placeIslandPortal(islandZoneId, candidateId)) { rescued = true; break }
    }
    if (rescued) {
      logWarn(`Random map generation: zone ${islandZoneId} (an island) needed its failsafe portal — its own zone-graph edge(s) couldn't place one`)
    } else {
      logWarn(`Random map generation: zone ${islandZoneId} (an island) has NO portal anywhere on the map — it is completely unreachable. This is a genuinely degenerate case (every other zone's own tile pool was full)`)
    }
  }

  // Intra-island roads — cosmetic-only paths confined entirely to one
  // island's own landmass (surrounded by water, so `shortestPath` can't
  // escape it), independent of the inter-zone portal network above. Two
  // real user-requested gates: a hard minimum size (very small islands
  // never get one, regardless of the size-scaled chance below), and only
  // if the island actually has something worth reaching — a player
  // spawner (when `islandsIncludePlayerZones` allowed it) or a `random-
  // city` (Phase 2, this session). Chance scales with the island's own
  // size relative to this run's own average (`avgIslandSize`, already
  // computed above for portal-count calibration) — self-calibrating,
  // same precedent as that logic.
  const MIN_ISLAND_ROAD_TILES = 40
  for (const islandZoneId of islandZoneIds) {
    const islandTiles = islandLandmassByZone.get(islandZoneId) ?? []
    if (islandTiles.length < MIN_ISLAND_ROAD_TILES) continue
    const hasSpawner = players.some((p) => zoneIdByNode[p.node] === islandZoneId)
    const hasRandomCity = placements.some((p) => p.sid === 'random-city' && zoneIdByNode[p.node] === islandZoneId)
    if (!hasSpawner && !hasRandomCity) continue
    const chance = avgIslandSize > 0 ? Math.max(0, Math.min(1, islandTiles.length / (avgIslandSize * 2))) : 0
    if (rng() >= chance) continue
    const portalNodes = islandPortalNodesByZone.get(islandZoneId) ?? []
    let from: number | undefined
    let to: number | undefined
    if (portalNodes.length >= 2) { [from, to] = portalNodes }
    else if (portalNodes.length === 1) { from = portalNodes[0]; to = zoneAnchorNode.get(islandZoneId) }
    if (from === undefined || to === undefined || from === to) continue
    const windingCost = createWindingCost(sizeX, from, to, rng, roadWindingAmplitude, 0.5, roadWindingWavelength)
    const path = shortestPath(sizeX, sizeZ, from, to, state.blocked, windingCost)
    if (!path) continue
    const smoothed = smoothPath(path, sizeX, state.blocked, roadSmoothWindow)
    const roadId = rng() < stoneRoadChance ? 2 : 1
    for (const node of smoothed) { roadNodes.add(node); roadIdByNode.set(node, roadId) }
  }

  if (reclaimedWaterNodes.size > 0) {
    block2 = paintWaterTiles(block2, [...reclaimedWaterNodes].map((node) => ({ node, waterId: 0 })))
    block2 = paintLevelTiles(block2, [...reclaimedWaterNodes].map((node) => ({ node, level: 0 })))
    for (const node of reclaimedWaterNodes) {
      waterMapFinal[node] = 0
      levelsMapFinal[node] = 0
    }
  }
  if (roadClimbChanges.length > 0) block2 = paintClimbTiles(block2, roadClimbChanges)
  if (roadNodes.size > 0) {
    block2 = paintRoadTiles(block2, [...roadNodes].map((node) => ({ node, roadId: roadIdByNode.get(node) ?? 1 })))
  }

  // One river across the map's most graph-distant zone pair — same
  // winding pathfinding as roads (so it also can't cross water, and winds
  // organically instead of a dead-straight line), then the real per-node
  // connectivity-bitmask shape codes river-shape.ts derives from actual
  // sample-map data, not a guessed texture id.
  let riverNodes = new Set<number>()
  let riverPath: number[] | null = null
  let bestDistance = -1
  let riverEndpoints: [number, number] | null = null
  for (let a = 0; a < graph.zones.length; a++) {
    if (islandZoneIds.has(a)) continue // an island has no land route in at all — never a useful river endpoint
    for (let b = a + 1; b < graph.zones.length; b++) {
      if (islandZoneIds.has(b)) continue
      if (zoneDistances[a][b] > bestDistance) { bestDistance = zoneDistances[a][b]; riverEndpoints = [a, b] }
    }
  }
  if (riverEndpoints) {
    const [a, b] = riverEndpoints
    const riverFrom = zoneAnchorNode.get(a) as number
    const riverTo = zoneAnchorNode.get(b) as number
    const rawPath = shortestPath(sizeX, sizeZ, riverFrom, riverTo, state.blocked, createWindingCost(sizeX, riverFrom, riverTo, rng, roadWindingAmplitude, 0.5, roadWindingWavelength))
    const path = rawPath && rawPath.length > 1 ? smoothPath(rawPath, sizeX, state.blocked, roadSmoothWindow) : rawPath
    if (path && path.length > 1) {
      riverNodes = new Set(path)
      riverPath = path
      const changes = path.map((node) => {
        const { dirs } = classifyRiverNode(node, riverNodes, sizeX, sizeZ)
        return { node, s: deriveRealShapeCode(dirs) }
      })
      block2 = paintRiverTiles(block2, changes)
    }
  }

  // Intra-island rivers — same size-scaled chance as intra-island roads
  // above, but no "needs a city" gate (a purely decorative water feature
  // crossing the island, not a connection to anything) and its own
  // endpoints: a cheap approximate-diameter pair within the island's own
  // tile list (pick a random tile, find the island tile farthest from it,
  // then the tile farthest from THAT one — two linear passes, good enough
  // for a decorative path, not a real shortest-path/farthest-pair search).
  const MIN_ISLAND_RIVER_TILES = 40
  const farthestIslandTile = (from: number, tiles: number[]): number => {
    const fx = from % sizeX, fz = Math.floor(from / sizeX)
    let best = tiles[0]
    let bestDist = -1
    for (const n of tiles) {
      const nx = n % sizeX, nz = Math.floor(n / sizeX)
      const d = (nx - fx) ** 2 + (nz - fz) ** 2
      if (d > bestDist) { bestDist = d; best = n }
    }
    return best
  }
  for (const islandZoneId of islandZoneIds) {
    const islandTiles = islandLandmassByZone.get(islandZoneId) ?? []
    if (islandTiles.length < MIN_ISLAND_RIVER_TILES) continue
    const chance = avgIslandSize > 0 ? Math.max(0, Math.min(1, islandTiles.length / (avgIslandSize * 2))) : 0
    if (rng() >= chance) continue
    const seed = islandTiles[Math.floor(rng() * islandTiles.length)]
    const riverFrom = farthestIslandTile(seed, islandTiles)
    const riverTo = farthestIslandTile(riverFrom, islandTiles)
    if (riverFrom === riverTo) continue
    const rawPath = shortestPath(sizeX, sizeZ, riverFrom, riverTo, state.blocked, createWindingCost(sizeX, riverFrom, riverTo, rng, roadWindingAmplitude, 0.5, roadWindingWavelength))
    const path = rawPath && rawPath.length > 1 ? smoothPath(rawPath, sizeX, state.blocked, roadSmoothWindow) : rawPath
    if (!path || path.length <= 1) continue
    for (const node of path) riverNodes.add(node)
    const changes = path.map((node) => {
      const { dirs } = classifyRiverNode(node, riverNodes, sizeX, sizeZ)
      return { node, s: deriveRealShapeCode(dirs) }
    })
    block2 = paintRiverTiles(block2, changes)
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

  // Guarded zone boundaries (issue #210 Milestone 6) — runs BEFORE the
  // density-based interior obstacle scattering below so its own wall
  // placements claim their border tiles first; `scatterZoneObstacles`'s own
  // `tryPlaceAt` collision check then naturally skips them, same as any
  // other already-placed object. See zone-boundary.ts's own header comment
  // for the full design; a no-op (empty results) when `boundaryGuardStrength`
  // is `'none'` (the default).
  const boundaryResult = fortifyZoneBoundaries({
    sizeX, sizeZ, zones: graph.zones, zoneIdByNode, zoneBiome,
    roadPaths: riverPath ? [...roadPathsByEdge.values(), riverPath] : [...roadPathsByEdge.values()],
    zoneDistances, catalogById, mapObjects: catalog.mapObjects,
    catalog, objectVariety, mountainDensity, strength: boundaryGuardStrength, state, rng,
    islandZoneIds, waterNodes: waterNodesAll,
  })

  // Obstacle scattering — fills whatever each zone has left over, sharing
  // the same collision state so it never overlaps a real object, a road,
  // the river, or the water.
  const { densityByZone, ambientPickupByZone } = deriveObstacleOverrides(zoneLayoutByZoneId)
  const obstaclePlacements = scatterZoneObstacles({
    sizeX, sizeZ, zones: graph.zones, centers, tilesByZone, zoneBiome, catalogById,
    mapObjects: catalog.mapObjects, excludedNodes: new Set([...roadNodes, ...riverNodes, ...waterNodesAll]), state, rng,
    density: obstacleDensity, densityByZone, ambientPickupByZone,
  })

  // Ambient animal/fx decoration (issue #210 follow-up) — real-map-
  // calibrated density, see zone-fauna.ts's own header comment. Runs after
  // obstacles so it only fills tiles obstacles left free; every placement
  // is non-blocking, so this can never introduce a new reachability or
  // water-isolation problem for anything else.
  const faunaPlacements = scatterZoneFauna({
    sizeX, sizeZ, zones: graph.zones, tilesByZone, zoneBiome, waterNodes: waterNodesAll, catalogById,
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
  const allConcreteSquads = [...concreteSquads, ...boundaryResult.concreteSquads, ...proximityGuards.concreteSquads]
  for (const placement of [...placements, ...obstaclePlacements, ...faunaPlacements, ...portalPlacements, ...boundaryResult.wallPlacements, ...boundaryResult.guardPlacements, ...proximityGuards.guardPlacements]) {
    tempIdToPlacement.set(placement.tempId, placement)
    let group = objectGroups.get(placement.sid)
    if (!group) { group = { ids: [], nodes: [], rotations: [], levels: [] }; objectGroups.set(placement.sid, group) }
    group.ids.push(placement.tempId)
    group.nodes.push(placement.node)
    group.rotations.push(0)
    group.levels.push(0)
  }
  for (const placement of obstaclePlacements) decorativeIds.add(placement.tempId)
  for (const placement of faunaPlacements) decorativeIds.add(placement.tempId)
  // Wall obstacles are decorative too (deletable if one seals off a real
  // target) — gate GUARDS are deliberately NOT, matching every other real
  // guard this generator places (a dwelling/mine/treasure guard is never
  // decorative either).
  for (const placement of boundaryResult.wallPlacements) decorativeIds.add(placement.tempId)

  const report = applyAccessibilityPass(
    objectGroups,
    sizeX,
    sizeZ,
    { levelsMap: levelsMapFinal, climbsMap: climbsMapFinal, waterMap: waterMapFinal },
    catalog,
    catalogById,
    decorativeIds,
    portalAdjacency,
    boundaryResult.gateNodes,
    new Set([...roadNodes, ...riverNodes]),
  )
  if (report.stillUnreachable > 0) {
    logWarn(`Random map generation: ${report.stillUnreachable} placed object(s) remained unreachable after the accessibility pass`)
  }

  // Post-generation validation & repair (real user report: "the validation
  // pass must really look for impossible cases... quality over speed") —
  // see zone-validation.ts's own header comment for the full design. Runs
  // here, after every placement/nudge decision is final but BEFORE anything
  // is committed to the real container, so a repair is just "don't place
  // this after all" rather than needing to edit an already-serialized chunk.
  const allZoneIds = graph.zones.map((z) => z.id)
  const sealedResult = repairSealedZones({
    sizeX, sizeZ, zoneIds: allZoneIds, zoneIdByNode, objectGroups,
    decorativePlacements: [...obstaclePlacements, ...boundaryResult.wallPlacements],
    spawnerSid: playerSpawnerSid,
    catalog, catalogById, levelsMap: levelsMapFinal, climbsMap: climbsMapFinal, waterMap: waterMapFinal,
    portalAdjacency,
  })
  // A zone repairSealedZones opened by adding a ramp (its own second repair
  // tactic, for the case decorative-obstacle removal alone can't fix — a
  // real elevation wall, not a decorative object) needs that ramp painted
  // into the actual container too, same as every other climb tile above.
  if (sealedResult.addedClimbChanges.length > 0) {
    block2 = paintClimbTiles(block2, sealedResult.addedClimbChanges)
    for (const { node } of sealedResult.addedClimbChanges) climbsMapFinal[node] = 1
  }
  if (sealedResult.sealedZoneIds.length > 0) {
    logWarn(`Random map generation: ${sealedResult.sealedZoneIds.length} zone(s) had no reachable opening at all — repaired by removing bordering decorative obstacles`)
  }
  if (sealedResult.stillSealedZoneIds.length > 0) {
    logWarn(`Random map generation: ${sealedResult.stillSealedZoneIds.length} zone(s) remained sealed even after decorative-obstacle removal (nothing removable bordered them — a real, non-decorative placement is the blocker) — a genuinely degenerate case`)
  }

  const waterCollisionResult = reclaimWaterCollisions({
    objectGroups, concreteSquads: allConcreteSquads, waterNodes: waterNodesAll,
    waterCompatibleSids: WATER_COMPATIBLE_FAUNA_SIDS,
  })
  if (waterCollisionResult.reclaimedNodes.size > 0) {
    logWarn(`Random map generation: ${waterCollisionResult.reclaimedNodes.size} placed object/squad(s) ended up on a water tile — reclaimed that tile back to land`)
    for (const node of waterCollisionResult.reclaimedNodes) {
      waterMapFinal[node] = 0
      levelsMapFinal[node] = 0
    }
  }

  const additions: { sid: string; node: number; randomSquadOverrides?: { requestedValue: number; fraction: string; weeklyIncrementBonus?: number }; randomItemOverrides?: { rarity: number }; randomCityOverrides?: { factionSid: string; spawnHero: boolean } }[] = []
  const additionTempIds: number[] = [] // parallel to additions — needed to remap portal temp ids to real ids below
  for (const [sid, group] of objectGroups) {
    if (sid === playerSpawnerSid) continue // already committed to the container by buildBlankMap
    for (let i = 0; i < group.ids.length; i++) {
      const tempId = group.ids[i]
      const placement = tempIdToPlacement.get(tempId)
      if (!placement) continue
      additions.push({ sid, node: group.nodes[i], randomSquadOverrides: placement.randomSquadOverrides, randomItemOverrides: placement.randomItemOverrides, randomCityOverrides: placement.randomCityOverrides })
      additionTempIds.push(tempId)
    }
  }

  const { block2Chunk, newIds } = addObjectInstances(block2, additions)
  let finalBlock1 = container.chunks[0]
  let finalBlock2 = block2Chunk

  // Concrete-squad guards (zone-population.ts's `placeGuard` variety roll,
  // plus zone-boundary.ts's own gate-guard variety roll) — real `squads[]`
  // (entityType 2) army placements, written one at a time via
  // `addObjectInstance` since `addObjectInstances`'s bulk path is
  // `objectsFreeId`/type-0-only. These never went through `objectGroups`/
  // the accessibility pass above (squads aren't terrain in this codebase's
  // own passability model, so they have nothing for that pass to nudge or
  // check), so they're added here, after it, exactly like `setCityFaction`
  // and `upsertPropPortals` below are.
  for (const squad of allConcreteSquads) {
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
  // city-spawner's real faction, rather than leaving it unconfigured. Each
  // player also gets a real starting hero matching that faction (see below) —
  // playerSpawnerSid === 'hero-spawner' (a separate, rarer player-start kind)
  // has no equivalent here; CLAUDE.md documents "random" as GME's own real
  // default for an unconfigured hero-spawner, unlike city-spawner's own
  // unconfigured state.
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
    // Every real player city on every known-working sample map (Broken_Alliance,
    // Stormlight) ships with a real, named starting hero (propHeroes isDefined:true)
    // — RMG previously gave none at all (propHeroes stayed completely empty), which
    // is what actually froze the game at 100% load: real player.log testing showed
    // the AI's per-frame hero-resolution pass fails identically for all 177 catalog
    // heroes when propHeroes has zero entries (Stormlight, with 5 real entries,
    // fails for none), crashing with an uncaught exception in AI area-processing
    // code. A prior fix attempt only synced the propCities.spawnHero flag to match
    // the (still-empty) propHeroes table — that kept the flag/table consistent but
    // never put real data in the table, so it didn't change the crash at all.
    // Assigning every player a real hero is also a deliberate design choice, not
    // just a crash workaround — a template-driven generation may override this.
    const usedHeroSids = new Set<string>()
    for (const [zoneId, playerId] of playerZoneIndex) {
      const biome = zoneBiome.get(zoneId) ?? ZONE_BIOMES[0]
      const faction = BIOME_FACTION[biome]
      if (!faction) continue
      const result = setCityFaction(finalBlock1, finalBlock2, 0, playerId, faction)
      finalBlock1 = result.block1Chunk
      finalBlock2 = result.block2Chunk

      // A plain /^[a-z]+_hero_\d+$/ shape isn't enough — Core/DB/heroes/campaign_tutorial
      // ships e.g. "tutorial_hero_2" and Core/DB/heroes/campaign ships e.g.
      // "campaign_hero_4", both matching that shape too. Only these 6 real per-faction
      // roster prefixes (Core/DB/heroes/humans|necros|demons|dungeon|unfrozen|nature)
      // are meant for a generic skirmish/random-map start; confirmed via every real
      // sample's own sids (e.g. Stormlight's human_hero_9/nature_hero_10/demon_hero_9/necro_hero_9).
      const factionHeroes = catalog.heroes.filter((h) => h.fraction === faction && /^(human|necro|demon|dungeon|unfrozen|nature)_hero_\d+$/.test(h.id))
      const unusedFactionHeroes = factionHeroes.filter((h) => !usedHeroSids.has(h.id))
      const heroPool = unusedFactionHeroes.length > 0 ? unusedFactionHeroes : factionHeroes
      if (heroPool.length === 0) continue // no catalog heroes for this faction — leave unconfigured rather than guess
      const hero = heroPool[Math.floor(rng() * heroPool.length)]
      usedHeroSids.add(hero.id)

      const spawnResult = setCitySpawnHero(finalBlock1, finalBlock2, 0, playerId, true)
      finalBlock1 = spawnResult.block1Chunk
      finalBlock2 = spawnResult.block2Chunk
      const heroResult = upsertPropHero(finalBlock1, finalBlock2, 0, playerId, hero.id)
      finalBlock1 = heroResult.block1Chunk
      finalBlock2 = heroResult.block2Chunk
    }
  }

  // Patch the real container with any water tile the validation pass above
  // reclaimed back to land (`waterMapFinal`/`levelsMapFinal` were already
  // updated at the point of reclaim — this just makes the actual `.map`
  // bytes agree with them, same two-call pattern the road generator's own
  // water-partition repair already uses).
  if (waterCollisionResult.reclaimedNodes.size > 0) {
    const reclaimed = [...waterCollisionResult.reclaimedNodes]
    finalBlock2 = paintWaterTiles(finalBlock2, reclaimed.map((node) => ({ node, waterId: 0 })))
    finalBlock2 = paintLevelTiles(finalBlock2, reclaimed.map((node) => ({ node, level: 0 })))
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

  // Stage 4 (issue #210) — a game-template import's own gameRules/
  // globalBans, mapped onto Block2's `settings`/both blocks' `banInfoData`
  // (map-write.ts's own `patchGameRules` doc comment has the full field
  // mapping and why `winConditions` is deliberately never touched).
  if (gameTemplateJson) {
    const rawTemplate = parseGameTemplateJson(gameTemplateJson)
    const gameRulesPatch = extractGameRulesPatch(rawTemplate)
    const patched = patchGameRules(finalBlock1, finalBlock2, gameRulesPatch)
    finalBlock1 = patched.block1Chunk
    finalBlock2 = patched.block2Chunk
  }

  const finalChunks = container.chunks.slice()
  finalChunks[0] = finalBlock1
  finalChunks[1] = finalBlock2

  // Balance scoring (issue #210, Stage 0) — advisory only, ported from a
  // real third-party template editor's own heuristic
  // (github.com/GendizerGaming/olden-era-rmg-editor's balanceAnalyzer.ts —
  // see balance-analyzer.ts's own header comment for the full rationale and
  // disclosed limitations). Wealth is summed from every real guard/treasure
  // placement this generation actually made; exit-guard values come from
  // the zone-boundary chokepoint guards (empty if `boundaryGuardStrength`
  // was 'none').
  const zoneWealth = computeZoneWealth(
    [...placements, ...proximityGuards.guardPlacements, ...boundaryResult.guardPlacements],
    zoneIdByNode,
  )
  const exitGuardsByZone = computeExitGuardsByZone(boundaryResult.guardPlacements, zoneIdByNode)
  const balanceReport = analyzeBalance(graph, zoneWealth, exitGuardsByZone)

  return { container: { ...container, chunks: finalChunks }, balanceReport }
}
