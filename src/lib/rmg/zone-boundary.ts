// ─── RMG guarded zone boundaries (issue #210, Milestone 6) ──────────────────
// VCMI-style zone-to-zone chokepoints — researched directly from VCMI source
// before writing this (`lib/rmg/modificators/ConnectionsPlacer.cpp`,
// `ObjectManager.cpp::chooseGuard`, `docs/modders/Random_Map_Template.md` —
// see issue #210's own Milestone 6 write-up for the full citation), not just
// the third-party summary that prompted the milestone. Real difference from
// VCMI's own approach, needed because this generator's own zone shaping
// (Penrose-tiling vertex assignment, not a template-authored topology)
// doesn't guarantee every zone-graph EDGE pair is even geometrically
// adjacent — a third zone can sit between two graph-connected zones' own
// centers.
//
// A first version of this file derived one "gate" per abstract graph EDGE,
// requiring that edge's own road path to cross DIRECTLY between its two
// declared zones. Real-map measurement (a user report: "the guard at the
// opening is missing most of the time") found this failed on 50-80%+ of
// real edges — organic winding roads (a real, separately-fixed user
// request) very commonly drift through a third zone's corner on the way
// from A to B, which a strict "A steps directly to B" check never matches,
// even though the road demonstrably connects both zones just fine.
//
// This version derives gates from EVERY real zone-boundary crossing any
// edge's own road path actually makes, whichever zones are on either side —
// not just crossings that happen to match a declared edge's own endpoints.
// Each such crossing becomes a real gate (and, per zone entered, a guard),
// so a road that legitimately passes through zone C on its way from A to B
// gets C's own entrance guarded too, exactly as real as A's or B's — a
// strictly MORE complete picture of "where can this map actually be
// entered", not an approximation of the original per-edge idea.
//
// Every OTHER zone-to-zone boundary tile on the whole map (adjacent zone
// pairs no road ever actually crosses) gets walled solid with a real,
// biome-appropriate blocking obstacle — a zone's only real entrances are
// wherever a real road actually enters it. Guard strength scales with the
// entered zone's own "depth" (hop distance from the nearest player zone)
// via the SAME difficulty-band/value machinery `zone-population.ts` already
// uses for player/neutral-zone guards, and the SAME object-variety
// concrete-squad roll (`object-variety.ts`) `zone-population.ts`'s own
// `placeGuard` uses — deliberately not reinventing VCMI's own `chooseGuard`
// formula, since this codebase already has an equivalent value-to-squad
// pipeline.

import type { CatalogMapObject, GameCatalog } from '@/lib/catalog/types'
import type { BiomeId } from '@/lib/map-grid/terrain-colors'
import { buildFuzzyObstaclePools } from '@/lib/map-grid/fuzzy-obstacle'
import {
  pickSquadRange,
  randomInRange,
  sampleFraction,
} from '@/lib/map-grid/squad-pool'
import { GUARD_CONCRETE_SQUAD_CHANCE_SCALE, RMG_GUARD_DIFFICULTY_RANGES, RMG_GUARD_RANDOM_WEIGHTS } from './guard-value-bands'
import { pickSquadTemplate } from './object-variety'
import {
  tryPlaceAt,
  ZONE_BIOMES,
  type ConcreteSquadPlacement,
  type PlacementState,
  type ZonePlacement,
} from './zone-population'
import type { ZoneSpec } from './zone-graph'
//import {CLUSTER_MOUNTAIN_HEAVY_CHANCE} from "@/lib/rmg/zone-decoration.ts";

/** Every tile whose immediate (4-neighbor) cell belongs to a DIFFERENT zone
 *  — both sides of every zone-to-zone border on the whole map, regardless
 *  of whether that particular pair has a zone-graph edge (a road) between
 *  them. Only checks the E/S neighbor per tile (the standard "each adjacent
 *  pair counted once" trick), but adds BOTH sides of a differing pair, so
 *  the result is symmetric regardless of scan direction. */
