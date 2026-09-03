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

/** Organic blob growth from `seed`, adding a random eligible neighbor of a
 *  random frontier tile each step (not a plain flood fill, which would
 *  produce a uniform diamond) until `targetSize` is reached or no eligible
 *  neighbor remains anywhere on the frontier. */
function growBlob(seed: number, sizeX: number, sizeZ: number, targetSize: number, eligible: Set<number>, rng: () => number): Set<number> {
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
  /** Anchors/road/river tiles ineligible for water — never a spawn point,
   *  a road, or the river itself. */
  excludedNodes: Set<number>
  /** Already-claimed solid footprint cells and anchors — never flood a
   *  mine/dwelling/guard's own tile. */
  blocked: Set<number>
  usedAnchors: Set<number>
  rng: () => number
  /** Chance any given eligible neutral zone gets a lake. */
  chance?: number
  /** Lake size range, in tiles. */
  minSize?: number
  maxSize?: number
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
  const { sizeX, sizeZ, zones, tilesByZone, excludedNodes, blocked, usedAnchors, rng, chance = 0.4, minSize = 8, maxSize = 32 } = options
  const waterNodes = new Set<number>()
  const waterChanges: { node: number; waterId: number }[] = []
  const levelChanges: { node: number; level: number }[] = []

  for (const zone of zones) {
    if (zone.kind !== 'neutral') continue
    if (rng() >= chance) continue

    const eligible = new Set(
      (tilesByZone.get(zone.id) ?? []).filter(
        (n) => !excludedNodes.has(n) && !blocked.has(n) && !usedAnchors.has(n) && !waterNodes.has(n),
      ),
    )
    if (eligible.size < minSize) continue // too little free room to bother

    const targetSize = Math.min(eligible.size, minSize + Math.floor(rng() * (maxSize - minSize)))
    const seed = [...eligible][Math.floor(rng() * eligible.size)]
    const blob = growBlob(seed, sizeX, sizeZ, targetSize, eligible, rng)
    const waterId = WATER_IDS[Math.floor(rng() * WATER_IDS.length)]

    for (const node of blob) {
      waterNodes.add(node)
      waterChanges.push({ node, waterId })
      levelChanges.push({ node, level: -1 })
    }
  }

  return { waterChanges, levelChanges, waterNodes }
}
