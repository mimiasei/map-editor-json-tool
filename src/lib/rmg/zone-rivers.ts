// ─── RMG natural rivers ──────────────────────────────────────────────────────
// A river starts at a mountain on a hill, runs off the hill once (a
// waterfall), then follows level ground to a lake, the sea or the map edge —
// preferably a real body of water (MIN_MOUTH_WATER_TILES), not a puddle.
// It never climbs and never crosses another hill or a ramp. Without a hill
// big enough to hold a source, a lowland river runs from a lake shore or
// the map edge to another lake or edge.
//
// Waterfall format, from the game's official maps: `isWaterfall` sits on the
// LOWER tile right after the drop, and its `s` is the direction toward the
// higher (upstream) tile — z+1 → 2, z−1 → 1, x−1 → 3, x+1 → 4 — instead of
// the usual connectivity bitmask (river-shape.ts).

import { MinHeap } from './zone-connections'
import { DEFAULT_RIVER_CLIFF_CLEARANCE, DEFAULT_RIVER_MOUTH_WIDENING } from './rmg-tuning'

export interface RiverTerrain {
  sizeX: number
  sizeZ: number
  /** Per-tile level: 1 hill, 0 ground, −1 valley/water. */
  levels: number[]
  /** Per-tile ramp marker (> 0 = ramp). */
  climbs: number[]
  water: Set<number>
  /** Tiles nothing may cross (objects, elevation walls, water). */
  blocked: { has(node: number): boolean }
  usedAnchors: Set<number>
  /** Elevation wall tiles — blocked, but a river may leave its own source
   *  hill over one (that's the waterfall's top). */
  wallNodes: Set<number>
  /** Crossable, but avoided (a river shouldn't run along a road). */
  roadNodes: Set<number>
  /** Tiles already carrying a river — a new river never enters or touches
   *  them (touching rivers would merge their shape codes). */
  riverNodes: Set<number>
  /** Level-0 tiles closer than this (4-neighbour steps) to a hill or elevation
   *  wall are off limits — a river along a cliff foot gets a waterfall on
   *  every wall tile. Only the first steps after the source hill's drop may
   *  stay closer, and only while moving away. 0/unset: no rule. */
  cliffClearance?: number
}

export interface RiverRoute {
  path: number[]
  /** Index in `path` of the first tile below the hill, or null. */
  waterfallIndex: number | null
  /** Extra side tiles that make the lower course wider (see `widenMouth`);
   *  each touches exactly one tile of `path`. */
  widening?: number[]
}

const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]]
const ROAD_COST = 4
const EDGE_COST = 2
const WALL_COST = 2
/** Extra cost per hill tile, so the river leaves its hill soon and most of
 *  it runs on level ground. */
const HILL_COST = 1.5

const cliffDistCache = new WeakMap<number[], Map<number, Uint8Array>>()

/** Per-tile 4-neighbour distance to the nearest hill (level ≥ 1) or elevation
 *  wall tile, capped at `cap` (hill/wall tiles themselves are 0). */
function cliffDistances(t: RiverTerrain, cap: number): Uint8Array {
  let byCap = cliffDistCache.get(t.levels)
  if (!byCap) { byCap = new Map(); cliffDistCache.set(t.levels, byCap) }
  const cached = byCap.get(cap)
  if (cached) return cached
  const { sizeX, sizeZ, levels } = t
  const dist = new Uint8Array(sizeX * sizeZ).fill(cap)
  let frontier: number[] = []
  for (let n = 0; n < levels.length; n++) {
    if (levels[n] >= 1 || t.wallNodes.has(n)) { dist[n] = 0; frontier.push(n) }
  }
  for (let d = 1; d < cap && frontier.length > 0; d++) {
    const next: number[] = []
    for (const n of frontier) {
      const x = n % sizeX
      const z = Math.floor(n / sizeX)
      for (const [dx, dz] of DIRS) {
        const nx = x + dx
        const nz = z + dz
        if (nx < 0 || nx >= sizeX || nz < 0 || nz >= sizeZ) continue
        const m = nz * sizeX + nx
        if (dist[m] > d) { dist[m] = d; next.push(m) }
      }
    }
    frontier = next
  }
  byCap.set(cap, dist)
  return dist
}

