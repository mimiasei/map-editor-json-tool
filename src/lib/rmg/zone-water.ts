// ─── RMG water features (issue #210, Milestone 3) ───────────────────────────
// A modest "water zones" slice, deliberately scoped down from VCMI's own
// real water-zone/island concept: this paints real in-zone lakes (organic
// blob growth, contained within a single neutral zone, never a player
// zone), not separate water ZONES the zone graph would need boat-crossing
// connections to reach. No boat/naval-movement model exists anywhere in
// this codebase today, so a true isolated island (unreachable except by
// boat) isn't attempted here — every lake this generates sits inside a
// zone that's still fully reachable by land, same as every other zone.
//
// Confirmed against real shipped maps (maps/*.map, 11 files with water
// data): water tiles sit at `levelsMap === -1` essentially universally
// (2114/2123, 45000/45002, and 100% in every other sample) — not just a
// stricter-than-necessary UI convention (see paintWaterTiles's own doc
// comment), a real pattern this generator follows rather than leaving
// water at level 0.

const NEIGHBOR_OFFSETS: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]]

/** Real water texture variant ids (Core/DB/map/waters/waters.json) — one
 *  picked per lake, not per tile, matching how a single body of water
 *  reads as one consistent texture in every real sample checked. */
const WATER_IDS = [1, 2, 3, 4, 5, 6, 7]

/** Whether flooding `n` would leave a `protectedTiles` neighbor (an
 *  already-placed object's own tile) with zero remaining non-water land
 *  neighbors — i.e. fully water-locked on a 1-tile island. `protectedTiles`
 *  itself is never eligible for `blob` membership (callers already exclude
 *  it from `eligible`), so this only ever needs to check `n`'s neighbors,
 *  not `n` itself. `existingWater` is water already committed by a
 *  PREVIOUSLY processed zone in this same `scatterZoneWater` call — real
 *  bug confirmed: checking only the current zone's own in-progress `blob`
 *  missed the case where two ADJACENT zones' separate lakes each flood a
 *  different side of the same protected border tile, jointly isolating it
 *  even though neither zone's own blob ever completed the encirclement on
 *  its own. */
function wouldIsolateProtectedNeighbor(
  n: number, sizeX: number, sizeZ: number, blob: Set<number>, protectedTiles: Set<number>, existingWater: Set<number>,
): boolean {
  const x = n % sizeX
  const z = Math.floor(n / sizeX)
  for (const [dx, dz] of NEIGHBOR_OFFSETS) {
    const px = x + dx
    const pz = z + dz
    if (px < 0 || px >= sizeX || pz < 0 || pz >= sizeZ) continue
    const p = pz * sizeX + px
    if (!protectedTiles.has(p)) continue
    let hasOtherLandNeighbor = false
    for (const [pdx, pdz] of NEIGHBOR_OFFSETS) {
      const qx = px + pdx
      const qz = pz + pdz
      if (qx < 0 || qx >= sizeX || qz < 0 || qz >= sizeZ) continue
      const q = qz * sizeX + qx
      if (q === n) continue
      if (!blob.has(q) && !existingWater.has(q)) { hasOtherLandNeighbor = true; break }
    }
    if (!hasOtherLandNeighbor) return true
  }
  return false
}

/** Organic blob growth from `seed`, adding a random eligible neighbor of a
 *  random frontier tile each step (not a plain flood fill, which would
 *  produce a uniform diamond) until `targetSize` is reached or no eligible
 *  neighbor remains anywhere on the frontier. Exported for zone-islands.ts's
 *  own landmass-blob computation — same organic-growth need, different
 *  purpose (a landmass to KEEP, not a lake to flood).
 *
 *  `protectedTiles` (optional — zone-islands.ts's landmass growth doesn't
 *  pass it, since it's not flooding anything) skips any candidate that
 *  would fully surround one of those tiles with blob on every side —
 *  confirmed real bug: `scatterZoneWater`'s lake growth had no such check,
 *  so a `random-squad`/mine/etc. already placed on ordinary land (object
 *  placement runs BEFORE water carving in `generate-random-map.ts`) could
 *  end up alone on a 1-tile island, completely unreachable — the game's own
 *  accessibility repair pass can't bridge across water or nudge across a
 *  lake wider than its own search radius, so the object shipped exactly
 *  where it landed. */
export function growBlob(
  seed: number, sizeX: number, sizeZ: number, targetSize: number, eligible: Set<number>, rng: () => number,
  protectedTiles?: Set<number>, existingWater: Set<number> = new Set(),
): Set<number> {
  const blob = new Set<number>([seed])
  const frontier = [seed]
  while (blob.size < targetSize && frontier.length > 0) {
    const idx = Math.floor(rng() * frontier.length)
    const node = frontier[idx]
    const x = node % sizeX
    const z = Math.floor(node / sizeX)
    const offsets = [...NEIGHBOR_OFFSETS].sort(() => rng() - 0.5)
    let grew = false
    for (const [dx, dz] of offsets) {
      const nx = x + dx
      const nz = z + dz
      if (nx < 0 || nx >= sizeX || nz < 0 || nz >= sizeZ) continue
      const n = nz * sizeX + nx
      if (blob.has(n) || !eligible.has(n)) continue
      if (protectedTiles && wouldIsolateProtectedNeighbor(n, sizeX, sizeZ, blob, protectedTiles, existingWater)) continue
      blob.add(n)
      frontier.push(n)
      grew = true
      if (blob.size >= targetSize) break
    }
    if (!grew) frontier.splice(idx, 1)
  }
  return blob
}

