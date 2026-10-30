import i18n from '@/lib/i18n'
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

/** Water overlay colour per water id (DB/map/waters/waters.json has no colour data). Estimated by eye from an
 *  in-game screenshot of the test map water_colors.map (one lake per id), not read from game data. */
const WATER_BASE_COLORS: Record<number, string> = {
  1: '#8a6a48', // Dirt — muddy brown
  2: '#16877f', // Sand — teal
  3: '#2c2858', // Death — dark violet
  4: '#2e6082', // Snow — steel blue
  5: '#1f9a62', // Fallen — green
  6: '#7c2006', // Lava — dark red-brown
  7: '#1f3f7a', // Grass — deep navy
}

/** Water id 6 ("Lava" in waters.json): drawn with a glowing rim. */
export const LAVA_WATER_ID = 6

/** Fallback for a water id outside 1-7 (not seen in real maps). */
const WATER_FALLBACK_COLOR = '#2197ea'

/** Real names from Core/DB/map/waters/waters.json — used by the Water
 *  flood-fill tool's swatch (issue #193 Phase 2). */
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
// canvas — every BIOME_BASE_COLORS entry, WATER_BASE_COLORS, and every
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
 *  confused with WATER_BASE_COLORS/Snow's pale blue or anything else, unlike
 *  an earlier blue-family pick that was too close to Water's own blue. */
export const RIVER_BASE_COLOR = '#25eaf1'

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

function mixWithWhite(hex: string, amount: number, alpha = 1): string {
  const [r, g, b] = hexToRgb(hex)
  const mix = (c: number) => Math.round(c * amount + 255 * (1 - amount))
  return alpha < 1 ? `rgba(${mix(r)}, ${mix(g)}, ${mix(b)}, ${alpha})` : `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`
}

/** Colour of one water type as a translucent overlay (the Map Grid's water plane). */
export function waterOverlayColor(waterId: number, alpha: number): string {
  const [r, g, b] = hexToRgb(WATER_BASE_COLORS[waterId] ?? WATER_FALLBACK_COLOR)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function isBiomeId(id: number): id is BiomeId {
  return id >= 1 && id <= 7
}

/**
 * Light fill color for one tile — water (if present) wins over the base
 * biome, matching how water visually covers terrain in-game. `blendAmount`
 * (0-1) is user-adjustable via the Map Grid settings dialog; defaults to
 * DEFAULT_TERRAIN_BLEND. `alpha` < 1 makes the fill see-through so a ground texture
 * drawn underneath shows (Map Grid texture layer); the default keeps it opaque.
 */
export function terrainFillColor(
  tileId: number | undefined,
  waterId: number | undefined,
  blendAmount: number = DEFAULT_TERRAIN_BLEND,
  alpha = 1,
): string {
  if (waterId) return mixWithWhite(WATER_BASE_COLORS[waterId] ?? WATER_FALLBACK_COLOR, blendAmount, alpha)
  if (tileId === undefined || !isBiomeId(tileId)) return mixWithWhite(UNKNOWN_BASE_COLOR, blendAmount, alpha)
  return mixWithWhite(BIOME_BASE_COLORS[tileId], blendAmount, alpha)
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
  // A water tile is named by its water type (Water (Snow)), not by the ground biome underneath it.
  const biome = waterId && waterId in WATER_TYPE_NAMES
    ? i18n.t(`shared.waterTypes.${waterId as 1}`)
    : tileId !== undefined && isBiomeId(tileId) ? i18n.t(`shared.biomes.${tileId}`) : i18n.t('mapGrid.tileInfo.unknown')
  return i18n.t('mapGrid.tileInfo.line', {
    biome,
    x: node % sizeX,
    y: Math.floor(node / sizeX),
    node,
    level: levelsMap ? i18n.t('mapGrid.tileInfo.level', { n: levelsMap[node] ?? 0 }) : '',
    ramp: rampDirection ? i18n.t('mapGrid.tileInfo.ramp', { direction: rampDirection }) : '',
  })
}
