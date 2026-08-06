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

/** Blend amount for the light grid fill: how much of the base color survives against white. */
const LIGHT_BLEND = 0.16

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

const LIGHT_BIOME_COLORS: Record<BiomeId, string> = Object.fromEntries(
  (Object.keys(BIOME_BASE_COLORS) as unknown as BiomeId[]).map((id) => [
    id,
    mixWithWhite(BIOME_BASE_COLORS[id], LIGHT_BLEND),
  ]),
) as Record<BiomeId, string>

const LIGHT_WATER_COLOR = mixWithWhite(WATER_BASE_COLOR, LIGHT_BLEND)
const LIGHT_UNKNOWN_COLOR = mixWithWhite(UNKNOWN_BASE_COLOR, LIGHT_BLEND)

/**
 * Light fill color for one tile — water (if present) wins over the base
 * biome, matching how water visually covers terrain in-game.
 */
export function terrainFillColor(tileId: number | undefined, waterId: number | undefined): string {
  if (waterId) return LIGHT_WATER_COLOR
  if (tileId === undefined) return LIGHT_UNKNOWN_COLOR
  return isBiomeId(tileId) ? LIGHT_BIOME_COLORS[tileId] : LIGHT_UNKNOWN_COLOR
}
