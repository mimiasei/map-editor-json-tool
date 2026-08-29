// ─── H3 terrain/river/road → OE tile/water/road projection ───────────────────
// Ported from the reference project (leviritchie/homm3-olden-stock-translator)
// `vanilla_stock/terrain.py`, used with the author's explicit permission.
// Stock OE tile/water ids are a fixed 1-7 range (see CLAUDE.md's own
// `tilesMap`/`waterMap` notes) — hardcoded here rather than re-derived from
// Core.zip at import time, matching this project's existing convention.

import type { H3mTile } from './h3m-terrain'
import type { LayerAtlasLayout } from './atlas'

export const STOCK_OCEAN_TILE_ID = 2 // Sand basin stand-in for H3 water
export const STOCK_PADDING_TILE_ID = 1
export const STOCK_SUBTERRANEAN_TILE_ID = 7 // Dirt stand-in for H3's Burrow (GE-only)
export const STOCK_ROCK_TILE_ID = 7 // Dirt, at levels=1 — OE has no distinct rock tile
export const ALLOWED_STOCK_TILE_IDS = new Set([1, 2, 3, 4, 5, 6, 7])

export const H3_UNDERGROUND_SUBTERRANEAN_TERRAIN_ID = 6
export const H3_UNDERGROUND_ROCK_TERRAIN_ID = 9

export const NATIVE_OCEAN_BASIN_LEVEL = -1
export const UNDERGROUND_ROCK_LEVEL = 1
export const UNDERGROUND_ROCK_CLIMB = 0

/** H3 terrain id → stock OE tilesMap id. */
export const H3_TO_STOCK_TILE: Record<number, number> = {
  0: 7, // dirt
  1: 2, // sand
  2: 1, // grass
  3: 4, // snow
  4: 5, // swamp → Autumn
  5: 1, // rough → grass
  6: STOCK_SUBTERRANEAN_TILE_ID, // subterranean → Dirt (Burrow is GE-only)
  7: 6, // lava
  8: STOCK_OCEAN_TILE_ID, // water → sand basin
  9: STOCK_ROCK_TILE_ID, // rock (elevated)
  10: 1, // HotA highlands → grass
  11: 3, // HotA wasteland → Deathland
}

/** H3 road code (0-3; 3 = cobblestone) → stock OE roadsMap id. Only 1 and 2
 *  are evidenced on real stock/shipped maps — H3's cobblestone (3) folds
 *  lossily onto 2 rather than inventing an unevidenced OE road id. */
const H3_SURFACE_ROAD_TO_OLDEN_ROAD: Record<number, number> = { 1: 1, 2: 2, 3: 2 }

export function projectH3TileToStock(h3Terrain: number): number {
  const tile = H3_TO_STOCK_TILE[h3Terrain]
  if (tile === undefined) throw new Error(`Unsupported H3 terrain id ${h3Terrain}`)
  if (!ALLOWED_STOCK_TILE_IDS.has(tile)) throw new Error(`Projected tile ${tile} for H3 terrain ${h3Terrain} not stock-legal`)
  return tile
}

export function projectH3RoadCode(h3RoadCode: number): number {
  if (h3RoadCode === 0) return 0
  const road = H3_SURFACE_ROAD_TO_OLDEN_ROAD[h3RoadCode]
  if (road === undefined) throw new Error(`Unsupported H3 road code ${h3RoadCode}`)
  return road
}

export interface AtlasArrays {
  tilesMap: number[]
  waterMap: number[]
  roadsMap: number[]
  levelsMap: number[]
  climbsMap: number[]
  /** Atlas nodes with an H3 river tile — a separate overlay from `waterMap`
   *  (see `buildRiverNodesTable`'s own doc comment for why). Populated by
   *  `projectLayerIntoAtlas`, consumed after every layer is projected. */
  riverNodes: Set<number>
}

export function buildEmptyAtlasArrays(atlas: LayerAtlasLayout): AtlasArrays {
  const total = atlas.atlasWidth * atlas.atlasHeight
  return {
    tilesMap: new Array(total).fill(STOCK_PADDING_TILE_ID),
    waterMap: new Array(total).fill(0),
    roadsMap: new Array(total).fill(0),
    levelsMap: new Array(total).fill(0),
    climbsMap: new Array(total).fill(0),
    riverNodes: new Set<number>(),
  }
}

