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
// centers. So rather than deriving a "gate" from an abstract edge the way
// VCMI's own `getBorderOutside()` does, this derives it from the REAL,
// already-computed road path for that edge: wherever the road actually
// crosses from one zone's tiles into the other's is the gate, guaranteed
// self-consistent with the real geometry by construction (a road that never
// crosses cleanly between exactly those two zones just gets no gate/guard
// for that edge — a real, disclosed degrade, not a crash).
//
// Every OTHER zone-to-zone boundary tile on the whole map (adjacent zone
// pairs with no road crossing there, or the rest of a guarded edge's own
// shared border outside the gate buffer) gets walled solid with a real,
// biome-appropriate blocking obstacle — a zone's only intended entrances are
// its own road connections. Guard strength scales with the connection's own
// "depth" (hop distance from the nearest player zone) via the SAME
// difficulty-band/value machinery `zone-population.ts` already uses for
// player/neutral-zone guards, and the SAME object-variety concrete-squad
// roll (`object-variety.ts`) `zone-population.ts`'s own `placeGuard` uses —
// deliberately not reinventing VCMI's own `chooseGuard` formula, since this
// codebase already has an equivalent value-to-squad pipeline.

import type { CatalogMapObject, GameCatalog } from '@/lib/catalog/types'
import type { BiomeId } from '@/lib/map-grid/terrain-colors'
import { buildFuzzyObstaclePools } from '@/lib/map-grid/fuzzy-obstacle'
import {
  DEFAULT_SQUAD_DIFFICULTY_RANGES,
  DEFAULT_SQUAD_RANDOM_WEIGHTS,
  pickSquadRange,
  randomInRange,
  sampleFraction,
} from '@/lib/map-grid/squad-pool'
import { pickSquadTemplate } from './object-variety'
import {
  tryPlaceAt,
  ZONE_BIOMES,
  type ConcreteSquadPlacement,
  type PlacementState,
  type ZonePlacement,
} from './zone-population'
import type { ZoneSpec } from './zone-graph'

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

/** The first point along `path` where it actually crosses from `zoneA`'s
 *  own tiles into `zoneB`'s (or the reverse) — `null` if the path never
 *  does (a real, disclosed case: Penrose-tiling zone shaping doesn't
 *  guarantee a graph-edge pair's own road path crosses cleanly between
 *  exactly those two zones, e.g. if a third zone's territory intrudes). */
