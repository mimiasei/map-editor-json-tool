// ─── Varied trees and mountains for the H3 import ────────────────────────────
// The mapping table (h3-object-mapping.json `sceneryRoleSids`) decides the role and the biome of every tree and mountain; it names one
// sid per biome (`pinetree_1`, `mountain_dirt_small_1`). This picker widens each of those to the biome's whole set of trees or mountains,
// with a little borrowing from related biomes, so a forest or a range is no longer one repeated model. The biome is the catalog biome of
// the table's own sid, so the table stays in charge (Sand's trees stay `grass_desert_1`: not a tree, so not varied here).
//
// Mixing (the RMG's own rule engine, `applyBiomeDecorationMix`, with its own list): Grass and Dirt mix both ways; Autumn and Deathland also
// borrow Grass and Dirt decorations; nothing flows back, and Snow, Lava and Sand keep their own.

import type { CatalogMapObject, GameCatalog } from '@/lib/catalog/types'
import { BIOME_ID_TO_CATALOG_BIOME, buildFuzzyObstaclePools, isTreeDecoration, pickWeighted } from '@/lib/map-grid/fuzzy-obstacle'
import type { BiomeId } from '@/lib/map-grid/terrain-colors'
import { applyBiomeDecorationMix, type DecorationRule } from '@/lib/rmg/biome-decoration-mix'

export const H3_DECORATION_RULES: DecorationRule[] = [
  { into: 'Grass', from: 'Dirt', chance: 0.2 },
  { into: 'Dirt', from: 'Grass', chance: 0.2 },
  { into: 'Autumn', from: 'Grass', chance: 0.2 },
  { into: 'Autumn', from: 'Dirt', chance: 0.2 },
  { into: 'Deathland', from: 'Grass', chance: 0.15 },
  { into: 'Deathland', from: 'Dirt', chance: 0.15 },
]

export interface H3DecorationPicker {
  /** The catalog biome of a table-resolved tree or mountain sid; null for anything else (left to the plain sibling pick). */
  biomeOf(baseSid: string, role: 'tree' | 'mountain'): BiomeId | null
  /** A tree of `biome`, not `not` (so neighbours differ) while there is a choice. */
  pickTree(biome: BiomeId, rng: () => number, not?: string): string
  /** Square mountain sizes available in `biome`, biggest first (3, 2, 1). */
  mountainSizes(biome: BiomeId): number[]
  pickMountain(biome: BiomeId, size: number, rng: () => number): string
}

const BIOME_ID_BY_CATALOG_NAME = new Map<string, BiomeId>(
  (Object.entries(BIOME_ID_TO_CATALOG_BIOME) as [string, string][]).map(([id, name]) => [name, Number(id) as BiomeId]),
)

/** Edge of the square a mountain stands on, when it is a fully solid square this importer can lay over H3 cells: 1x1 and 2x2 anchor on their
 *  corner cell (pivot 0,0), 3x3 on its centre (pivot 1,1). Any other shape is left out. */
function squareSize(obj: CatalogMapObject): number | null {
  const sx = obj.sizeX ?? 1
  const sz = obj.sizeZ ?? 1
  if (sx !== sz || sx > 3 || !(obj.nodes ?? [1]).every((n) => n === 1)) return null
  const pivot = sx === 3 ? 1 : 0
  return (obj.pivotX ?? 0) === pivot && (obj.pivotZ ?? 0) === pivot ? sx : null
}

export function createH3DecorationPicker(catalog: GameCatalog): H3DecorationPicker {
  const byId = new Map(catalog.mapObjects.map((o) => [o.id, o]))
  // No RMG pick weights: they leave some real variants out (never picked), and variety is the point here.
  const mixed = applyBiomeDecorationMix(buildFuzzyObstaclePools(catalog.mapObjects), undefined, H3_DECORATION_RULES)

  const trees = new Map<BiomeId, string[]>()
  const mountains = new Map<BiomeId, Map<number, string[]>>()
  for (const [key, pool] of Object.entries(mixed.pools)) {
    const biome = Number(key) as BiomeId
    trees.set(biome, pool.obstacles.filter((sid) => isTreeDecoration(sid) && squareSize(byId.get(sid) as CatalogMapObject) === 1))
    const bySize = new Map<number, string[]>()
    for (const sid of pool.mountains) {
      const size = squareSize(byId.get(sid) as CatalogMapObject)
      if (size !== null) bySize.set(size, [...(bySize.get(size) ?? []), sid])
    }
    mountains.set(biome, bySize)
  }

  return {
    biomeOf(baseSid, role) {
      const obj = byId.get(baseSid)
      const biome = obj?.biome ? BIOME_ID_BY_CATALOG_NAME.get(obj.biome) : undefined
      if (biome === undefined) return null
      if (role === 'tree') return isTreeDecoration(baseSid) && (trees.get(biome)?.length ?? 0) > 0 ? biome : null
      return baseSid.startsWith('mountain_') && (mountains.get(biome)?.get(1)?.length ?? 0) > 0 ? biome : null
    },
    pickTree(biome, rng, not) {
      const list = trees.get(biome) as string[]
      for (let attempt = 0; attempt < 3; attempt++) {
        const sid = pickWeighted(list, rng, mixed.weights?.[biome])
        if (sid !== not || list.length < 2) return sid
      }
      return list.find((sid) => sid !== not) ?? list[0]
    },
    mountainSizes(biome) {
      return [...(mountains.get(biome)?.keys() ?? [])].sort((a, b) => b - a)
    },
    pickMountain(biome, size, rng) {
      return pickWeighted(mountains.get(biome)?.get(size) as string[], rng, mixed.weights?.[biome])
    },
  }
}