/** Smooth 2D value noise in 0..1: random values on a grid of `cell` tiles,
 *  smoothstep-interpolated between them. */
function valueNoise(sizeX: number, sizeZ: number, cell: number, rng: () => number): Float32Array {
  const gx = Math.ceil(sizeX / cell) + 2
  const gz = Math.ceil(sizeZ / cell) + 2
  const grid = Array.from({ length: gx * gz }, () => rng())
  const smooth = (t: number): number => t * t * (3 - 2 * t)
  const out = new Float32Array(sizeX * sizeZ)
  for (let z = 0; z < sizeZ; z++) {
    const fz = z / cell
    const iz = Math.floor(fz)
    const tz = smooth(fz - iz)
    for (let x = 0; x < sizeX; x++) {
      const fx = x / cell
      const ix = Math.floor(fx)
      const tx = smooth(fx - ix)
      const top = grid[iz * gx + ix] + (grid[iz * gx + ix + 1] - grid[iz * gx + ix]) * tx
      const bottom = grid[(iz + 1) * gx + ix] + (grid[(iz + 1) * gx + ix + 1] - grid[(iz + 1) * gx + ix]) * tx
      out[z * sizeX + x] = top + (bottom - top) * tz
    }
  }
  return out
}

/** The per-tile extra cost that makes rivers wind: two octaves of smooth
 *  noise (bends every ~5-12 tiles). The cheapest route follows the noise's
 *  valleys around its ridges, so a stronger `meander` (0-1) means taller
 *  ridges and bigger detours. */
function meanderField(sizeX: number, sizeZ: number, meander: number, rng: () => number): Float32Array {
  const coarse = valueNoise(sizeX, sizeZ, 12, rng)
  const fine = valueNoise(sizeX, sizeZ, 5, rng)
  const amplitude = 0.3 + 6 * meander
  const field = new Float32Array(sizeX * sizeZ)
  for (let i = 0; i < field.length; i++) field[i] = amplitude * (0.65 * coarse[i] + 0.35 * fine[i]) + 0.1 * rng()
  return field
}

/** Lowest-cost river from `start` to the first tile satisfying `isGoal` at
 *  least `minLength` tiles long. Steps never go up a level; level ≥ 1 tiles
 *  are only allowed inside `sourceHill` (null: none at all); valleys, water,
 *  ramps, anchors and blocked tiles are never entered (except the source
 *  hill's own walls). A turn costs extra, so the path doesn't zig-zag. */
