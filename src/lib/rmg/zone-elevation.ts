// ─── RMG elevation features (hills + dry valleys) ───────────────────────────
// Companion to zone-water.ts's lake generation, reusing its own growBlob()
// unchanged. Two real gaps this closes (neither was a deliberate design
// choice — confirmed via investigation, just unimplemented): `levelsMap`
// value `1` (higher elevation) was never produced anywhere in this
// generator, and `levelsMap` value `-1` was only ever produced paired with
// water (scatterZoneWater sets both together, unconditionally) — real
// shipped maps have plenty of dry, non-water level `-1` ground (the user's
// own confirmed game knowledge), so this generator shouldn't force the
// pairing either.
//
// Unlike water (player zones explicitly excluded — "a lake right at spawn
// would be an odd first impression"), hills/valleys are eligible on BOTH
// player and neutral zones (user decision) — the zone's own spawner anchor
// node is still protected via the same `excludedNodes` set water already
// gets, so a player's own start tile is never itself elevated or isolated.
//
// Ramp placement (`climbsMap`) happens INLINE here, not as a later pass: see
// passability.ts's `isElevationWallTile` — only a blob's own BOUNDARY tiles
// (bordering a different, lower/higher level) need a climb-tagged neighbor
// to stay walkable; the interior is unconditionally safe once you're on it.
// So this deliberately does NOT try to flood-fill-verify every boundary
// tile individually becomes walkable — a plateau/valley mostly ringed by
// impassable cliff edges except at a handful of ramp points is the correct,
// intended shape (exactly how a real cliff/hill reads in this game), not a
// defect to eliminate. What DOES matter, and what this guarantees, is that
// every blob gets at least one real, legal access ramp (more for a larger
// one, spaced apart) so the elevated area itself is genuinely reachable.
// The much rarer failure mode — a blob shaped so it happens to sever a
// zone's own land into two disconnected halves — is caught by the existing
// generate-random-map.ts / zone-validation.ts final reachability sweep
// (repairSealedZones), which now also knows how to punch a ramp through a
// wall tile as a repair, not just remove a decorative obstacle.

import { growBlob } from './zone-water'
import type { RmgZoneLayoutPick } from './rmg-schema'

const NEIGHBOR_OFFSETS: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]]