function computeAllBoundaryTiles(zoneIdByNode: number[], sizeX: number, sizeZ: number): Set<number> {
  const boundary = new Set<number>()
  for (let z = 0; z < sizeZ; z++) {
    for (let x = 0; x < sizeX; x++) {
      const node = z * sizeX + x
      const zoneId = zoneIdByNode[node]
      if (x + 1 < sizeX && zoneIdByNode[node + 1] !== zoneId) { boundary.add(node); boundary.add(node + 1) }
      if (z + 1 < sizeZ && zoneIdByNode[node + sizeX] !== zoneId) { boundary.add(node); boundary.add(node + sizeX) }
    }
  }
  return boundary
}

export interface PathCrossing {
  /** The zone `path` steps INTO at this crossing. */
  enteringZone: number
  /** The tile just inside `enteringZone` — where a guard for this crossing
   *  would stand. */
  enteringNode: number
  /** The tile just inside the zone `path` is LEAVING — the other half of
   *  the gate buffer (a gate needs clearance on both sides). */
  exitingNode: number
}

/** Every real zone-to-zone crossing `path` makes, in path order — not just
 *  ones matching a specific declared (zoneA, zoneB) pair (see this file's
 *  own header comment on why that was too strict: a winding road commonly
 *  drifts through a third zone on the way from its own start to its own
 *  end, and that third zone's own entrance is just as real a gate as the
 *  path's declared endpoints). */
function findCrossings(path: number[], zoneIdByNode: number[]): PathCrossing[] {
  const crossings: PathCrossing[] = []
  for (let i = 1; i < path.length; i++) {
    const za = zoneIdByNode[path[i - 1]]
    const zb = zoneIdByNode[path[i]]
    if (za === zb) continue
    crossings.push({ enteringZone: zb, enteringNode: path[i], exitingNode: path[i - 1] })
  }
  return crossings
}

/** Every tile within Chebyshev `radius` of any of `nodes` — the "keep this
 *  much breathing room open around the gate" buffer, excluded from the
 *  wall pass below regardless of which zone each buffer tile itself
 *  belongs to (a gate needs clearance on both sides to read as a real
 *  passage, not just a single unblocked tile in an otherwise solid wall). */
function gateBuffer(nodes: number[], sizeX: number, sizeZ: number, radius: number): Set<number> {
  const buffer = new Set<number>()
  for (const node of nodes) {
    const cx = node % sizeX
    const cz = Math.floor(node / sizeX)
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const x = cx + dx
        const z = cz + dz
        if (x < 0 || x >= sizeX || z < 0 || z >= sizeZ) continue
        buffer.add(z * sizeX + x)
      }
    }
  }
  return buffer
}

/** VCMI's own `monsters: weak/normal/strong/none` per-zone difficulty
 *  concept, adapted to a per-connection guard-strength control since this
 *  generator derives connections from the zone graph, not a per-zone
 *  template field. `'none'` skips this whole module's own work (no walls,
 *  no gate guards) — the safe, conservative default, since walling zone
 *  boundaries is a real structural change to every zone's own shape, not
 *  just a decoration density tweak. */
export type BoundaryGuardStrength = 'none' | 'normal' | 'strong' | 'very strong'

const DIFFICULTY_MULTIPLIER: Record<BoundaryGuardStrength, number> = { none: 0, normal: 1, strong: 1.5, 'very strong': 2.5 }

/** A zone boundary's own gate is a mandatory chokepoint on the way to
 *  anything past it — a real user request: it should never be trivial,
 *  regardless of how close to a player start it sits, so unlike a mine or
 *  treasure guard (see zone-guard-scatter.ts's own distance-scaled
 *  difficulty) this floors at `Impossible` rather than starting at `Easy`.
 *  Still climbs to `Lethal` for the deepest connections a ring topology
 *  produces at real player counts (2-8 players → depth 0-4ish). Not
 *  derived from real game data (there's no per-connection "guard" field to
 *  read the way VCMI's own template format has) — a reasonable
 *  topology-driven default, same spirit as `zone-population.ts`'s own
 *  flat-roll fallback for a mine with no real guard-value data. */