export function routeRiver(
  t: RiverTerrain, start: number, sourceHill: Set<number> | null,
  isGoal: (node: number) => boolean, minLength: number, rng: () => number, minLowLength = 0, meander = 0.6,
  /** Overrides for a meander leg: its own turn cost, and an extra per-tile cost. */
  leg?: { turnCost: number; extraCost: (node: number) => number },
): RiverRoute | null {
  const { sizeX, sizeZ, levels } = t
  const noise = meanderField(sizeX, sizeZ, meander, rng)
  const clearance = t.cliffClearance ?? 0
  const cliffDist = clearance > 0 ? cliffDistances(t, clearance) : null
  // A turn costs extra so the path doesn't zig-zag; less so when winding.
  const turnCost = leg?.turnCost ?? 0.4 - 0.3 * meander
  const nearRiver = (n: number): boolean => {
    if (t.riverNodes.has(n)) return true
    const x = n % sizeX
    const z = Math.floor(n / sizeX)
    for (const [dx, dz] of DIRS) {
      const nx = x + dx
      const nz = z + dz
      if (nx >= 0 && nx < sizeX && nz >= 0 && nz < sizeZ && t.riverNodes.has(nz * sizeX + nx)) return true
    }
    return false
  }
  const allowed = (from: number, to: number, lowSoFar: number): boolean => {
    if (t.water.has(to) || t.climbs[to] > 0 || t.usedAnchors.has(to) || nearRiver(to)) return false
    const level = levels[to]
    if (level < 0 || level > levels[from]) return false
    if (level >= 1 && !sourceHill?.has(to)) return false
    if (t.blocked.has(to) && !(sourceHill?.has(to) && t.wallNodes.has(to))) return false
    if (cliffDist && level === 0 && cliffDist[to] < clearance) {
      // Only the exit from the source hill may pass the cliff foot, and only
      // straight away from it.
      if (lowSoFar > clearance || cliffDist[to] <= cliffDist[from]) return false
    }
    return true
  }
  // State = node * 5 + arrival direction (4 = the start).
  const dist = new Map<number, number>()
  const prev = new Map<number, number>()
  const steps = new Map<number, number>()
  // Tiles walked on level 0 so far (after the waterfall).
  const lowSteps = new Map<number, number>()
  const done = new Set<number>()
  const heap = new MinHeap()
  const startState = start * 5 + 4
  dist.set(startState, 0)
  steps.set(startState, 1)
  heap.push(0, startState)
  let goalState: number | null = null
  while (heap.size > 0) {
    const [d, state] = heap.pop() as [number, number]
    if (done.has(state)) continue
    done.add(state)
    const node = Math.floor(state / 5)
    const dir = state % 5
    const len = steps.get(state) ?? 1
    if (node !== start && len >= minLength && (lowSteps.get(state) ?? 0) >= minLowLength && isGoal(node)) { goalState = state; break }
    const x = node % sizeX
    const z = Math.floor(node / sizeX)
    for (let k = 0; k < 4; k++) {
      const nx = x + DIRS[k][0]
      const nz = z + DIRS[k][1]
      if (nx < 0 || nx >= sizeX || nz < 0 || nz >= sizeZ) continue
      const n = nz * sizeX + nx
      if (!allowed(node, n, lowSteps.get(state) ?? 0)) continue
      const next = n * 5 + k
      if (done.has(next)) continue
      let cost = 1 + noise[n] + (leg ? leg.extraCost(n) : 0)
      if (dir !== 4 && dir !== k) cost += turnCost
      if (t.roadNodes.has(n)) cost += ROAD_COST
      if (t.wallNodes.has(n)) cost += WALL_COST
      if (levels[n] >= 1) cost += HILL_COST
      if (nx === 0 || nz === 0 || nx === sizeX - 1 || nz === sizeZ - 1) cost += EDGE_COST
      const nd = d + cost
      if (nd < (dist.get(next) ?? Infinity)) {
        dist.set(next, nd)
        prev.set(next, state)
        steps.set(next, len + 1)
        lowSteps.set(next, (lowSteps.get(state) ?? 0) + (levels[n] === 0 ? 1 : 0))
        heap.push(nd, next)
      }
    }
  }
  if (goalState === null) return null
  const path: number[] = []
  for (let s: number | undefined = goalState; s !== undefined; s = prev.get(s)) path.push(Math.floor(s / 5))
  path.reverse()
  // A path that visits a tile twice (possible across directions) isn't a river.
  if (new Set(path).size !== path.length) return null
  const drop = path.findIndex((n, i) => i > 0 && levels[n] < levels[path[i - 1]])
  return { path, waterfallIndex: drop > 0 ? drop : null }
}

/** Spacing (tiles along the river) of the meander waypoints. */
const MEANDER_SPACING = 8

/** Makes the level-ground part of `route` (after the waterfall, or all of a
 *  lowland river) snake: waypoints every MEANDER_SPACING tiles are pushed
 *  alternately left and right of the river's course (up to 1 + 5×meander
 *  tiles), and the river is re-routed through them. Any part that doesn't
 *  fit (blocked, would touch itself or another river) keeps the original
 *  route — it never fails. */
