// ─── Tree/mountain cluster simulation + decorative rotation (issue #207) ─────
// H3's own scenery objects are frequently multi-cell "clusters" — a single
// placed instance whose 8x6 block mask spans several tiles, visually reading
// as a grove of trees or a mountain range rather than one object. OE's own
// catalog has no literal multi-tile "cluster" sid for these (every tree
// variant — pinetree_1..4, tree_dirt_1..4, etc. — is a single 1x1 tile;
// "big" mountain variants are single 2x2/3x3 objects, not clusters either)
// — so a cluster is simulated here by placing SEVERAL small OE objects
// across the H3 object's own footprint: one independently-picked tree
// variant per occupied cell for trees, or a greedy mix of 1x1 "small" and
// 2x2 "big" objects for mountains. This is a real, user-requested feature,
// not a port from the reference project, which only ever tiles a single
// stock 1x1 blocker across every source blocked cell with no size variety
// at all (`scenery_footprint.py`'s `stock_1x1_tiled` mode — see
// reference/homm3-olden-stock-translator/src/vanilla_stock/scenery_footprint.py,
// local reference copy, gitignored).
//
// Also home to the "always randomize decorative rotation" hard rule
// (user-requested): every placement this module returns gets an
// independently random rotation. OE's own catalog marks every environment
// sid `randomRotation: true` (Core/DB/map/objects/*.json), so a fixed
// rotation of 0 on every instance is a real, avoidable visual tell this
// feature must not reproduce. Every placement here uses only 1x1 or fully-
// solid-square (2x2) footprints, both rotationally symmetric in occupied-
// cell terms, so randomizing rotation never invalidates the cell-claiming
// math below.

import type { CatalogMapObject } from '@/lib/catalog/types'
import { blockMaskOffsets } from './h3m-object-registry'
import { pickVariant } from './scenery-variants'

/** One of the 4 base OE rotation quadrants (0/90/180/270°) — deliberately
 *  never a mirrored (+10) variant, a distinct visual flip this feature
 *  wasn't asked to introduce. */
export function randomDecorRotation(rng: () => number): number {
  return Math.floor(rng() * 4)
}

export interface FootprintCell { x: number; z: number }

export interface FootprintCells {
  cells: FootprintCell[]
  /** Occupied cells that fell outside the source layer's own [0,size)
   *  bounds and were dropped (a multi-cell footprint can extend off-map
   *  even when its anchor doesn't — same edge case `atlas.targetNode()`
   *  already guards for the anchor alone, tracked here for the conversion
   *  report rather than silently dropped). */
  clippedCount: number
}

/** H3's own 8x6 block mask, translated to absolute world cells and clipped
 *  to the source layer's own [0,size) bounds. Falls back to the anchor cell
 *  alone when the mask has no blocked cells at all, or every blocked cell
 *  clipped away — matching this importer's pre-existing single-anchor
 *  placement behavior for that case. */
export function footprintCellsInBounds(blockMask: number[], anchorX: number, anchorY: number, size: number): FootprintCells {
  const offsets = blockMaskOffsets(blockMask)
  const cells: FootprintCell[] = []
  for (const { dx, dz } of offsets) {
    const x = anchorX + dx, z = anchorY + dz
    if (x >= 0 && x < size && z >= 0 && z < size) cells.push({ x, z })
  }
  const clippedCount = offsets.length - cells.length
  if (cells.length === 0) return { cells: [{ x: anchorX, z: anchorY }], clippedCount: 0 }
  return { cells, clippedCount }
}

/** H3's "Oak Trees" (object id 135) real-world look mixes OE's grass and
 *  dirt tree families rather than the single per-biome sid every other tree
 *  object resolves to (user-confirmed) — see h3-object-mapping.ts's
 *  H3_OAK_TREES_OBJECT_ID doc comment for the naming evidence. Falls back to
 *  just `[sid]` for a family with no real siblings, same convention as
 *  `pickVariant`. */
export function buildOakTreePool(families: Map<string, string[]>, grassTreeSid: string, dirtTreeSid: string): string[] {
  const grass = families.get(grassTreeSid) ?? [grassTreeSid]
  const dirt = families.get(dirtTreeSid) ?? [dirtTreeSid]
  return [...new Set([...grass, ...dirt])]
}