function depthToDifficultyLabel(depth: number): string {
  if (depth <= 3) return 'Impossible'
  return 'Lethal'
}

export interface FortifyZoneBoundariesOptions {
  sizeX: number
  sizeZ: number
  zones: ZoneSpec[]
  zoneIdByNode: number[]
  zoneBiome: Map<number, BiomeId>
  /** Every road's own already-computed, already-smoothed path (roads AND
   *  the river — a river crossing a zone boundary is just as real a gate
   *  as a road doing it). Gates are derived from every REAL crossing any
   *  of these paths makes, not from the abstract zone-graph edge list (see
   *  this file's own header comment on why). */
  roadPaths: number[][]
  /** All-pairs zone-graph hop distance (`zoneDistanceMatrix`'s own output)
   *  — used to compute each entered zone's own "depth" (how far from the
   *  nearest player zone) for guard-strength scaling. */
  zoneDistances: number[][]
  catalogById: Map<string, CatalogMapObject>
  mapObjects: CatalogMapObject[]
  /** Needed for the object-variety concrete-squad roll (`pickSquadTemplate`)
   *  — omit to always place `random-squad` placeholders instead. */
  catalog?: GameCatalog
  /** 0-1 chance a gate guard rolls a concrete `squads[]` army instead of a
   *  `random-squad` placeholder — the SAME option/semantics as
   *  `zone-population.ts`'s own `placeGuard`. No effect if `catalog` is
   *  omitted. */
  objectVariety?: number
  mountainDensity: number
  strength: BoundaryGuardStrength
  state: PlacementState
  rng: () => number
  /** Zone ids that became real islands (`islandLandmassByZone`'s own keys
   *  in generate-random-map.ts) — these zones' own boundary tiles are
   *  skipped entirely by the wall-placement loop below. Real bug confirmed
   *  2026-09-08: `zoneIdByNode` still reports an island zone's ORIGINAL,
   *  pre-shrink Voronoi boundary against its neighbors (only `tilesByZone`/
   *  `islandLandmassByZone` reflect the shrunk landmass — see generate-
   *  terrain.ts's own comment on this), so this pass was walling a
   *  boundary that's now mostly flooded moat, with no concept of "this
   *  zone is reached by portal, not a walkable gate." A wall placed near
   *  the portal's own tile (or simply enclosing the whole shrunk landmass
   *  with no gate, since gates are only ever cut for road/river crossings)
   *  could fully seal an island in — and the accessibility pass that runs
   *  afterward doesn't reopen it, it NUDGES the trapped portal object out
   *  to the nearest reachable tile instead, relocating it into a
   *  completely different, unrelated zone and leaving the island with no
   *  portal at all. An island's real security already comes from being
   *  surrounded by water — walling its notional leftover boundary serves
   *  no purpose and actively breaks its only access. Defaults to empty so
   *  a non-islands caller sees no behavior change. */
  islandZoneIds?: Set<number>
  /** Real bug confirmed 2026-09-09 (found while tracing why `zone-fauna.ts`'s
   *  fish placements kept failing — the actual root cause there turned out
   *  to be unrelated, see that investigation's own notes, but this was a
   *  real defect found along the way): the wall loop below had zero water
   *  awareness — it happily claimed `usedAnchors`/`blocked` on a zone-
   *  boundary tile that was already water (a lake can validly touch its own
   *  zone's boundary, since `scatterZoneWater` only scopes eligibility to
   *  ONE zone's tiles, not away from that zone's edges), wastefully placing
   *  a mountain/rock obstacle that `reclaimWaterCollisions` then has to
   *  notice and convert back to land. Skips a water tile entirely instead —
   *  never placed here, never wastefully claimed/reclaimed. Optional so a
   *  caller with no water pass (or `waterContent: 'none'`) sees no change. */
  waterNodes?: Set<number>
}

