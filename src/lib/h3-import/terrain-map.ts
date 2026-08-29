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
export const ALLOWED_STOCK_WATER_IDS = new Set([1, 2, 3, 4, 5, 6, 7])

export const H3_UNDERGROUND_SUBTERRANEAN_TERRAIN_ID = 6
export const H3_UNDERGROUND_ROCK_TERRAIN_ID = 9

export const NATIVE_OCEAN_BASIN_LEVEL = -1
export const NATIVE_OCEAN_BASIN_INTERIOR_CLIMB = 0
export const NATIVE_OCEAN_BASIN_PERIMETER_CLIMB = 1
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

/** H3 terrain+river code → stock OE waterMap id. River code 0 = none. */
export const H3_RIVER_TO_STOCK_WATER: Record<number, Record<number, number>> = {
  0: { 1: 1, 2: 1, 3: 1 },
  1: { 1: 2, 2: 2, 3: 2, 4: 6 },
  2: { 1: 7, 2: 7, 3: 7 },
  3: { 1: 4, 2: 4, 3: 4 },
  4: { 1: 3, 2: 3, 3: 3 },
  5: { 1: 7, 2: 7, 3: 7 },
  6: { 1: 1, 2: 1, 3: 1 },
  7: { 1: 1, 2: 1, 3: 1, 4: 6 },
  10: { 1: 7, 2: 7, 3: 7 },
  11: { 1: 3, 2: 3, 3: 3 },
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

export function projectH3RiverToStockWater(h3Terrain: number, h3River: number): number {
  if (h3River === 0) return 0
  const mapping = H3_RIVER_TO_STOCK_WATER[h3Terrain]
  const waterId = mapping?.[h3River]
  if (waterId === undefined) throw new Error(`Unsupported H3 river code ${h3River} on terrain ${h3Terrain}`)
  if (!ALLOWED_STOCK_WATER_IDS.has(waterId)) throw new Error(`Projected waterMap id ${waterId} not stock-legal`)
  return waterId
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
}

export function buildEmptyAtlasArrays(atlas: LayerAtlasLayout): AtlasArrays {
  const total = atlas.atlasWidth * atlas.atlasHeight
  return {
    tilesMap: new Array(total).fill(STOCK_PADDING_TILE_ID),
    waterMap: new Array(total).fill(0),
    roadsMap: new Array(total).fill(0),
    levelsMap: new Array(total).fill(0),
    climbsMap: new Array(total).fill(0),
  }
}

/** Project one H3 layer's decoded tiles into the pre-sized atlas arrays
 *  (mutates `out` in place). Ocean/underground-rock get their special
 *  level/climb treatment; the perimeter climb-ramp pass runs separately,
 *  across the whole shared atlas at once (see `applyStockOceanBasinGeometry`). */
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
      out.waterMap[node] = projectH3RiverToStockWater(tile.terrain, tile.river)
    }

    if (tile.road !== 0) out.roadsMap[node] = projectH3RoadCode(tile.road)
  }
}

/** Stamp perimeter ramp climbs on every depressed (ocean-basin) atlas cell:
 *  8-neighbor contact with a non-basin cell or the atlas edge → climbs=1;
 *  fully interior basin cells → climbs=0. A real, hard-won OE-runtime rule
 *  (see CLAUDE.md's H3-import cross-cutting notes) — must run across the
 *  WHOLE shared atlas at once, not per source layer. */
export function applyStockOceanBasinGeometry(out: AtlasArrays, width: number, height: number): void {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const node = y * width + x
      if (out.levelsMap[node] !== NATIVE_OCEAN_BASIN_LEVEL) continue
      let isPerimeter = false
      for (let dy = -1; dy <= 1 && !isPerimeter; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue
          const nx = x + dx, ny = y + dy
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) { isPerimeter = true; break }
          if (out.levelsMap[ny * width + nx] !== NATIVE_OCEAN_BASIN_LEVEL) { isPerimeter = true; break }
        }
      }
      out.climbsMap[node] = isPerimeter ? NATIVE_OCEAN_BASIN_PERIMETER_CLIMB : NATIVE_OCEAN_BASIN_INTERIOR_CLIMB
    }
  }
}

/** Every atlas cell outside every real H3 layer's rectangle becomes elevated,
 *  unclimbable Dirt — stock OE has no invisible blocker / Void tile, so this
 *  is the only honest way to make padding around a side-by-side atlas
 *  unwalkable. */
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
