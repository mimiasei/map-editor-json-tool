// ─── Terrain on a map somebody already started ───────────────────────────────
// Repaints biomes on free ground only: a tile under or beside an object, water, a road or a river keeps its biome, so nothing placed is left standing on
// ground it was not meant for. Two ways: the generator's own zone terrain (regions laid out like a random map's zones, borders blended), or plain organic
// patches with no zone structure.

import type { CatalogMapObject } from '@/lib/catalog/types'
import type { MapContainer } from '@/lib/map-write'
import type { BiomeId } from '@/lib/map-grid/terrain-colors'
import { generateTerrain } from './generate-terrain'

export interface OnMapTerrainLayer {
  /** 'zones': the generator's zone layout and biomes; 'patches': organic patches, no zones. */
  mode: 'zones' | 'patches'
  biomes: ReadonlySet<BiomeId>
  /** 'unpainted': only tiles still carrying the map's most common biome (what a new map starts with); 'all': any free tile. */
  scope: 'unpainted' | 'all'
  /** The blank-map template (needed for 'zones'; the generator builds its zone terrain on a throw-away copy). */
  template?: MapContainer
}

/** Average patch size of the 'patches' mode, in tiles. */
const PATCH_TILES = 700
/** Per-tile distance jitter that roughens the patch borders. */
const PATCH_JITTER = 3

/** The most common biome of the map: what a blank map is filled with, so "unpainted" means "still this". */
export function dominantBiome(tiles: readonly number[]): number {
  const counts = new Map<number, number>()
  for (const b of tiles) counts.set(b, (counts.get(b) ?? 0) + 1)
  let best = tiles[0]
  let bestCount = -1
  for (const [b, n] of counts) if (n > bestCount) { best = b; bestCount = n }
  return best
}

export function paintOnMapTerrain(options: {
  sizeX: number
  sizeZ: number
  tiles: number[]
  /** Tiles that must keep their biome (objects and their footprints, water, roads, rivers). */
  occupied: ReadonlySet<number>
  startCount: number
  layer: OnMapTerrainLayer
  catalogById: Map<string, CatalogMapObject>
  rng: () => number
}): { node: number; biomeId: number }[] {
  const { sizeX, sizeZ, tiles, occupied, startCount, layer, catalogById, rng } = options
  const biomes = [...layer.biomes] as BiomeId[]
  if (biomes.length === 0) return []
  const tileCount = sizeX * sizeZ

  let target: number[]
  if (layer.mode === 'zones') {
    if (!layer.template) throw new Error('Terrain with zones needs the blank-map template')
    target = generateTerrain(layer.template, catalogById, {
      sizeX, sizeZ, playerCount: Math.max(2, Math.min(8, startCount)), includeSpawners: false, waterContent: 'none', rng,
      zoneJaggedness: 0.4, zoneSpread: 1, organicTerrainBlending: 0.3, enabledBiomes: biomes,
    }).tileBiome
  } else {
    const seeds = Array.from({ length: Math.max(3, Math.round(tileCount / PATCH_TILES)) }, () => ({
      x: rng() * sizeX, z: rng() * sizeZ, biome: biomes[Math.floor(rng() * biomes.length)],
    }))
    target = new Array<number>(tileCount)
    for (let n = 0; n < tileCount; n++) {
      const x = n % sizeX
      const z = Math.floor(n / sizeX)
      let best = seeds[0].biome
      let bestD = Infinity
      for (const s of seeds) {
        const d = Math.hypot(x - s.x, z - s.z) + (rng() - 0.5) * PATCH_JITTER
        if (d < bestD) { bestD = d; best = s.biome }
      }
      target[n] = best
    }
  }

  const blank = layer.scope === 'unpainted' ? dominantBiome(tiles) : null
  const changes: { node: number; biomeId: number }[] = []
  for (let n = 0; n < tileCount; n++) {
    if (occupied.has(n) || target[n] === tiles[n] || (blank !== null && tiles[n] !== blank)) continue
    changes.push({ node: n, biomeId: target[n] })
    tiles[n] = target[n]
  }
  return changes
}