export interface ScatterZoneWaterOptions {
  sizeX: number
  sizeZ: number
  zones: { id: number; kind: 'player' | 'neutral' }[]
  tilesByZone: Map<number, number[]>
  /** Tiles ineligible for water — every zone's own anchor (generate-
   *  random-map.ts calls this BEFORE roads/rivers are computed
   *  specifically so their own pathfinding already sees the water as
   *  blocked, so a lake must never flood the exact point a road/river is
   *  about to target). */
  excludedNodes: Set<number>
  /** Already-claimed solid footprint cells and anchors — never flood a
   *  mine/dwelling/guard's own tile. */
  blocked: Set<number>
  usedAnchors: Set<number>
  rng: () => number
  /** Overall water amount, 0-1. Drives BOTH how likely any given eligible
   *  neutral zone is to get a lake at all (saturating well before 1.0, so
   *  a high setting reliably waters every eligible zone) AND how large
   *  that lake is, as a fraction of the zone's own free-tile budget
   *  (`minSizeFraction` at 0, `maxSizeFraction` at 1) — a real "how much
   *  water" density control, not just a coin flip on presence (confirmed
   *  user-reported gap: 100% previously still capped every lake at a
   *  fixed `maxSize` tiles, regardless of the zone's own size, and read
   *  as "barely any water" on anything but a tiny zone). */
  chance?: number
  /** Absolute floor on lake size, in tiles — below this it's not worth
   *  bothering with a lake at all. */
  minSize?: number
  /** Fraction of a zone's own eligible free tiles a lake occupies at
   *  `chance = 0`. */
  minSizeFraction?: number
  /** Fraction of a zone's own eligible free tiles a lake occupies at
   *  `chance = 1`. */
  maxSizeFraction?: number
  /** Absolute ceiling on lake size, in tiles, regardless of zone size or
   *  `chance` — keeps a single lake from dominating a very large zone. */
  maxSize?: number
  /** Per-zone override of `chance` (issue #210, Stage 3a — a real game
   *  template's own `zoneLayouts[].lakesFill`, imported per-zone via
   *  rmg-template-import.ts). A zone with no entry here still uses the
   *  flat `chance` above — only templates carry per-zone values. */
  chanceByZone?: Map<number, number>
  /** Per-zone override of `minSize` (Stage 3a — a template's own
   *  `zoneLayouts[].minLakeArea`). */
  minSizeByZone?: Map<number, number>
}

export interface ZoneWaterResult {
  /** `{node, waterId}` pairs — feed straight to `paintWaterTiles`. */
  waterChanges: { node: number; waterId: number }[]
  /** Every watered node also needs `levelsMap` set to -1 (see this file's
   *  own header comment) — feed straight to `paintLevelTiles`. */
  levelChanges: { node: number; level: number }[]
  waterNodes: Set<number>
}

/** Adds at most one lake per eligible neutral zone. Player zones are never
 *  watered — a lake right at spawn would be an odd first impression, and
 *  every real sample map's own player-start surroundings are dry. */
export function scatterZoneWater(options: ScatterZoneWaterOptions): ZoneWaterResult {
  const {
    sizeX, sizeZ, zones, tilesByZone, excludedNodes, blocked, usedAnchors, rng,
    chance = 0.4, minSize = 8, minSizeFraction = 0.08, maxSizeFraction = 0.6, maxSize = 400,
    chanceByZone, minSizeByZone,
  } = options
  const waterNodes = new Set<number>()
  const waterChanges: { node: number; waterId: number }[] = []
  const levelChanges: { node: number; level: number }[] = []
  // Every tile that must stay reachable — object placement (populateZones,
  // scatterProximityGuards) runs BEFORE water carving, so this is the one
  // place that can (and, confirmed via a real user report, did) strand an
  // already-placed guard/mine/treasure alone on a 1-tile water-locked
  // island. See `growBlob`'s own doc comment for the full mechanism.
  const protectedTiles = new Set<number>([...excludedNodes, ...blocked, ...usedAnchors])

  for (const zone of zones) {
    if (zone.kind !== 'neutral') continue
    const zoneChance = chanceByZone?.get(zone.id) ?? chance
    const zoneMinSize = minSizeByZone?.get(zone.id) ?? minSize
    // Saturates well before chance=1 so a high setting reliably waters every
    // eligible zone, not just "somewhat more often than the default."
    const presenceChance = Math.min(1, zoneChance * 2)
    if (rng() >= presenceChance) continue

    const eligible = new Set(
      (tilesByZone.get(zone.id) ?? []).filter(
        (n) => !excludedNodes.has(n) && !blocked.has(n) && !usedAnchors.has(n) && !waterNodes.has(n),
      ),
    )
    if (eligible.size < zoneMinSize) continue // too little free room to bother

    const sizeFraction = minSizeFraction + (maxSizeFraction - minSizeFraction) * zoneChance
    const targetSize = Math.max(zoneMinSize, Math.min(eligible.size, maxSize, Math.round(eligible.size * sizeFraction)))
    const seed = [...eligible][Math.floor(rng() * eligible.size)]
    const blob = growBlob(seed, sizeX, sizeZ, targetSize, eligible, rng, protectedTiles, waterNodes)
    const waterId = WATER_IDS[Math.floor(rng() * WATER_IDS.length)]

    for (const node of blob) {
      waterNodes.add(node)
      waterChanges.push({ node, waterId })
      levelChanges.push({ node, level: -1 })
    }
  }

  return { waterChanges, levelChanges, waterNodes }
}