export interface FortifyZoneBoundariesResult {
  wallPlacements: ZonePlacement[]
  guardPlacements: ZonePlacement[]
  concreteSquads: ConcreteSquadPlacement[]
  /** The exact gate-crossing nodes (not the whole buffer) — hand these to
   *  `applyAccessibilityPass`'s own `mustBeReachable` param so a decorative
   *  wall obstacle elsewhere can never get nudged onto one by mistake. */
  gateNodes: Set<number>
}

const GATE_BUFFER_RADIUS = 2

/**
 * Walls every zone-to-zone boundary tile no real road/river ever crosses,
 * and places one value-budgeted guard at every real crossing any of them
 * make — see this file's own header comment for the full design. Returns
 * empty results immediately if `strength === 'none'` (the default), so a
 * caller doesn't need its own separate opt-out branch.
 */
export function fortifyZoneBoundaries(options: FortifyZoneBoundariesOptions): FortifyZoneBoundariesResult {
  const empty: FortifyZoneBoundariesResult = { wallPlacements: [], guardPlacements: [], concreteSquads: [], gateNodes: new Set() }
  if (options.strength === 'none') return empty

  const {
    sizeX, sizeZ, zones, zoneIdByNode, zoneBiome, roadPaths, zoneDistances,
    catalogById, mapObjects, catalog, objectVariety, mountainDensity, strength, state, rng,
    islandZoneIds, waterNodes,
  } = options

  const playerZoneIds = zones.filter((z) => z.kind === 'player').map((z) => z.id)
  const depthByZone = new Map<number, number>()
  for (const zone of zones) {
    let best = Infinity
    for (const playerId of playerZoneIds) best = Math.min(best, zoneDistances[zone.id][playerId])
    depthByZone.set(zone.id, Number.isFinite(best) ? best : 0)
  }

  const gateNodes = new Set<number>()
  const gateBufferAll = new Set<number>()
  const guardPlacements: ZonePlacement[] = []
  const concreteSquads: ConcreteSquadPlacement[] = []
  const multiplier = DIFFICULTY_MULTIPLIER[strength]
  const guardedNodes = new Set<number>()

  for (const path of roadPaths) {
    for (const crossing of findCrossings(path, zoneIdByNode)) {
      for (const n of gateBuffer([crossing.enteringNode, crossing.exitingNode], sizeX, sizeZ, GATE_BUFFER_RADIUS)) gateBufferAll.add(n)
      gateNodes.add(crossing.enteringNode)
      gateNodes.add(crossing.exitingNode)

      // One guard per distinct crossing TILE — a zone with two real
      // connections (the common case in this generator's own ring
      // topology) gets guarded at both, and a zone a road merely passes
      // through on the way elsewhere gets its own entrance guarded too,
      // exactly as real a chokepoint as any other.
      if (guardedNodes.has(crossing.enteringNode)) continue
      guardedNodes.add(crossing.enteringNode)

      const depth = depthByZone.get(crossing.enteringZone) ?? 0
      const difficultyLabel = depthToDifficultyLabel(depth)
      const range = pickSquadRange([difficultyLabel], RMG_GUARD_DIFFICULTY_RANGES, RMG_GUARD_RANDOM_WEIGHTS, rng)
      const requestedValue = Math.round(randomInRange(range.min, range.max, rng) * multiplier)

      const guardNode = crossing.enteringNode
      const biome = zoneBiome.get(crossing.enteringZone) ?? ZONE_BIOMES[0]
      const fraction = sampleFraction(biome, 0.7, rng)

      if (catalog && objectVariety !== undefined && rng() < objectVariety * GUARD_CONCRETE_SQUAD_CHANCE_SCALE) {
        const template = pickSquadTemplate(catalog, fraction, requestedValue, rng)
        if (template && !state.usedAnchors.has(guardNode)) {
          state.usedAnchors.add(guardNode)
          concreteSquads.push({ tempId: state.nextTempId++, sid: template.id, node: guardNode })
          continue
        }
      }
      if (tryPlaceAt('random-squad', guardNode, sizeX, sizeZ, catalogById, state)) {
        // A mandatory chokepoint should get harder if a player dawdles
        // rather than rushing it — real Olden Era RMG templates' own
        // `guardWeeklyIncrement` (0.10-0.20, seen repeatedly on treasure/
        // center zone connections) and a real `.map` survey this session
        // (`propRandomSquads.weeklyIncrementBonus` across `maps/*.map`,
        // 1339 rows: mostly 0, but a real ~7.5% minority uses 0.05-0.30)
        // both confirm this is real, shipped behavior this generator never
        // wrote before. A flat 50% roll (not every gate guard) — gate
        // guards are already a comparatively small slice of a map's total
        // guards, but a real regeneration/stats pass this session found
        // "every gate guard" still pushed the map-wide nonzero rate to
        // 45-75%, nowhere near the real minority — this roll brings it back
        // toward a genuine minority without losing the mechanic entirely.
        const weeklyIncrementBonus = rng() < 0.5 ? 0.15 : undefined
        guardPlacements.push({ tempId: state.nextTempId++, sid: 'random-squad', node: guardNode, randomSquadOverrides: { requestedValue, fraction, weeklyIncrementBonus } })
      }
    }
  }

  // Wall pass — every zone-boundary tile on the WHOLE map (issue #210's own
  // Milestone 6 design note: this isn't scoped to graph edges, since a
  // zone's only intended entrances are its own road connections regardless
  // of which other zones it happens to be geometrically adjacent to) that
  // isn't inside a gate's own buffer and isn't already claimed by anything
  // else this generation pass placed. Never walls a zone smaller than
  // `MIN_ZONE_SIZE_TO_WALL` tiles at all — real testing on a genuinely
  // tiny 16×16/2-player map found a zone that small can be almost entirely
  // consumed by its own mine+dwelling+guard footprints, leaving so little
  // free boundary that walling it risks sealing it in with nothing
  // removable left for `repairSealedZones` (zone-validation.ts) to fix
  // afterward — cheaper to just not wall a zone that fragile in the first
  // place than to rely on repair catching every such case.
  const MIN_ZONE_SIZE_TO_WALL = 40
  const zoneTileCounts = new Map<number, number>()
  for (const zoneId of zoneIdByNode) zoneTileCounts.set(zoneId, (zoneTileCounts.get(zoneId) ?? 0) + 1)

  const pools = buildFuzzyObstaclePools(mapObjects)
  const wallPlacements: ZonePlacement[] = []
  for (const node of computeAllBoundaryTiles(zoneIdByNode, sizeX, sizeZ)) {
    if (gateBufferAll.has(node)) continue
    if (state.blocked.has(node) || state.usedAnchors.has(node)) continue
    if (waterNodes?.has(node)) continue
    const nodeZoneId = zoneIdByNode[node]
    // An island zone's real security already comes from being surrounded
    // by water, and it's reached ONLY by portal — walling its own
    // (mostly-flooded, post-shrink) notional Voronoi boundary risks
    // sealing that portal in with no gate (gates are only ever cut for
    // road/river crossings), which the later accessibility pass then
    // "fixes" by relocating the trapped portal into an unrelated zone
    // entirely — see this option's own doc comment for the full story.
    if (islandZoneIds?.has(nodeZoneId)) continue
    if ((zoneTileCounts.get(nodeZoneId) ?? 0) < MIN_ZONE_SIZE_TO_WALL) continue
    const biome = zoneBiome.get(nodeZoneId) ?? ZONE_BIOMES[0]
    const pool = pools[biome]
    //const candidates = pool.obstacles.length > 0 ? pool.obstacles : pool.mountains
    const mountainHeavy = pool.mountains.length > 0 && rng() < mountainDensity
    const candidates = mountainHeavy ? pool.mountains : pool.obstacles.length > 0 ? pool.obstacles : pool.mountains;

    if (candidates.length === 0) continue
    const sid = candidates[Math.floor(rng() * candidates.length)]
    if (tryPlaceAt(sid, node, sizeX, sizeZ, catalogById, state)) {
      wallPlacements.push({ tempId: state.nextTempId++, sid, node })
    }
  }

  return { wallPlacements, guardPlacements, concreteSquads, gateNodes }
}