function findCrossing(path: number[], zoneIdByNode: number[], zoneA: number, zoneB: number): [number, number] | null {
  for (let i = 1; i < path.length; i++) {
    const za = zoneIdByNode[path[i - 1]]
    const zb = zoneIdByNode[path[i]]
    if ((za === zoneA && zb === zoneB) || (za === zoneB && zb === zoneA)) return [path[i - 1], path[i]]
  }
  return null
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
export type BoundaryGuardStrength = 'none' | 'normal' | 'strong'

const DIFFICULTY_MULTIPLIER: Record<BoundaryGuardStrength, number> = { none: 0, normal: 1, strong: 1.5 }

/** Hop-distance-from-nearest-player-zone → the existing `squad-pool.ts`
 *  difficulty band it maps to — depth 0/1 (touches, or one hop from, a
 *  player zone) is `Easy`, climbing to `Lethal` for the deepest connections
 *  a ring topology produces at real player counts (2-8 players → depth
 *  0-4ish). Not derived from real game data (there's no per-connection
 *  "guard" field to read the way VCMI's own template format has) — a
 *  reasonable topology-driven default, same spirit as `zone-population.ts`'s
 *  own flat-roll fallback for a mine with no real guard-value data. */
function depthToDifficultyLabel(depth: number): string {
  if (depth <= 1) return 'Easy'
  if (depth === 2) return 'Normal'
  if (depth === 3) return 'Difficult'
  if (depth === 4) return 'Impossible'
  return 'Lethal'
}

export interface FortifyZoneBoundariesOptions {
  sizeX: number
  sizeZ: number
  zones: ZoneSpec[]
  edges: [number, number][]
  zoneIdByNode: number[]
  zoneBiome: Map<number, BiomeId>
  /** Each edge's own already-computed, already-smoothed road path (keyed
   *  `"${a}:${b}"`, matching `edges`' own tuple order) — the gate is
   *  derived from where this REAL path crosses zones, not from `edges`
   *  alone (see this file's own header comment on why). */
  roadPathsByEdge: Map<string, number[]>
  /** All-pairs zone-graph hop distance (`zoneDistanceMatrix`'s own output)
   *  — used to compute each connection's own "depth" (how far from the
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
  strength: BoundaryGuardStrength
  state: PlacementState
  rng: () => number
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
 * Walls every zone-to-zone boundary tile not part of a real road's own
 * gate, and places one value-budgeted guard per connection that has a real
 * gate — see this file's own header comment for the full design. Returns
 * empty results immediately if `strength === 'none'` (the default), so a
 * caller doesn't need its own separate opt-out branch.
 */
export function fortifyZoneBoundaries(options: FortifyZoneBoundariesOptions): FortifyZoneBoundariesResult {
  const empty: FortifyZoneBoundariesResult = { wallPlacements: [], guardPlacements: [], concreteSquads: [], gateNodes: new Set() }
  if (options.strength === 'none') return empty

  const {
    sizeX, sizeZ, zones, edges, zoneIdByNode, zoneBiome, roadPathsByEdge, zoneDistances,
    catalogById, mapObjects, catalog, objectVariety, strength, state, rng,
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

  for (const [a, b] of edges) {
    const path = roadPathsByEdge.get(`${a}:${b}`)
    if (!path) continue
    const crossing = findCrossing(path, zoneIdByNode, a, b)
    if (!crossing) continue

    for (const n of gateBuffer(crossing, sizeX, sizeZ, GATE_BUFFER_RADIUS)) gateBufferAll.add(n)
    gateNodes.add(crossing[0])
    gateNodes.add(crossing[1])

    const depthA = depthByZone.get(a) ?? 0
    const depthB = depthByZone.get(b) ?? 0
    const depth = Math.max(depthA, depthB)
    const difficultyLabel = depthToDifficultyLabel(depth)
    const range = pickSquadRange([difficultyLabel], DEFAULT_SQUAD_DIFFICULTY_RANGES, DEFAULT_SQUAD_RANDOM_WEIGHTS, rng)
    const requestedValue = Math.round(randomInRange(range.min, range.max, rng) * multiplier)

    // The guard sits on the DEEPER zone's own side of the crossing — the
    // side a player reaches only after already fighting through the
    // shallower one, matching a real chokepoint's own defensive logic.
    const guardZoneId = depthA >= depthB ? a : b
    const guardNode = depthA >= depthB ? crossing[0] : crossing[1]
    const biome = zoneBiome.get(guardZoneId) ?? ZONE_BIOMES[0]
    const fraction = sampleFraction(biome, 0.7, rng)

    if (catalog && objectVariety !== undefined && rng() < objectVariety) {
      const template = pickSquadTemplate(catalog, fraction, requestedValue, rng)
      if (template && !state.usedAnchors.has(guardNode)) {
        state.usedAnchors.add(guardNode)
        concreteSquads.push({ tempId: state.nextTempId++, sid: template.id, node: guardNode })
        continue
      }
    }
    if (tryPlaceAt('random-squad', guardNode, sizeX, sizeZ, catalogById, state)) {
      guardPlacements.push({ tempId: state.nextTempId++, sid: 'random-squad', node: guardNode, randomSquadOverrides: { requestedValue, fraction } })
    }
  }

  // Wall pass — every zone-boundary tile on the WHOLE map (issue #210's own
  // Milestone 6 design note: this isn't scoped to graph edges, since a
  // zone's only intended entrances are its own road connections regardless
  // of which other zones it happens to be geometrically adjacent to) that
  // isn't inside a gate's own buffer and isn't already claimed by anything
  // else this generation pass placed.
  const pools = buildFuzzyObstaclePools(mapObjects)
  const wallPlacements: ZonePlacement[] = []
  for (const node of computeAllBoundaryTiles(zoneIdByNode, sizeX, sizeZ)) {
    if (gateBufferAll.has(node)) continue
    if (state.blocked.has(node) || state.usedAnchors.has(node)) continue
    const biome = zoneBiome.get(zoneIdByNode[node]) ?? ZONE_BIOMES[0]
    const pool = pools[biome]
    const candidates = pool.obstacles.length > 0 ? pool.obstacles : pool.mountains
    if (candidates.length === 0) continue
    const sid = candidates[Math.floor(rng() * candidates.length)]
    if (tryPlaceAt(sid, node, sizeX, sizeZ, catalogById, state)) {
      wallPlacements.push({ tempId: state.nextTempId++, sid, node })
    }
  }

  return { wallPlacements, guardPlacements, concreteSquads, gateNodes }
}