export interface ScatterZoneElevationOptions {
  sizeX: number
  sizeZ: number
  zones: { id: number; kind: 'player' | 'neutral' }[]
  tilesByZone: Map<number, number[]>
  /** zone id -> its anchor node (player spawn / neutral zone center) — ramp
   *  placement is biased toward whichever boundary candidate sits closest to
   *  this, since that's roughly where a road is likely to pass. */
  zoneAnchorNode: Map<number, number>
  /** Never elevated — same set `scatterZoneWater` already gets (every
   *  zone's own anchor, so an anchor tile is never itself raised/lowered). */
  excludedNodes: Set<number>
  /** Already-claimed solid footprint cells and anchors — never elevate a
   *  mine/dwelling/guard's own tile (same protection water's blobs get). */
  blocked: Set<number>
  usedAnchors: Set<number>
  rng: () => number
  /** `1` = hill, `-1` = valley. Call this function twice (once per kind) to
   *  get both in one generation — they share this same option shape. */
  kind: 'hill' | 'valley'
  /** Overall elevation amount, 0-1, same shape/semantics as
   *  scatterZoneWater's own `chance` (drives presence AND size). Defaults
   *  to 0 — opt-in, so existing generations are unaffected until a caller
   *  actually turns this on. */
  chance?: number
  minSize?: number
  minSizeFraction?: number
  maxSizeFraction?: number
  maxSize?: number
  chanceByZone?: Map<number, number>
  minSizeByZone?: Map<number, number>
  /** Real bimodal elevated-fraction choice (`zone_layouts/
   *  default_zone_layouts.json`'s `elevationModes[]`, `GameCatalog
   *  .rmgZoneLayout` — issue #240 Phase 3): a weighted pick of ONE band
   *  (typically "mostly flat, 0-40%" vs "mostly elevated, 60-80%"), then a
   *  uniform pick within that band, REPLACING this function's own
   *  `minSizeFraction`/`maxSizeFraction` continuous interpolation below
   *  (confirmed by this session's own research: the real data is a real,
   *  deliberate bimodal choice, not a continuous range — a zone is either
   *  mostly flat or mostly elevated, never reliably in between). Omitted
   *  (the default) keeps today's exact continuous-interpolation behavior —
   *  e.g. the static fallback catalog, or an older Core.zip with no
   *  `Core/generator/` files. */
  elevationModes?: { weight: number; minElevatedFraction: number; maxElevatedFraction: number }[]
  /** The game's own per-zone layout choice (map_schemas/Default.mrmg.json,
   *  `RmgSchema.zoneLayouts`): each zone picks a layout by weight, then one of
   *  its `elevationModes`, then a fraction in that band — exactly how the
   *  in-game RMG decides. A fraction of 0 (flat) or near 1 (the whole zone
   *  raised, which reads as flat ground one level up) leaves the zone flat.
   *  When set, this decides presence AND size and replaces `elevationModes`
   *  and the `chance`-based presence roll (`chance` > 0 just enables it). */
  zoneLayouts?: RmgZoneLayoutPick[]
  /** Nodes already claimed by water or the OPPOSITE elevation kind this same
   *  run (pass hills' own `elevatedNodes` in when generating valleys, and
   *  vice versa, plus water's `waterNodes`) — kept ineligible, along with a
   *  1-tile buffer around them, so a hill and a valley/lake never end up
   *  directly adjacent with no level-0 tile between them. Real ramps only
   *  ever bridge a single tier (climbsMap doc comment: a ramp tile's own
   *  level is always -1 or 0, never 1) — a direct -1↔1 step has no real-data
   *  precedent and no correct single-tile ramp shape, so this generator
   *  simply never produces one. */
  reservedNodes?: Set<number>
}

export interface ZoneElevationResult {
  /** Feed straight to `paintLevelTiles`. */
  levelChanges: { node: number; level: number }[]
  /** Feed straight to `paintClimbTiles`. */
  climbChanges: { node: number; climb: 1 }[]
  elevatedNodes: Set<number>
  climbNodes: Set<number>
}

/** Every level-0 tile bordering the blob, deduplicated by rampNode (a
 *  level-0 tile touching the blob on two sides only needs to be considered
 *  once). Filters against `elevatedNodes` (every tile this SAME
 *  scatterZoneElevation call has elevated so far — a superset of `blob`
 *  that also covers every earlier zone's own same-kind blob this run),
 *  not just `blob` itself — a neighbor could belong to an ADJACENT zone's
 *  own hill/valley blob rather than genuine level-0 ground, and treating
 *  that as a valid "outside" ramp spot would place climb=1 on an already-
 *  elevated tile (real bug caught by this file's own verification script:
 *  a two-zone grid with hills on both sides produced exactly this).
 *
 *  ALSO hard-excludes `blocked` — a real bug found on an actual generated
 *  map, not just synthetic tests: a candidate here is only ever screened
 *  against elevation, never against what's already standing on the tile,
 *  so an already-placed object's own footprint (including a player's own
 *  city-spawner/hero-spawner anchor) could become a "boundary" candidate
 *  and get a climb=1 marker stamped directly onto it — confirmed on a real
 *  generation (`maps/map_elevation.map`, player 4's own city-spawner
 *  anchor tile), and the map failed to load in the actual game because of
 *  it. A ramp marker on a tile something is already standing on is
 *  physically nonsensical (no real sample map has ever shown this) and
 *  must never be produced, not just deprioritized. */
function collectBoundaryCandidates(blob: Set<number>, elevatedNodes: Set<number>, blocked: Set<number>, sizeX: number, sizeZ: number): number[] {
  const rampNodes = new Set<number>()
  for (const node of blob) {
    const x = node % sizeX
    const z = Math.floor(node / sizeX)
    for (const [dx, dz] of NEIGHBOR_OFFSETS) {
      const nx = x + dx
      const nz = z + dz
      if (nx < 0 || nx >= sizeX || nz < 0 || nz >= sizeZ) continue
      const n = nz * sizeX + nx
      if (!elevatedNodes.has(n) && !blocked.has(n)) rampNodes.add(n)
    }
  }
  return [...rampNodes]
}