/** Project one H3 layer's decoded tiles into the pre-sized atlas arrays
 *  (mutates `out` in place). Ocean/underground-rock get their special
 *  level/climb treatment. Every H3-water-derived basin cell is left at
 *  `climbsMap=0` deliberately — ported from the reference project as a
 *  perimeter-ramp stamp (every basin cell 8-adjacent to a non-basin cell or
 *  the atlas edge got climbs=1) but confirmed WRONG against real shipped
 *  maps (issue #207 Phase 5/6): a real basin's perimeter carries climbs=1 on
 *  only a small, sparse, clearly hand-placed fraction of its edge (e.g.
 *  11/199, 78/1425, 7/4826 across several real maps), and several
 *  fully-water basins (Stormlight.map, Stormlight_squad.map, TheQuest.map)
 *  have ZERO climb-1 tiles anywhere at all — water is already impassable via
 *  the separate `waterMap!==0` rule (passability.ts), so a climb ramp out of
 *  it serves no purpose and real maps evidently never bother placing one.
 *  Stamping climbs on every coastline tile (the removed
 *  `applyStockOceanBasinGeometry`) visibly over-produced ramps along every
 *  water/land edge instead. */
export function projectLayerIntoAtlas(
  layerTiles: H3mTile[], layerIndex: number, atlas: LayerAtlasLayout, out: AtlasArrays, size: number,
): void {
  for (let i = 0; i < layerTiles.length; i++) {
    const x = i % size
    const y = Math.floor(i / size)
    const tile = layerTiles[i]
    const node = atlas.targetNode(layerIndex, x, y)
    out.tilesMap[node] = projectH3TileToStock(tile.terrain)
    out.waterMap[node] = 0
    out.roadsMap[node] = 0
    out.levelsMap[node] = 0
    out.climbsMap[node] = 0

    if (tile.terrain === 8) {
      if (tile.river !== 0) throw new Error(`H3 water terrain with additional river overlay at layer=${layerIndex} ${x},${y}`)
      out.levelsMap[node] = NATIVE_OCEAN_BASIN_LEVEL
      out.climbsMap[node] = 0
      // A depressed (levelsMap===-1) cell is NOT itself treated as water by
      // this editor — passability.ts keys strictly off waterMap!==0, and
      // real shipped maps confirm plenty of dry level-(-1) canyon/pit
      // terrain exists (Gorges_of_Discord.map, Fun_and_Graves.map: zero
      // water at any of their level-(-1) tiles). An H3 water tile must
      // therefore also fill waterMap, or it silently renders as a dry,
      // walkable pit. Real maps pairing tilesMap===2 (Sand, this stand-in
      // tile) with levelsMap===-1 carry a nonzero waterMap 97% of the time,
      // most commonly the same "Water (Sand)" flavor (id 2, 57% of that
      // corpus) — reuse STOCK_OCEAN_TILE_ID for both rather than inventing
      // a second constant for the same real-data-backed value.
      out.waterMap[node] = STOCK_OCEAN_TILE_ID
    } else if (tile.terrain === H3_UNDERGROUND_ROCK_TERRAIN_ID) {
      out.levelsMap[node] = UNDERGROUND_ROCK_LEVEL
      out.climbsMap[node] = UNDERGROUND_ROCK_CLIMB
    } else if (tile.river !== 0) {
      // A river tile is otherwise ordinary walkable terrain of its own
      // biome — H3 rivers are not impassable, unlike lakes/ocean, and OE's
      // own river data (`rivers[0].nodes`, see buildRiverNodesTable) is a
      // separate overlay from waterMap/levelsMap, so nothing else changes
      // here. Recorded now, resolved into the real per-node shape code
      // after every layer is projected (needs full atlas-space neighbor
      // adjacency, not available mid-layer).
      out.riverNodes.add(node)
    }

    if (tile.road !== 0) out.roadsMap[node] = projectH3RoadCode(tile.road)
  }
}