function meanderRoute(t: RiverTerrain, route: RiverRoute, meander: number, rng: () => number): RiverRoute {
  const { sizeX, sizeZ } = t
  const amplitude = Math.round(1 + 5 * meander)
  const from = route.waterfallIndex ?? 0
  const low = route.path.slice(from)
  if (amplitude < 2 || low.length < MEANDER_SPACING * 2) return route
  const xy = (n: number): [number, number] => [n % sizeX, Math.floor(n / sizeX)]
  const cliffDist = (t.cliffClearance ?? 0) > 0 ? cliffDistances(t, t.cliffClearance as number) : null
  const okTile = (n: number): boolean =>
    t.levels[n] === 0 && !t.water.has(n) && t.climbs[n] === 0 && !t.blocked.has(n) && !t.usedAnchors.has(n) &&
    (!cliffDist || cliffDist[n] >= (t.cliffClearance as number))

  // Waypoints: alternately left/right of the course, the end stays put.
  const waypoints: number[] = []
  let side = rng() < 0.5 ? 1 : -1
  for (let i = MEANDER_SPACING; i < low.length - MEANDER_SPACING / 2; i += MEANDER_SPACING) {
    const [ax, az] = xy(low[Math.max(0, i - 3)])
    const [bx, bz] = xy(low[Math.min(low.length - 1, i + 3)])
    const len = Math.max(1, Math.hypot(bx - ax, bz - az))
    const [px, pz] = [-(bz - az) / len, (bx - ax) / len]
    const [cx, cz] = xy(low[i])
    let wp = low[i]
    for (let d = Math.round(amplitude * (0.6 + 0.4 * rng())); d >= 1; d--) {
      const x = Math.round(cx + px * d * side)
      const z = Math.round(cz + pz * d * side)
      if (x < 0 || x >= sizeX || z < 0 || z >= sizeZ) continue
      if (okTile(z * sizeX + x)) { wp = z * sizeX + x; break }
    }
    waypoints.push(wp)
    side = -side
  }
  waypoints.push(low[low.length - 1])

  // Route leg by leg; earlier tiles count as river so a leg never touches
  // them (the joint tile itself is the leg's start, which is allowed).
  const result = route.path.slice(0, from + 1)
  const taken = new Set(t.riverNodes)
  // Only the river's mouth (its last tile) may touch a lake.
  const mouth = route.path[route.path.length - 1]
  const legTerrain: RiverTerrain = {
    ...t, riverNodes: taken,
    blocked: { has: (n: number) => t.blocked.has(n) || (n !== mouth && touchesWater(n, t)) },
  }
  for (const n of result.slice(0, -1)) taken.add(n)
  let cur = result[result.length - 1]
  for (const wp of waypoints) {
    if (wp === cur) continue
    // Stay near the straight line to the waypoint, no turn cost: the leg
    // becomes a diagonal staircase rather than an L.
    const [ax, az] = xy(cur)
    const [bx, bz] = xy(wp)
    const segLen2 = Math.max(1, (bx - ax) ** 2 + (bz - az) ** 2)
    const offLine = (n: number): number => {
      const [x, z] = xy(n)
      const u = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / segLen2))
      return 0.8 * Math.hypot(x - (ax + u * (bx - ax)), z - (az + u * (bz - az)))
    }
    const leg = routeRiver(legTerrain, cur, null, (n) => n === wp, 1, rng, 0, 0, { turnCost: 0, extraCost: offLine })
    if (!leg) return route
    for (const n of leg.path.slice(0, -1)) taken.add(n)
    // The previous joint tile only now becomes "taken" for later legs.
    result.push(...leg.path.slice(1))
    cur = wp
  }
  if (new Set(result).size !== result.length) return route
  // Never touching itself: every tile's river neighbours are its path neighbours only.
  const index = new Map(result.map((n, i) => [n, i]))
  for (let i = 0; i < result.length; i++) {
    const [x, z] = xy(result[i])
    for (const [dx, dz] of DIRS) {
      const nx = x + dx
      const nz = z + dz
      if (nx < 0 || nx >= sizeX || nz < 0 || nz >= sizeZ) continue
      const j = index.get(nz * sizeX + nx)
      if (j !== undefined && Math.abs(j - i) !== 1) return route
    }
  }
  return { path: result, waterfallIndex: route.waterfallIndex }
}

/** The waterfall tile's `s`: direction from `node` toward the higher tile. */
export function waterfallShapeCode(node: number, upstream: number, sizeX: number): number {
  const dx = (upstream % sizeX) - (node % sizeX)
  const dz = Math.floor(upstream / sizeX) - Math.floor(node / sizeX)
  if (dz === 1) return 2
  if (dz === -1) return 1
  if (dx === -1) return 3
  return 4
}