/** Picks a handful of ramp nodes for one blob: always at least one (closest
 *  to the zone anchor), plus a bonus ramp per ~8 boundary tiles (capped at 5
 *  total) spaced at least 3 tiles apart from every ramp already chosen, so a
 *  large plateau/valley gets a few spread-out access points instead of one
 *  narrow chokepoint. `candidates` is already hard-filtered against
 *  `blocked`/elevated tiles by the caller (`collectBoundaryCandidates`) —
 *  `avoid` here is a defensive extra tie-break only, never the sole thing
 *  standing between a ramp and an occupied tile. */
function selectRampNodes(
  candidates: number[], sizeX: number, anchorNode: number | undefined, avoid: Set<number>,
): number[] {
  if (candidates.length === 0) return []
  const anchorX = anchorNode !== undefined ? anchorNode % sizeX : 0
  const anchorZ = anchorNode !== undefined ? Math.floor(anchorNode / sizeX) : 0
  const distTo = (node: number, x: number, z: number): number => {
    const nx = node % sizeX
    const nz = Math.floor(node / sizeX)
    return (nx - x) ** 2 + (nz - z) ** 2
  }
  const ranked = [...candidates].sort((a, b) => {
    const aAvoid = avoid.has(a) ? 1 : 0
    const bAvoid = avoid.has(b) ? 1 : 0
    if (aAvoid !== bAvoid) return aAvoid - bAvoid
    return distTo(a, anchorX, anchorZ) - distTo(b, anchorX, anchorZ)
  })
  const bonusCap = Math.min(4, Math.floor(candidates.length / 8))
  const targetCount = 1 + bonusCap
  const selected: number[] = [ranked[0]]
  for (const candidate of ranked.slice(1)) {
    if (selected.length >= targetCount) break
    if (selected.every((s) => distTo(candidate, s % sizeX, Math.floor(s / sizeX)) >= 9)) selected.push(candidate)
  }
  return selected
}

/** The first 4-neighbor of `node` at level 0 (and, if `blocked` is given,
 *  not already occupied by something — same "never stamp a ramp on a tile
 *  something is standing on" rule `collectBoundaryCandidates` enforces
 *  above, real bug confirmed on `maps/map_elevation.map`) — the only legal
 *  ramp spot for repairing a HILL wall tile specifically (a ramp is never
 *  placed on the elevated tile itself — see this file's own header comment
 *  on ramp placement direction). Used both by this file's own inline ramp
 *  placement and by generate-random-map.ts / zone-validation.ts's later
 *  repair passes (road-partition repair, sealed-zone repair) when they
 *  need to punch a NEW ramp through a specific wall tile a route or
 *  reachability check actually needed. Returns null when no unblocked
 *  level-0 neighbor exists — a real, disclosed "can't safely repair this
 *  one" rather than falling back to an occupied tile. */
export function findAdjacentLevelZeroNode(node: number, sizeX: number, sizeZ: number, levelsMap: number[], blocked: Set<number> = new Set()): number | null {
  const x = node % sizeX
  const z = Math.floor(node / sizeX)
  for (const [dx, dz] of NEIGHBOR_OFFSETS) {
    const nx = x + dx
    const nz = z + dz
    if (nx < 0 || nx >= sizeX || nz < 0 || nz >= sizeZ) continue
    const n = nz * sizeX + nx
    if ((levelsMap[n] ?? 0) === 0 && !blocked.has(n)) return n
  }
  return null
}

/** Minimum width of every part of a hill/valley along both x and z. Narrower
 *  strips/necks left objects and ramps on them unreachable (a real user
 *  report), so every elevated tile must lie inside a fully elevated
 *  MIN_ELEVATION_SPAN × MIN_ELEVATION_SPAN square. */
export const MIN_ELEVATION_SPAN = 6

/** A hill/valley smaller than this (in tiles) after pocket repair is dropped
 *  instead of kept — one minimum-width square. */
