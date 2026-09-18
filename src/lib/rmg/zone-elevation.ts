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
 *  a two-zone grid with hills on both sides produced exactly this). */
function collectBoundaryCandidates(blob: Set<number>, elevatedNodes: Set<number>, sizeX: number, sizeZ: number): number[] {
  const rampNodes = new Set<number>()
  for (const node of blob) {
    const x = node % sizeX
    const z = Math.floor(node / sizeX)
    for (const [dx, dz] of NEIGHBOR_OFFSETS) {
      const nx = x + dx
      const nz = z + dz
      if (nx < 0 || nx >= sizeX || nz < 0 || nz >= sizeZ) continue
      const n = nz * sizeX + nx
      if (!elevatedNodes.has(n)) rampNodes.add(n)
    }
  }
  return [...rampNodes]
}

/** Picks a handful of ramp nodes for one blob: always at least one (closest
 *  to the zone anchor), plus a bonus ramp per ~8 boundary tiles (capped at 5
 *  total) spaced at least 3 tiles apart from every ramp already chosen, so a
 *  large plateau/valley gets a few spread-out access points instead of one
 *  narrow chokepoint. Prefers a candidate not already in `avoid` (an
 *  already-placed object's own tile) but falls back to any candidate if
 *  every one is — a ramp marker doesn't itself block anything, so sharing a
 *  tile with an object's footprint is harmless, just not the first choice. */
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

/** The first 4-neighbor of `node` at level 0 — the only legal ramp spot for
 *  repairing a HILL wall tile specifically (a ramp is never placed on the
 *  elevated tile itself — see this file's own header comment on ramp
 *  placement direction). Used both by this file's own inline ramp
 *  placement and by generate-random-map.ts / zone-validation.ts's later
 *  repair passes (road-partition repair, sealed-zone repair) when they
 *  need to punch a NEW ramp through a specific wall tile a route or
 *  reachability check actually needed. Returns null in the (unexpected)
 *  case none exists — `isElevationWallTile` guarantees at least one
 *  differing neighbor, and this generator never lets a blob touch anything
 *  but level-0 ground (the 1-tile buffer above), so this should always
 *  find one in practice. */
export function findAdjacentLevelZeroNode(node: number, sizeX: number, sizeZ: number, levelsMap: number[]): number | null {
  const x = node % sizeX
  const z = Math.floor(node / sizeX)
  for (const [dx, dz] of NEIGHBOR_OFFSETS) {
    const nx = x + dx
    const nz = z + dz
    if (nx < 0 || nx >= sizeX || nz < 0 || nz >= sizeZ) continue
    const n = nz * sizeX + nx
    if ((levelsMap[n] ?? 0) === 0) return n
  }
  return null
}

/** Adds hill (`kind: 'hill'`) or valley (`kind: 'valley'`) blobs to a subset
 *  of zones (both player and neutral — see this file's own header comment),
 *  each with real, legal ramp access. Call once per kind to get both. */
export function scatterZoneElevation(options: ScatterZoneElevationOptions): ZoneElevationResult {
  const {
    sizeX, sizeZ, zones, tilesByZone, zoneAnchorNode, excludedNodes, blocked, usedAnchors, rng, kind,
    chance = 0, minSize = 8, minSizeFraction = 0.08, maxSizeFraction = 0.5, maxSize = 250,
    chanceByZone, minSizeByZone, reservedNodes = new Set(),
  } = options
  const level = kind === 'hill' ? 1 : -1
  const elevatedNodes = new Set<number>()
  const climbNodes = new Set<number>()
  const levelChanges: { node: number; level: number }[] = []
  const climbChanges: { node: number; climb: 1 }[] = []
  const protectedTiles = new Set<number>([...excludedNodes, ...blocked, ...usedAnchors])

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
    const zoneMinSize = minSizeByZone?.get(zone.id) ?? minSize
    const presenceChance = Math.min(1, zoneChance * 2)
    if (rng() >= presenceChance) continue

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

    const sizeFraction = minSizeFraction + (maxSizeFraction - minSizeFraction) * zoneChance
    const targetSize = Math.max(zoneMinSize, Math.min(eligible.size, maxSize, Math.round(eligible.size * sizeFraction)))
    const seed = [...eligible][Math.floor(rng() * eligible.size)]
    const blob = growBlob(seed, sizeX, sizeZ, targetSize, eligible, rng, protectedTiles, elevatedNodes)
    if (blob.size === 0) continue

    for (const node of blob) {
      elevatedNodes.add(node)
      levelChanges.push({ node, level })
    }

    const boundaryOutsideNodes = collectBoundaryCandidates(blob, elevatedNodes, sizeX, sizeZ)
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
          if (blob.has(n)) return n
        }
        return outside // unreachable in practice — outside came from collectBoundaryCandidates, which guarantees a blob neighbor
      })
    const anchor = zoneAnchorNode.get(zone.id)
    const chosenRampNodes = selectRampNodes([...new Set(rampCandidateNodes)], sizeX, anchor, blocked)
    for (const rampNode of chosenRampNodes) {
      if (climbNodes.has(rampNode)) continue
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

  return { levelChanges, climbChanges, elevatedNodes, climbNodes }
}