/** 4-connected components of hill tiles (level ≥ 1). */
function hillComponents(t: RiverTerrain): number[][] {
  const { sizeX, sizeZ, levels } = t
  const seen = new Uint8Array(sizeX * sizeZ)
  const out: number[][] = []
  for (let n = 0; n < levels.length; n++) {
    if (seen[n] || levels[n] < 1) continue
    const comp: number[] = []
    const stack = [n]
    seen[n] = 1
    while (stack.length > 0) {
      const cur = stack.pop() as number
      comp.push(cur)
      const x = cur % sizeX
      const z = Math.floor(cur / sizeX)
      for (const [dx, dz] of DIRS) {
        const nx = x + dx
        const nz = z + dz
        if (nx < 0 || nx >= sizeX || nz < 0 || nz >= sizeZ) continue
        const m = nz * sizeX + nx
        if (!seen[m] && levels[m] >= 1) { seen[m] = 1; stack.push(m) }
      }
    }
    out.push(comp)
  }
  return out
}

const isEdge = (n: number, sizeX: number, sizeZ: number): boolean => {
  const x = n % sizeX
  const z = Math.floor(n / sizeX)
  return x === 0 || z === 0 || x === sizeX - 1 || z === sizeZ - 1
}

function touchesWater(n: number, t: RiverTerrain): boolean {
  const x = n % t.sizeX
  const z = Math.floor(n / t.sizeX)
  for (const [dx, dz] of DIRS) {
    const nx = x + dx
    const nz = z + dz
    if (nx >= 0 && nx < t.sizeX && nz >= 0 && nz < t.sizeZ && t.water.has(nz * t.sizeX + nx)) return true
  }
  return false
}

/** A lake or sea must have at least this many tiles to count as a river's
 *  mouth; a puddle isn't "the sea". Smaller ones are a last resort. */
export const MIN_MOUTH_WATER_TILES = 12

const waterSizeCache = new WeakMap<Set<number>, Map<number, number>>()

/** Size (tiles) of the 4-connected water body each water tile belongs to. */
function waterBodySizes(t: RiverTerrain): Map<number, number> {
  const cached = waterSizeCache.get(t.water)
  if (cached) return cached
  const sizes = new Map<number, number>()
  for (const start of t.water) {
    if (sizes.has(start)) continue
    const body = [start]
    sizes.set(start, 0)
    for (let i = 0; i < body.length; i++) {
      const x = body[i] % t.sizeX
      const z = Math.floor(body[i] / t.sizeX)
      for (const [dx, dz] of DIRS) {
        const nx = x + dx
        const nz = z + dz
        if (nx < 0 || nx >= t.sizeX || nz < 0 || nz >= t.sizeZ) continue
        const m = nz * t.sizeX + nx
        if (t.water.has(m) && !sizes.has(m)) { sizes.set(m, 0); body.push(m) }
      }
    }
    for (const m of body) sizes.set(m, body.length)
  }
  waterSizeCache.set(t.water, sizes)
  return sizes
}

/** Like `touchesWater`, but only a water body of at least `minSize` tiles counts. */
function touchesBigWater(n: number, t: RiverTerrain, minSize: number): boolean {
  const sizes = waterBodySizes(t)
  const x = n % t.sizeX
  const z = Math.floor(n / t.sizeX)
  for (const [dx, dz] of DIRS) {
    const nx = x + dx
    const nz = z + dz
    if (nx >= 0 && nx < t.sizeX && nz >= 0 && nz < t.sizeZ && (sizes.get(nz * t.sizeX + nx) ?? 0) >= minSize) return true
  }
  return false
}

const shuffle = <T>(list: T[], rng: () => number): T[] => {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[list[i], list[j]] = [list[j], list[i]]
  }
  return list
}

/** Makes the river wider toward its mouth: over the last `fraction` of the
 *  path, every other tile gets one side tile (a short stub the shape code
 *  turns into a T-join), more densely closer to the mouth. A stub only goes on
 *  free level ground that touches no other river, road or path tile but its
 *  own parent, and keeps the cliff clearance. Returns the stub tiles. */