const MIN_ELEVATION_COMPONENT_SIZE = MIN_ELEVATION_SPAN * MIN_ELEVATION_SPAN

/** Above this elevated fraction a zone counts as "all raised" — flat ground
 *  one level up, which the game's plane layout means as flat. */
const FULL_ZONE_FRACTION = 0.95

/** Morphological opening of `blob` with a `span`×`span` square: keeps exactly
 *  the tiles covered by at least one such square lying fully inside `blob`,
 *  dropping every strip, neck and corner spur narrower than `span` in x or z. */
export function openWithSquare(blob: Set<number>, span: number, sizeX: number, sizeZ: number): Set<number> {
  if (blob.size === 0) return new Set()
  let minX = sizeX, minZ = sizeZ, maxX = -1, maxZ = -1
  for (const n of blob) {
    const x = n % sizeX
    const z = (n - x) / sizeX
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (z < minZ) minZ = z
    if (z > maxZ) maxZ = z
  }
  const w = maxX - minX + 1
  const h = maxZ - minZ + 1
  if (w < span || h < span) return new Set()
  // prefix[(z+1)*(w+1) + (x+1)] = number of blob tiles in [0..x]×[0..z] of the box
  const prefix = new Int32Array((w + 1) * (h + 1))
  for (let z = 0; z < h; z++) {
    for (let x = 0; x < w; x++) {
      const inBlob = blob.has((minZ + z) * sizeX + (minX + x)) ? 1 : 0
      prefix[(z + 1) * (w + 1) + (x + 1)] = inBlob + prefix[z * (w + 1) + (x + 1)] + prefix[(z + 1) * (w + 1) + x] - prefix[z * (w + 1) + x]
    }
  }
  const full = span * span
  const kept = new Set<number>()
  for (let z = 0; z + span <= h; z++) {
    for (let x = 0; x + span <= w; x++) {
      const count = prefix[(z + span) * (w + 1) + (x + span)] - prefix[z * (w + 1) + (x + span)] - prefix[(z + span) * (w + 1) + x] + prefix[z * (w + 1) + x]
      if (count !== full) continue
      for (let dz = 0; dz < span; dz++) {
        for (let dx = 0; dx < span; dx++) kept.add((minZ + z + dz) * sizeX + (minX + x + dx))
      }
    }
  }
  return kept
}

/** Largest enclosed level-0 pocket that is simply filled in with elevation
 *  (when every tile in it is a legal elevation tile) — anything bigger is
 *  opened to the outside instead, so a hill never swallows a big stretch of
 *  a zone's own ground just because it happened to be cut off. */
const MAX_FILLED_POCKET_SIZE = 120

/** A level-0 area this small that's walled in by elevation/water counts as a
 *  pocket even if a zone anchor sits in it (a player start ringed by a hill is
 *  as stranded as an empty speck). */
const SMALL_ENCLOSED_SIZE = 60

/** Every 4-connected group of non-`solid` tiles on the whole map that holds
 *  none of the zone anchors (`anchors`), or is tiny — i.e. level-0 "pockets" cut off from
 *  every zone's own ground by hills/valleys/water (a real user report:
 *  stranded objects in exactly these spots, where every neighbor is an
 *  elevation wall and no ramp can serve them). Whole-map (not just this
 *  blob's own bounding box) so a pocket enclosed jointly by two different
 *  blobs, or by a blob and water, is found too. `solid` is a per-tile mask. */
