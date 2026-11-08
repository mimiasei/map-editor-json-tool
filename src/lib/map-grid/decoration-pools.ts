// ─── Map Grid — decoration types per biome ──────────────────────────────────
// The image-to-map tool paints "trees of Grass and Autumn" instead of one named object. A type is a decoration sub-category of
// decoration-subcategories.ts (so the lists agree with the object browser and the stats), a biome is the catalog entry's own `biome`
// field. Each biome carries several variants of a type (Grass: pinetree_1-4, Snow: pinetree_snow_1-4, Lava: tree_lava_1-3 ...); the painter
// picks one at random per tile. Counts per type and biome were read from Core.zip's 1_environments.json (Nov 2026): 2-18 variants, and
// Lava has no hills, Dirt has no hills and no walkables of its own.

import type { GameCatalog } from '@/lib/catalog/types'
import { resolveDecorationSubcategory } from './decoration-subcategories'
import { BIOME_ID_TO_CATALOG_BIOME, buildWalkablePools } from './fuzzy-obstacle'
import type { BiomeId } from './terrain-colors'

export type DecorationType = 'trees' | 'mountains' | 'hills' | 'rocks' | 'walkable' | 'pools'

export const DECORATION_TYPES: DecorationType[] = ['trees', 'mountains', 'hills', 'rocks', 'walkable', 'pools']

export type DecorationPools = Record<DecorationType, Partial<Record<BiomeId, string[]>>>

const poolsByCatalog = new WeakMap<GameCatalog, DecorationPools>()

function isDecorationType(sub: string): sub is DecorationType {
  return (DECORATION_TYPES as string[]).includes(sub)
}

export function buildDecorationPools(catalog: GameCatalog): DecorationPools {
  const cached = poolsByCatalog.get(catalog)
  if (cached) return cached
  const pools: DecorationPools = { trees: {}, mountains: {}, hills: {}, rocks: {}, walkable: {}, pools: {} }
  const biomeByCatalogName = new Map((Object.entries(BIOME_ID_TO_CATALOG_BIOME) as [string, string][]).map(([id, name]) => [name, Number(id) as BiomeId]))
  for (const obj of catalog.mapObjects) {
    if (obj.category !== 'environments' || !obj.biome) continue
    const biome = biomeByCatalogName.get(obj.biome)
    if (!biome) continue
    const sub = resolveDecorationSubcategory(obj.id, obj.category)
    // Walkables come from the Walkables brush's own list below: it keeps out look-alikes that block (grass_log_1) and lends Dirt the Grass set.
    if (sub === 'walkable' || !isDecorationType(sub)) continue
    pools[sub][biome] = [...(pools[sub][biome] ?? []), obj.id]
  }
  const walkables = buildWalkablePools(catalog)
  for (const [id, pool] of Object.entries(walkables)) {
    if (pool.obstacles.length > 0) pools.walkable[Number(id) as BiomeId] = pool.obstacles
  }
  poolsByCatalog.set(catalog, pools)
  return pools
}

/** Every variant of `type` in any of `biomes`, each once. */
export function decorationSids(pools: DecorationPools, type: DecorationType, biomes: BiomeId[]): string[] {
  const out = new Set<string>()
  for (const biome of biomes) for (const sid of pools[type][biome] ?? []) out.add(sid)
  return [...out]
}
