// ─── RMG biome isolation ─────────────────────────────────────────────────────
// Sand (2), Snow (4) and Lava (6) are very distinct biomes that do not mix
// with the others: their objects don't work on any other ground, and other
// biomes' objects don't work on them. This module is the one shared rule.
//
// Objects with no biome tag (mines, shrines, resources, ...) are universal and
// may stand anywhere. So are the Grass pine trees `pinetree_1..4`: they are
// multi-purpose (user decision), unlike `pinetree_snow_*` / `pinetree_withered_*`.

import type { CatalogMapObject } from '@/lib/catalog/types'
import type { BiomeId } from '@/lib/map-grid/terrain-colors'

/** Biomes that never mix with another one: Sand, Snow, Lava. */
export const RESTRICTED_BIOMES: ReadonlySet<number> = new Set([2, 4, 6])

export const isRestrictedBiome = (biome: number | null | undefined): boolean => biome !== null && biome !== undefined && RESTRICTED_BIOMES.has(biome)

/** The Grass pines — allowed on every biome. */
const UNIVERSAL_SID = /^pinetree_\d+$/

/** Catalog biome string → tile biome id (the catalog says "Desert" for Sand). */
const CATALOG_BIOME_TO_ID: Record<string, BiomeId> = {
  Grass: 1, Desert: 2, Deathland: 3, Snow: 4, Autumn: 5, Lava: 6, Dirt: 7,
}

/** The biome an object belongs to, or null when it may stand anywhere. */
export function sidBiome(sid: string, catalogById: Map<string, CatalogMapObject>): BiomeId | null {
  if (UNIVERSAL_SID.test(sid)) return null
  const biome = catalogById.get(sid)?.biome
  return biome ? CATALOG_BIOME_TO_ID[biome] ?? null : null
}

/** True when an object of `objectBiome` must not stand on `tileBiome`: they
 *  differ and at least one of the two is Sand, Snow or Lava. */
export function violatesIsolation(objectBiome: number | null, tileBiome: number | undefined): boolean {
  if (objectBiome === null || tileBiome === undefined || objectBiome === tileBiome) return false
  return RESTRICTED_BIOMES.has(objectBiome) || RESTRICTED_BIOMES.has(tileBiome)
}