function findEnclosedPockets(solid: Uint8Array, blobMask: Uint8Array, anchors: Set<number>, sizeX: number, sizeZ: number): number[][] {
  const tileCount = sizeX * sizeZ
  const seen = new Uint8Array(tileCount)
  const stack = new Int32Array(tileCount)
  const pockets: number[][] = []
  for (let start = 0; start < tileCount; start++) {
    if (seen[start] || solid[start]) continue
    const comp: number[] = []
    let top = 0
    stack[top++] = start
    seen[start] = 1
    let hasAnchor = false
    let touchesBlob = false
    while (top > 0) {
      const node = stack[--top]
      comp.push(node)
      if (!hasAnchor && anchors.has(node)) hasAnchor = true
      const x = node % sizeX
      const z = (node - x) / sizeX
      if (!touchesBlob && ((x > 0 && blobMask[node - 1]) || (x < sizeX - 1 && blobMask[node + 1]) || (z > 0 && blobMask[node - sizeX]) || (z < sizeZ - 1 && blobMask[node + sizeX]))) touchesBlob = true
      if (x > 0 && !seen[node - 1] && !solid[node - 1]) { seen[node - 1] = 1; stack[top++] = node - 1 }
      if (x < sizeX - 1 && !seen[node + 1] && !solid[node + 1]) { seen[node + 1] = 1; stack[top++] = node + 1 }
      if (z > 0 && !seen[node - sizeX] && !solid[node - sizeX]) { seen[node - sizeX] = 1; stack[top++] = node - sizeX }
      if (z < sizeZ - 1 && !seen[node + sizeX] && !solid[node + sizeX]) { seen[node + sizeX] = 1; stack[top++] = node + sizeX }
    }
    // Only a pocket THIS blob borders is this blob's doing — a land patch
    // water alone cut off is not (and dropping the hill over it would just
    // lose elevation for nothing).
    if (touchesBlob && (!hasAnchor || comp.length <= SMALL_ENCLOSED_SIZE)) pockets.push(comp)
  }
  return pockets
}

/** Opens `pocket` to the outside by removing the fewest `blob` tiles on a
 *  shortest 4-connected path through `blob` from the pocket to any tile that
 *  isn't solid and isn't part of any pocket. Used when a pocket can't just be
 *  filled in (an already-placed object stands in it, it's too big, or it
 *  borders water / the opposite elevation kind) — the pocket's contents end
 *  up on ordinary, reachable level-0 ground instead of inside a sealed cell.
 *  Returns false when no such path exists through `blob` itself. */
function openPocketToOutside(
  pocket: number[], blob: Set<number>, solid: Uint8Array, allPocketNodes: Set<number>, sizeX: number, sizeZ: number,
): boolean {
  const prev = new Map<number, number | null>()
  let queue: number[] = []
  for (const p of pocket) {
    const x = p % sizeX
    const z = Math.floor(p / sizeX)
    for (const [dx, dz] of NEIGHBOR_OFFSETS) {
      const nx = x + dx
      const nz = z + dz
      if (nx < 0 || nx >= sizeX || nz < 0 || nz >= sizeZ) continue
      const n = nz * sizeX + nx
      if (blob.has(n) && !prev.has(n)) { prev.set(n, null); queue.push(n) }
    }
  }
  while (queue.length > 0) {
    const next: number[] = []
    for (const node of queue) {
      const x = node % sizeX
      const z = Math.floor(node / sizeX)
      for (const [dx, dz] of NEIGHBOR_OFFSETS) {
        const nx = x + dx
        const nz = z + dz
        if (nx < 0 || nx >= sizeX || nz < 0 || nz >= sizeZ) continue
        const n = nz * sizeX + nx
        if (!solid[n] && !allPocketNodes.has(n)) {
          for (let cur: number | null = node; cur !== null; cur = prev.get(cur) ?? null) blob.delete(cur)
          return true
        }
        if (blob.has(n) && !prev.has(n)) { prev.set(n, node); next.push(n) }
      }
    }
    queue = next
  }
  return false
}

/** Makes `blob` a solid area: every enclosed level-0 pocket is either filled
 *  in (when small and all its tiles are legal elevation tiles) or opened to
 *  the outside (when something already placed stands in it, it's big, or it
 *  borders water / the opposite elevation kind — `otherObstacles`, which
 *  count as walls for the enclosure test but are never filled, since a hill
 *  and a valley must never touch directly). Loops because opening one pocket
 *  can reshape another; bounded so it can never spin. Returns false when a
 *  pocket is left that nothing can open — the caller drops the whole blob
 *  then, rather than ship a hill with a sealed hole in it. */
