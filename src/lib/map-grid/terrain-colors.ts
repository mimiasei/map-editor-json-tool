// ─── Map grid — terrain fill colors ──────────────────────────────────────────
// Biome IDs and names come straight from Core/DB/map/tiles/tiles.json (issue
// #122 follow-up: fill every grid cell with its terrain, not just occupied
// ones). The actual hex colors below are an editor-UI choice, not extracted
// from the game — there is no color data in Core's JSON (materials/textures
// are baked into binary assets, not these files) — chosen to roughly match
// each biome's real-world association (grass=green, sand=tan, etc.).

export type BiomeId = 1 | 2 | 3 | 4 | 5 | 6 | 7

export const BIOME_NAMES: Record<BiomeId, string> = {
  1: 'Grass',
  2: 'Sand',
  3: 'Deathland',
  4: 'Snow',
  5: 'Autumn',
  6: 'Lava',
  7: 'Dirt',
}

/** Saturated base color per biome — used to derive the light fill below, and
 *  directly as the terrain-paint tool's swatch/preview color (Phase D). */
export const BIOME_BASE_COLORS: Record<BiomeId, string> = {
  1: '#1da324', // Grass — green
  2: '#d9b96b', // Sand — tan
  3: '#37333e', // Deathland — blighted purple-gray
  4: '#c9e6fa', // Snow — pale ice blue
  5: '#9f445a', // Autumn — orange-brown
  6: '#1c0606', // Lava — red-orange
  7: '#4e3617', // Dirt — brown
}

/** Water overlay (DB/map/waters/waters.json, id 1-7 all render the same blue here). */
const WATER_BASE_COLOR = '#2197ea'

/** Real names from Core/DB/map/waters/waters.json — used by the Water
 *  flood-fill tool's swatch (issue #193 Phase 2). All 7 render the same
 *  WATER_BASE_COLOR above (confirmed: no per-id color data exists, same
 *  situation as biomes), so the swatch differentiates by label only. */
export const WATER_TYPE_NAMES: Record<number, string> = {
  1: 'Water (Dirt)',
  2: 'Water (Sand)',
  3: 'Water (Death)',
  4: 'Water (Snow)',
  5: 'Water (Fallen)',
  6: 'Lava',
  7: 'Water (Grass)',
}

/** Road type per DB/map/roads/roads.json (id 1 "test Road" bonus 0.20, id 2
 *  "test Road2" bonus 0.30) — which id is "dirt" vs "stone" is NOT confirmed
 *  by the game data (undescriptive placeholder names); this assumes id 2 =
 *  Stone (the higher movement bonus) as a best guess pending real desktop-
 *  build/GME testing (see RawMapBlock2.roadsMap's doc comment). */
export const ROAD_TYPE_NAMES: Record<number, string> = {
  1: 'Dirt Road',
  2: 'Stone Road',
}

// Chosen to be unambiguous against every other color already on this
// canvas — every BIOME_BASE_COLORS entry, WATER_BASE_COLOR, and every
// GROUP_COLORS category swatch (units/artifacts/spawners/interactables/
// resources/decorations/zones, MapGridDialog.tsx) — not just "close to
// real dirt/stone," since a road/river tile can sit right next to any of
// those and needs to read as its own distinct feature, not a shade of an
// existing one (user-requested: issue roads/rivers follow-up).
export const ROAD_BASE_COLORS: Record<number, string> = {
  1: '#ff8800', // Dirt — vivid orange (existing browns are all darker/muted)
  2: '#a8b8c8', // Stone — cool blue-gray (existing grays have no blue tint)
}

/** Vivid yellow — no other color on this canvas is yellow, so it can't be
 *  confused with WATER_BASE_COLOR/Snow's pale blue or anything else, unlike
 *  an earlier blue-family pick that was too close to Water's own blue. */
export const RIVER_BASE_COLOR = '#ffd400'

/** Fallback for an out-of-range/unknown tile id (shouldn't occur — every real map's
 *  tilesMap values were verified to fall in 1-7, but a malformed map could differ). */
const UNKNOWN_BASE_COLOR = '#9a9a9a'

/** Default blend amount for the light grid fill: how much of the base color
 *  survives against white. Adjustable at runtime (issue #125 settings dialog). */
export const DEFAULT_TERRAIN_BLEND = 0.16

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

function mixWithWhite(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex)
  const mix = (c: number) => Math.round(c * amount + 255 * (1 - amount))
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`
}

function isBiomeId(id: number): id is BiomeId {
  return id >= 1 && id <= 7
}

/**
 * Light fill color for one tile — water (if present) wins over the base
 * biome, matching how water visually covers terrain in-game. `blendAmount`
 * (0-1) is user-adjustable via the Map Grid settings dialog; defaults to
 * DEFAULT_TERRAIN_BLEND.
 */
export function terrainFillColor(
  tileId: number | undefined,
  waterId: number | undefined,
  blendAmount: number = DEFAULT_TERRAIN_BLEND,
): string {
  if (waterId) return mixWithWhite(WATER_BASE_COLOR, blendAmount)
  if (tileId === undefined || !isBiomeId(tileId)) return mixWithWhite(UNKNOWN_BASE_COLOR, blendAmount)
  return mixWithWhite(BIOME_BASE_COLORS[tileId], blendAmount)
}

/**
 * "Dirt - Tile (6, 8), Level 0"-style label for a tile (issue #125, extended
 * #167 with level/ramp info) — shared by the docked hover panel and the
 * (docked/undocked) cell-info column so both derive it identically instead
 * of duplicating the lookup. `rampDirection` is the tile's "up" direction
 * from ramp-direction.ts's buildRampDirectionMap — passed in rather than
 * recomputed here so this module doesn't need to depend on that one.
 */
export function terrainLabel(
  tilesMap: number[],
  waterMap: number[],
  node: number,
  sizeX: number,
  levelsMap?: number[],
  rampDirection?: string,
): string {
  const tileId = tilesMap[node]
  const waterId = waterMap[node]
  const biome = tileId !== undefined && isBiomeId(tileId) ? BIOME_NAMES[tileId] : 'Unknown'
  const suffix = waterId ? ' (Water)' : ''
  const levelSuffix = levelsMap ? `, Level ${levelsMap[node] ?? 0}` : ''
  const rampSuffix = rampDirection ? `, Ramp (${rampDirection})` : ''
  return `${biome}${suffix} - Tile (${node % sizeX}, ${Math.floor(node / sizeX)})${levelSuffix}${rampSuffix}`
}