export function pickFromPool(pool: string[], rng: () => number): string {
  return pool[Math.floor(rng() * pool.length)]
}

export interface ClusterPlacement {
  sid: string
  anchor: FootprintCell
}

/** One independently random-picked tree variant per occupied H3 footprint
 *  cell — the actual tree-cluster simulation. Pass `pool` (see
 *  `buildOakTreePool`) to override the normal per-biome family lookup for
 *  H3 Oak Trees; omit it for every other tree object id. */
export function pickTreeClusterPlacements(
  cells: FootprintCell[], resolvedSid: string, families: Map<string, string[]>, rng: () => number, pool?: string[],
): ClusterPlacement[] {
  return cells.map((cell) => ({
    sid: pool ? pickFromPool(pool, rng) : pickVariant(resolvedSid, families, rng),
    anchor: cell,
  }))
}

/** The resolved small mountain sid's "_big_" counterpart (e.g.
 *  `mountain_green_small_1` -> `mountain_green_big_1`) — every current
 *  BIOME_ROLE_REPLACEMENTS.mountain value follows this naming convention
 *  (confirmed against every biome in Core/DB/map/objects/1_environments.json
 *  this session). Returns `null` for a sid that doesn't match, so a future
 *  biome table change fails safe (small-only) rather than referencing a
 *  guessed, possibly-nonexistent sid. */
export function mountainBigSid(smallSid: string): string | null {
  return smallSid.includes('_small_') ? smallSid.replace('_small_', '_big_') : null
}

/** Greedily mixes 1x1 "small" and 2x2 "big" stock mountain objects across a
 *  multi-cell H3 mountain footprint, so a cluster reads as several
 *  differently-sized mountain graphics rather than one repeated tile — OE
 *  has no literal "mountain cluster" sid; this is the closest honest
 *  simulation using what the catalog actually has. `bigSid` (see
 *  `mountainBigSid`) is only used when it's a real catalog family (present
 *  in `families`) AND its representative config is confirmed a fully-solid
 *  2x2 square anchored at its own (0,0) local cell (pivot 0,0) — every real
 *  "_big_" biome mountain variant checked this session matches that shape,
 *  but this is checked at runtime rather than trusted blindly, since a
 *  mismatch would place the object over the wrong cells. When `bigSid`
 *  isn't usable, every cell falls back to "small" only — still a real
 *  cluster (multiple placed objects), just without size mixing. */
export function packMountainCluster(
  cells: FootprintCell[], smallSid: string, bigSid: string | null,
  families: Map<string, string[]>, catalogById: Map<string, CatalogMapObject>, rng: () => number,
): ClusterPlacement[] {
  const bigConfig = bigSid ? catalogById.get(bigSid) : undefined
  const canUseBig = !!bigSid && !!bigConfig && !!families.get(bigSid)
    && (bigConfig.pivotX ?? 0) === 0 && (bigConfig.pivotZ ?? 0) === 0
    && (bigConfig.sizeX ?? 1) === 2 && (bigConfig.sizeZ ?? 1) === 2
    && (bigConfig.nodes ?? []).every((n) => n === 1)

  const occupied = new Set(cells.map((c) => `${c.x},${c.z}`))
  const claimed = new Set<string>()
  const ordered = [...cells].sort((a, b) => (a.z - b.z) || (a.x - b.x))
  const placements: ClusterPlacement[] = []

  for (const cell of ordered) {
    const key = `${cell.x},${cell.z}`
    if (claimed.has(key)) continue
    if (canUseBig && rng() < 0.5) {
      const block = [
        { x: cell.x, z: cell.z }, { x: cell.x + 1, z: cell.z },
        { x: cell.x, z: cell.z + 1 }, { x: cell.x + 1, z: cell.z + 1 },
      ]
      const blockKeys = block.map((c) => `${c.x},${c.z}`)
      if (blockKeys.every((k) => occupied.has(k) && !claimed.has(k))) {
        blockKeys.forEach((k) => claimed.add(k))
        placements.push({ sid: pickVariant(bigSid as string, families, rng), anchor: cell })
        continue
      }
    }
    claimed.add(key)
    placements.push({ sid: pickVariant(smallSid, families, rng), anchor: cell })
  }
  return placements
}