/** Every H3 river tile becomes one `{n, s, isWaterfall}` entry in OE's real
 *  `rivers[0].nodes[]` table (previously this importer instead stamped H3
 *  river tiles into `waterMap` — a real, user-reported bug: it made rivers
 *  impassable like lake/ocean water, and rendered them as a flat color-block
 *  basin rather than OE's own dedicated river art). `isWaterfall` is always
 *  false — H3 has no equivalent concept to derive it from (OE's own map
 *  editor lets an author flag any river tile as a waterfall; nothing in H3's
 *  own tile data corresponds to that).
 *
 *  `s` (OE's per-tile river shape/orientation code) is a plain 4-bit
 *  neighbor bitmask — `E:1 | W:2 | S:4 | N:8`, one bit per side that ALSO
 *  has a river tile — confirmed by directly correlating every real river
 *  node's own `s` value against its true 4-neighbor adjacency across every
 *  real sample map with river data (`maps/*.map`: Fun_and_Graves,
 *  Glittering_Strait, Gorges_of_Discord, Stormlight (+2 variants),
 *  TheQuest, The_Mysterious_Island, Thirst_for_Power,
 *  all_cats_go_to_heaven, ascension_to_the_throne, song_of_murmurwood —
 *  2000+ river tiles total): all 16 possible neighbor patterns match this
 *  exact formula, with the dominant `s` value at massive statistical
 *  majority for every one (e.g. a straight N-S line, 372 real instances,
 *  is `s=12` with zero exceptions; a straight E-W line, 396 instances, is
 *  `s=3` with zero exceptions). This lines up with OE's own
 *  `DB/map/rivers/rivers.json` template's piece roles (point/line×3/
 *  turn×4-rotations/join×4-rotations/cross/waterfall = 14 addressable
 *  shapes, matching the observed 0-15 range once isWaterfall is factored
 *  out) — not a guess, a directly reverse-engineered encoding. */
export function buildRiverNodesTable(
  riverNodes: Set<number>, atlasWidth: number, atlasHeight: number,
): { n: number; s: number; isWaterfall: boolean }[] {
  const table: { n: number; s: number; isWaterfall: boolean }[] = []
  for (const node of riverNodes) {
    const x = node % atlasWidth
    const z = Math.floor(node / atlasWidth)
    const hasN = z > 0 && riverNodes.has(node - atlasWidth)
    const hasE = x < atlasWidth - 1 && riverNodes.has(node + 1)
    const hasS = z < atlasHeight - 1 && riverNodes.has(node + atlasWidth)
    const hasW = x > 0 && riverNodes.has(node - 1)
    const s = (hasE ? 1 : 0) | (hasW ? 2 : 0) | (hasS ? 4 : 0) | (hasN ? 8 : 0)
    table.push({ n: node, s, isWaterfall: false })
  }
  return table
}

/** Every atlas cell outside every real H3 layer's rectangle becomes elevated,
 *  unclimbable Dirt — stock OE has no invisible blocker / Void tile, so this
 *  is the only honest way to make padding around a side-by-side atlas
 *  unwalkable.
 *
 *  MUST be called only after every object has been placed AND clamped to
 *  fit entirely inside its own layer's real rectangle (see
 *  `object-footprint-clamp.ts`'s `clampFootprintToLayer`) — this function
 *  was previously removed (issue #207) because a multi-cell object (a
 *  city-spawner, for one) anchored near the H3 map's own edge could have
 *  part of its footprint land in this exact padding region, and this wall
 *  would then render right on top of it — not just visually wrong but
 *  passability-breaking (the "wall" rule in passability.ts blocks any tile
 *  bordering a different, non-ramp-adjacent level, so a spawner partly
 *  sitting on elevated Dirt could become partly unreachable). The real fix
 *  is the clamp, not removing the wall — every object is now guaranteed
 *  clear of this region by the time this paints it. */
export function paintEnvelopePadding(out: AtlasArrays, atlas: LayerAtlasLayout): void {
  const total = atlas.atlasWidth * atlas.atlasHeight
  const sourceNodes = new Set<number>()
  for (const layer of Object.keys(atlas.layers).map(Number)) {
    for (let y = 0; y < atlas.sourceHeight; y++) {
      for (let x = 0; x < atlas.sourceWidth; x++) {
        sourceNodes.add(atlas.targetNode(layer, x, y))
      }
    }
  }
  for (let node = 0; node < total; node++) {
    if (sourceNodes.has(node)) continue
    out.tilesMap[node] = STOCK_ROCK_TILE_ID
    out.levelsMap[node] = UNDERGROUND_ROCK_LEVEL
    out.climbsMap[node] = UNDERGROUND_ROCK_CLIMB
    out.waterMap[node] = 0
    out.roadsMap[node] = 0
  }
}