function removeEnclosedPockets(
  blob: Set<number>, elevatedNodes: Set<number>, otherObstacles: Set<number>, canFill: (node: number) => boolean, anchors: Set<number>,
  sizeX: number, sizeZ: number,
): boolean {
  const tileCount = sizeX * sizeZ
  for (let round = 0; round < 8; round++) {
    const solid = new Uint8Array(tileCount)
    const blobMask = new Uint8Array(tileCount)
    for (const n of elevatedNodes) solid[n] = 1
    for (const n of otherObstacles) solid[n] = 1
    for (const n of blob) { solid[n] = 1; blobMask[n] = 1 }
    const pockets = findEnclosedPockets(solid, blobMask, anchors, sizeX, sizeZ)
    if (pockets.length === 0) return true
    const allPocketNodes = new Set<number>(pockets.flat())
    let changed = false
    for (const pocket of pockets) {
      if (pocket.length <= MAX_FILLED_POCKET_SIZE && pocket.every(canFill)) {
        for (const n of pocket) { blob.add(n); solid[n] = 1; blobMask[n] = 1 }
        changed = true
      } else if (openPocketToOutside(pocket, blob, solid, allPocketNodes, sizeX, sizeZ)) {
        changed = true
      }
    }
    if (!changed) return false // a pocket nothing here can open (e.g. walled in by water on every other side)
  }
  return false
}

/** 4-connected components of `nodes`. */
function connectedComponents(nodes: Set<number>, sizeX: number, sizeZ: number): number[][] {
  const seen = new Set<number>()
  const comps: number[][] = []
  for (const start of nodes) {
    if (seen.has(start)) continue
    const comp: number[] = []
    const queue = [start]
    seen.add(start)
    while (queue.length > 0) {
      const node = queue.pop() as number
      comp.push(node)
      const x = node % sizeX
      const z = Math.floor(node / sizeX)
      for (const [dx, dz] of NEIGHBOR_OFFSETS) {
        const nx = x + dx
        const nz = z + dz
        if (nx < 0 || nx >= sizeX || nz < 0 || nz >= sizeZ) continue
        const n = nz * sizeX + nx
        if (!nodes.has(n) || seen.has(n)) continue
        seen.add(n)
        queue.push(n)
      }
    }
    comps.push(comp)
  }
  return comps
}

/** Adds hill (`kind: 'hill'`) or valley (`kind: 'valley'`) blobs to a subset
 *  of zones (both player and neutral — see this file's own header comment),
 *  each with real, legal ramp access. Call once per kind to get both. */