function widenMouth(t: RiverTerrain, route: RiverRoute, fraction: number, rng: () => number): number[] {
  const { path } = route
  const { sizeX, sizeZ } = t
  const span = Math.max(4, Math.round(path.length * fraction))
  if (fraction <= 0 || path.length < span + 4) return []
  const clearance = t.cliffClearance ?? 0
  const cliffDist = clearance > 0 ? cliffDistances(t, clearance) : null
  const first = Math.max(path.length - span, (route.waterfallIndex ?? 0) + clearance + 2)
  const onPath = new Set(path)
  const extra: number[] = []
  const occupied = (n: number): boolean => t.riverNodes.has(n) || onPath.has(n) || extra.includes(n)
  for (let i = path.length - 2; i >= first; i -= 2) {
    // Fuller toward the mouth: skip a stub now and then further upstream.
    const closeness = (i - first) / Math.max(1, path.length - first)
    if (rng() > 0.4 + 0.6 * closeness) continue
    const x = path[i] % sizeX
    const z = Math.floor(path[i] / sizeX)
    for (const [dx, dz] of shuffle([...DIRS], rng)) {
      const nx = x + dx
      const nz = z + dz
      if (nx < 0 || nx >= sizeX || nz < 0 || nz >= sizeZ) continue
      const n = nz * sizeX + nx
      if (occupied(n) || t.levels[n] !== 0 || t.water.has(n) || t.blocked.has(n) || t.climbs[n] > 0 ||
        t.usedAnchors.has(n) || t.roadNodes.has(n) || isEdge(n, sizeX, sizeZ) || (cliffDist && cliffDist[n] < clearance)) continue
      // Touches the river only through its parent tile.
      const touching = DIRS.filter(([ex, ez]) => {
        const mx = nx + ex
        const mz = nz + ez
        return mx >= 0 && mx < sizeX && mz >= 0 && mz < sizeZ && occupied(mz * sizeX + mx)
      }).length
      if (touching !== 1) continue
      extra.push(n)
      break
    }
  }
  return extra
}

export const MIN_SOURCE_HILL_TILES = 60
export const MIN_HILL_RIVER_LENGTH = 15
/** Tiles on level ground after the waterfall, at least. */
export const MIN_RIVER_LOWLAND_TILES = 10
export const MIN_LOWLAND_RIVER_DISTANCE = 30
const MAX_SOURCE_TRIES = 5

/** Up to `count` rivers, each from a mountain on a hill down to water or
 *  the map edge, else a lowland river. Every river uses its own hill and
 *  never touches another river. `preferNode` ranks hills (e.g. neutral-zone
 *  tiles) — hills where most tiles pass it are tried first. `onRoute` must
 *  add each route's tiles to `t.riverNodes` (it's called before the next
 *  river is routed). */
export function carveRivers(
  t: RiverTerrain, count: number, rng: () => number, meander: number,
  onRoute: (route: RiverRoute) => void, preferNode: (n: number) => boolean = () => true,
  cliffClearance = DEFAULT_RIVER_CLIFF_CLEARANCE, mouthWidening = DEFAULT_RIVER_MOUTH_WIDENING,
): void {
  const usedHills = new Set<number>()
  for (let i = 0; i < count; i++) {
    // Hill river with the full clearance from cliffs, else a smaller one,
    // else a lowland river; no river beats one along a wall of waterfalls.
    // A river should end in a real lake, the sea or the map edge, not a
    // puddle, so a big-water mouth is tried before any water at all.
    let route: RiverRoute | null = null
    for (let c = cliffClearance; c >= Math.min(1, cliffClearance) && !route; c--) {
      route = carveRiver(t, rng, meander, usedHills, preferNode, c, 'hill', true)
        ?? carveRiver(t, rng, meander, usedHills, preferNode, c, 'hill', false)
    }
    route ??= carveRiver(t, rng, meander, usedHills, preferNode, cliffClearance, 'lowland', true)
      ?? carveRiver(t, rng, meander, usedHills, preferNode, cliffClearance, 'lowland', false)
    if (!route) break
    const widening = widenMouth({ ...t, cliffClearance }, route, mouthWidening, rng)
    onRoute(widening.length > 0 ? { ...route, widening } : route)
  }
}

