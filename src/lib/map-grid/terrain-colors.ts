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

/** Saturated base color per biome — used only to derive the light fill below. */
const BIOME_BASE_COLORS: Record<BiomeId, string> = {
  1: '#4caf50', // Grass — green
  2: '#d9b96b', // Sand — tan
  3: '#5b4e63', // Deathland — blighted purple-gray
  4: '#a9c6d9', // Snow — pale ice blue
  5: '#c9812f', // Autumn — orange-brown
  6: '#c0392b', // Lava — red-orange
  7: '#8a6640', // Dirt — brown
}

/** Water overlay (DB/map/waters/waters.json, id 1-7 all render the same blue here). */
const WATER_BASE_COLOR = '#3d85c6'

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
 * "Dirt - Tile (6, 8)"-style label for a tile (issue #125) — shared by the
 * docked hover panel and the (docked/undocked) cell-info column so both
 * derive it identically instead of duplicating the lookup.
 */
export function terrainLabel(
  tilesMap: number[],
  waterMap: number[],
  node: number,
  sizeX: number,
): string {
  const tileId = tilesMap[node]
  const waterId = waterMap[node]
  const biome = tileId !== undefined && isBiomeId(tileId) ? BIOME_NAMES[tileId] : 'Unknown'
  const suffix = waterId ? ' (Water)' : ''
  return `${biome}${suffix} - Tile (${node % sizeX}, ${Math.floor(node / sizeX)})`
}