export function scatterZoneElevation(options: ScatterZoneElevationOptions): ZoneElevationResult {
  const {
    sizeX, sizeZ, zones, tilesByZone, zoneAnchorNode, excludedNodes, blocked, usedAnchors, rng, kind,
    chance = 0, minSize = 8, minSizeFraction = 0.08, maxSizeFraction = 0.5, maxSize = 250,
    chanceByZone, minSizeByZone, reservedNodes = new Set(), elevationModes, zoneLayouts,
  } = options
  const pickWeighted = <T extends { weight: number }>(items: T[]): T | undefined => {
    const total = items.reduce((sum, m) => sum + m.weight, 0)
    if (total <= 0) return undefined
    let roll = rng() * total
    for (const m of items) {
      if (roll < m.weight) return m
      roll -= m.weight
    }
    return items[items.length - 1]
  }
  const pickInBand = (modes: { weight: number; minElevatedFraction: number; maxElevatedFraction: number }[] | undefined): number | undefined => {
    const band = modes && modes.length > 0 ? pickWeighted(modes) : undefined
    return band ? band.minElevatedFraction + rng() * (band.maxElevatedFraction - band.minElevatedFraction) : undefined
  }
  const pickSizeFraction = (zoneChance: number): number =>
    pickInBand(elevationModes) ?? minSizeFraction + (maxSizeFraction - minSizeFraction) * zoneChance
  /** Game layout pick: the zone's elevated fraction, or null when it stays flat. */
  const pickLayoutFraction = (layouts: RmgZoneLayoutPick[]): number | null => {
    const fraction = pickInBand(pickWeighted(layouts)?.elevationModes) ?? 0
    return fraction <= 0 || fraction >= FULL_ZONE_FRACTION ? null : fraction
  }
  const useLayouts = zoneLayouts !== undefined && zoneLayouts.length > 0
  let sharedPlayerLayoutFraction: number | null | undefined
  const level = kind === 'hill' ? 1 : -1
  const elevatedNodes = new Set<number>()
  const climbNodes = new Set<number>()
  const levelChanges: { node: number; level: number }[] = []
  const climbChanges: { node: number; climb: 1 }[] = []
  const protectedTiles = new Set<number>([...excludedNodes, ...blocked, ...usedAnchors])
  let sharedPlayerPresence: boolean | undefined
  let sharedPlayerSizeFraction: number | undefined

  const reservedBuffer = new Set<number>(reservedNodes)
  for (const n of reservedNodes) {
    const x = n % sizeX
    const z = Math.floor(n / sizeX)
    for (const [dx, dz] of NEIGHBOR_OFFSETS) {
      const nx = x + dx
      const nz = z + dz
      if (nx < 0 || nx >= sizeX || nz < 0 || nz >= sizeZ) continue
      reservedBuffer.add(nz * sizeX + nx)
    }
  }

  for (const zone of zones) {
    const zoneChance = chanceByZone?.get(zone.id) ?? chance
    if (zoneChance <= 0) continue
    const zoneMinSize = Math.max(MIN_ELEVATION_COMPONENT_SIZE, minSizeByZone?.get(zone.id) ?? minSize)
    // Every PLAYER zone shares one presence roll and one size fraction
    // (issue #254): independent rolls left one start walled in by cliffs while
    // another was open ground (elevated share differed by up to ~37 points).
    let layoutFraction: number | null = null
    if (useLayouts) {
      if (zone.kind === 'player') {
        if (sharedPlayerLayoutFraction === undefined) sharedPlayerLayoutFraction = pickLayoutFraction(zoneLayouts)
        layoutFraction = sharedPlayerLayoutFraction
      } else {
        layoutFraction = pickLayoutFraction(zoneLayouts)
      }
      if (layoutFraction === null) continue
    } else {
      const presenceChance = Math.min(1, zoneChance * 2)
      let present: boolean
      if (zone.kind === 'player') {
        sharedPlayerPresence ??= rng() < presenceChance
        present = sharedPlayerPresence
      } else {
        present = rng() < presenceChance
      }
      if (!present) continue
    }

    // `!climbNodes.has(n)` matters: an EARLIER zone in this same loop may
    // have already placed a ramp on a then-level-0 tile — without this, a
    // LATER zone's own blob could grow right over that exact tile,
    // elevating it out from under its own ramp (real bug caught by this
    // file's own verification script: raises the ramp tile itself to
    // level 1/-1, making it illegal — no real climb=1 tile is ever found
    // anywhere but the lower side of a boundary).
    const eligible = new Set(
      (tilesByZone.get(zone.id) ?? []).filter(
        (n) => !excludedNodes.has(n) && !blocked.has(n) && !usedAnchors.has(n) && !elevatedNodes.has(n) && !reservedBuffer.has(n) && !climbNodes.has(n),
      ),
    )
    if (eligible.size < zoneMinSize) continue

    let sizeFraction: number
    if (layoutFraction !== null) {
      sizeFraction = layoutFraction
    } else if (zone.kind === 'player') {
      sharedPlayerSizeFraction ??= pickSizeFraction(zoneChance)
      sizeFraction = sharedPlayerSizeFraction
    } else {
      sizeFraction = pickSizeFraction(zoneChance)
    }
    const targetSize = Math.max(zoneMinSize, Math.min(eligible.size, maxSize, Math.round(eligible.size * sizeFraction)))
    const seed = [...eligible][Math.floor(rng() * eligible.size)]
    const grown = growBlob(seed, sizeX, sizeZ, targetSize, eligible, rng, protectedTiles, elevatedNodes)
    if (grown.size === 0) continue
    // A pocket tile may belong to a neighboring zone (a hill and its
    // neighbor's hill can jointly enclose it) — fillable as long as nothing
    // forbids elevating it, zone ownership aside.
    const canFill = (n: number): boolean =>
      !excludedNodes.has(n) && !blocked.has(n) && !usedAnchors.has(n) && !elevatedNodes.has(n) && !reservedBuffer.has(n) && !climbNodes.has(n)
    // Pocket repair and the minimum-width opening can each undo the other
    // (filling a pocket can add a thin bit; opening a pocket cuts a 1-wide
    // channel), so alternate until a round of pocket repair changes nothing.
    let blob = grown
    let sealed = false
    for (let round = 0; round < 3; round++) {
      blob = openWithSquare(blob, MIN_ELEVATION_SPAN, sizeX, sizeZ)
      if (blob.size === 0) break
      const before = new Set(blob)
      if (!removeEnclosedPockets(blob, elevatedNodes, reservedNodes, canFill, excludedNodes, sizeX, sizeZ)) { sealed = true; break }
      if (blob.size === before.size && [...blob].every((n) => before.has(n))) break
      if (round === 2) blob = openWithSquare(blob, MIN_ELEVATION_SPAN, sizeX, sizeZ)
    }
    if (sealed || blob.size === 0) continue

    // Pocket removal can split a blob (opening a channel through it) — each
    // piece is its own hill/valley and needs its OWN ramp, and a piece too
    // small to matter, or one with nowhere legal to put a ramp, is dropped
    // rather than shipped as unreachable elevation (a real user report:
    // elevation areas with no ramp at all, which must never happen).
    for (const comp of connectedComponents(blob, sizeX, sizeZ)) {
      if (comp.length < MIN_ELEVATION_COMPONENT_SIZE) continue
      const compSet = new Set(comp)
      for (const node of comp) elevatedNodes.add(node)

      const boundaryOutsideNodes = collectBoundaryCandidates(compSet, elevatedNodes, blocked, sizeX, sizeZ)
      // Hill: the ramp sits on the LOWER (outside, level-0) tile, adjacent to
      // the strictly-higher blob tile. Valley: the blob tile itself IS the
      // lower side, adjacent to the strictly-higher outside tile — so the ramp
      // sits inside the blob instead. Either way this matches isValidRampNode
      // (MapGridDialog.tsx) / the ramp-direction.ts real-data model exactly.
      const rampCandidateNodes = kind === 'hill'
        ? boundaryOutsideNodes
        : boundaryOutsideNodes.map((outside) => {
          // any blob neighbor of this outside tile is a valid valley-side ramp spot
          const x = outside % sizeX
          const z = Math.floor(outside / sizeX)
          for (const [dx, dz] of NEIGHBOR_OFFSETS) {
            const nx = x + dx
            const nz = z + dz
            if (nx < 0 || nx >= sizeX || nz < 0 || nz >= sizeZ) continue
            const n = nz * sizeX + nx
            if (compSet.has(n)) return n
          }
          return outside // unreachable in practice — outside came from collectBoundaryCandidates, which guarantees a blob neighbor
        })
      const anchor = zoneAnchorNode.get(zone.id)
      const usableRampCandidates = [...new Set(rampCandidateNodes)].filter((n) => !climbNodes.has(n) && !blocked.has(n))
      const chosenRampNodes = selectRampNodes(usableRampCandidates, sizeX, anchor, blocked)
      if (chosenRampNodes.length === 0) {
        for (const node of comp) elevatedNodes.delete(node)
        continue
      }

      for (const node of comp) levelChanges.push({ node, level })
      for (const rampNode of chosenRampNodes) {
        climbNodes.add(rampNode)
        climbChanges.push({ node: rampNode, climb: 1 })
        // Also protected against a LATER zone's own blob fully encircling
        // it — same reasoning as every other protected tile (an object
        // anchor etc.): a ramp surrounded on every side would still be
        // walkable itself (level 0 is never a wall) but could get cut off
        // from the rest of the level-0 world, defeating its own purpose.
        protectedTiles.add(rampNode)
      }
    }
  }

  return { levelChanges, climbChanges, elevatedNodes, climbNodes }
}