function carveRiver(
  base: RiverTerrain, rng: () => number, meander: number, usedHills: Set<number>, preferNode: (n: number) => boolean,
  cliffClearance: number, mode: 'hill' | 'lowland', bigMouth: boolean,
): RiverRoute | null {
  const t: RiverTerrain = { ...base, cliffClearance }
  const { sizeX, sizeZ } = t
  // A new river never starts on or next to an existing one.
  const touchesRiver = (n: number): boolean => t.riverNodes.has(n) || DIRS.some(([dx, dz]) => {
    const x = (n % sizeX) + dx
    const z = Math.floor(n / sizeX) + dz
    return x >= 0 && x < sizeX && z >= 0 && z < sizeZ && t.riverNodes.has(z * sizeX + x)
  })
  // Longer rivers on bigger maps: a third of the map's side (at least 15),
  // a fifth of it on level ground after the waterfall (at least 10).
  const side = Math.min(sizeX, sizeZ)
  const minLength = Math.max(MIN_HILL_RIVER_LENGTH, Math.round(side / 3))
  const minLowLength = Math.max(MIN_RIVER_LOWLAND_TILES, Math.round(side / 5))
  const mouthWater = (n: number): boolean => bigMouth ? touchesBigWater(n, t, MIN_MOUTH_WATER_TILES) : touchesWater(n, t)
  const goal = (n: number): boolean => t.levels[n] === 0 && (isEdge(n, sizeX, sizeZ) || mouthWater(n))

  const hills = mode === 'lowland' ? [] : shuffle(hillComponents(t).filter((c) => c.length >= MIN_SOURCE_HILL_TILES && !usedHills.has(c[0])), rng)
    .map((c) => ({ c, preferred: c.filter(preferNode).length * 2 >= c.length }))
    .sort((a, b) => Number(b.preferred) - Number(a.preferred))
  let tries = 0
  for (const { c } of hills) {
    const hill = new Set(c)
    // A source at least 2 tiles inside the hill, on free ground.
    const interior = c.filter((n) => {
      if (t.blocked.has(n) || t.usedAnchors.has(n) || t.climbs[n] > 0 || touchesRiver(n)) return false
      const x = n % sizeX
      const z = Math.floor(n / sizeX)
      for (let dz = -2; dz <= 2; dz++) {
        for (let dx = -2; dx <= 2; dx++) {
          const nx = x + dx
          const nz = z + dz
          if (nx < 0 || nx >= sizeX || nz < 0 || nz >= sizeZ || !hill.has(nz * sizeX + nx)) return false
        }
      }
      return true
    })
    if (interior.length === 0) continue
    const start = interior[Math.floor(rng() * interior.length)]
    const route = routeRiver(t, start, hill, goal, minLength, rng, minLowLength, meander)
    if (route && route.waterfallIndex !== null) { usedHills.add(c[0]); return meanderRoute(t, route, meander, rng) }
    if (++tries >= MAX_SOURCE_TRIES) break
  }

  if (mode === 'hill') return null

  // Lowland river: lake shore or map edge → another lake or edge, far away.
  const sources = shuffle(t.levels.map((_, n) => n).filter((n) =>
    t.levels[n] === 0 && !t.blocked.has(n) && !t.usedAnchors.has(n) && t.climbs[n] === 0 && !touchesRiver(n) &&
    (touchesWater(n, t) || isEdge(n, sizeX, sizeZ))), rng)
  for (const start of sources.slice(0, MAX_SOURCE_TRIES)) {
    const sx = start % sizeX
    const sz = Math.floor(start / sizeX)
    const sides = (n: number): number => {
      const x = n % sizeX
      const z = Math.floor(n / sizeX)
      return (x === 0 ? 1 : 0) | (x === sizeX - 1 ? 2 : 0) | (z === 0 ? 4 : 0) | (z === sizeZ - 1 ? 8 : 0)
    }
    const startSides = sides(start)
    const farGoal = (n: number): boolean => {
      if (Math.hypot((n % sizeX) - sx, Math.floor(n / sizeX) - sz) < MIN_LOWLAND_RIVER_DISTANCE) return false
      return mouthWater(n) || (sides(n) !== 0 && (sides(n) & startSides) === 0)
    }
    const route = routeRiver(t, start, null, farGoal, minLength, rng, 0, meander)
    if (route) return meanderRoute(t, route, meander, rng)
  }
  return null
}
