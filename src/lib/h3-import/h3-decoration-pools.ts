// ─── Varied trees and mountains for the H3 import ────────────────────────────
// The mapping table (h3-object-mapping.json `sceneryRoleSids`) decides the role and the biome of every tree and mountain; it names one
// sid per biome (`pinetree_1`, `mountain_dirt_small_1`). This picker widens each of those to the biome's whole set of trees or mountains,
// with a little borrowing from related biomes, so a forest or a range is no longer one repeated model. The biome is the catalog biome of
// the table's own sid, so the table stays in charge (Sand's trees stay `grass_desert_1`: not a tree, so not varied here).
//
// Mixing (the RMG's own rule engine, `applyBiomeDecorationMix`, with its own list): Grass and Dirt mix both ways; Autumn and Deathland also
// borrow Grass and Dirt decorations; nothing flows back, and Snow, Lava and Sand keep their own.

import type { CatalogMapObject, GameCatalog } from '@/lib/catalog/types'
import { BIOME_ID_TO_CATALOG_BIOME, buildFuzzyObstaclePools, buildWalkablePools, isTreeDecoration, pickWeighted } from '@/lib/map-grid/fuzzy-obstacle'
import type { BiomeId } from '@/lib/map-grid/terrain-colors'
import { applyBiomeDecorationMix, type DecorationRule } from '@/lib/rmg/biome-decoration-mix'

export const H3_DECORATION_RULES: DecorationRule[] = [
  { into: 'Grass', from: 'Dirt', chance: 0.2 },
  { into: 'Dirt', from: 'Grass', chance: 0.2 },
  { into: 'Autumn', from: 'Grass', chance: 0.2 },
  { into: 'Autumn', from: 'Dirt', chance: 0.2 },
  { into: 'Deathland', from: 'Grass', chance: 0.15 },
  { into: 'Deathland', from: 'Dirt', chance: 0.15 },
  // Mountains mix more than the rest, so a range is not one repeated model: Deathland's are used on Grass, Dirt and Autumn too.
  { into: 'Grass', from: 'Dirt', type: 'mountain', chance: 0.3 },
  { into: 'Dirt', from: 'Grass', type: 'mountain', chance: 0.3 },
  { into: 'Autumn', from: 'Grass', type: 'mountain', chance: 0.25 },
  { into: 'Autumn', from: 'Dirt', type: 'mountain', chance: 0.25 },
  { into: 'Grass', from: 'Deathland', type: 'mountain', chance: 0.25 },
  { into: 'Dirt', from: 'Deathland', type: 'mountain', chance: 0.25 },
  { into: 'Autumn', from: 'Deathland', type: 'mountain', chance: 0.2 },
]

/** Share of the trees on Lava ground that stay OE lava trees. */
const LAVA_TREE_CHANCE = 0.06

export interface H3DecorationPicker {
  /** The catalog biome of a table-resolved tree or mountain sid; null for anything else (left to the plain sibling pick). */
  biomeOf(baseSid: string, role: 'tree' | 'mountain'): BiomeId | null
  /** A tree of `biome`, not `not` (so neighbours differ) while there is a choice. */
  pickTree(biome: BiomeId, rng: () => number, not?: string): string
  /** Square mountain sizes available in `biome`, biggest first (3, 2, 1). */
  mountainSizes(biome: BiomeId): number[]
  /** A mountain-like model of `size` in `biome`, not one of `avoid` (the last ones picked) while there is a choice. */
  pickMountain(biome: BiomeId, size: number, rng: () => number, avoid?: string[]): string
  /** The catalog biome of a table-resolved decoration sid, when that biome has walkable ground cover to pick from; else null. */
  walkableBiomeOf(baseSid: string): BiomeId | null
  /** Walkable ground cover (grass tufts, flowers, mushrooms) for `biome`, with the same biome mixing as the rest. */
  pickWalkable(biome: BiomeId, rng: () => number): string
  /** The catalog biome of any decoration sid, or null. */
  biomeIdOf(sid: string): BiomeId | null
  hasTrees(biome: BiomeId): boolean
  /** Square sizes of the water mountains (`mountain_water_*`), biggest first (2, 1). */
  waterMountainSizes(): number[]
  /** A water mountain of `size`, not one of `avoid` while there is a choice. */
  pickWaterMountain(size: number, rng: () => number, avoid?: string[]): string
  /** A small bush-like plant for `biome` (OE has no bush model: stumps, logs, thorns, pumpkins, strange plants), or null when it has none. */
  pickBush(biome: BiomeId, rng: () => number): string | null
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

  const walkMixed = applyBiomeDecorationMix(buildWalkablePools(catalog), undefined, H3_DECORATION_RULES)
  const walkables = new Map<BiomeId, string[]>(Object.entries(walkMixed.pools).map(([key, pool]) => [Number(key) as BiomeId, pool.obstacles]))

  const trees = new Map<BiomeId, string[]>()
  const bushes = new Map<BiomeId, string[]>()
  interface Piece { sid: string; weight: number }
  const mountains = new Map<BiomeId, Map<number, Piece[]>>()
  for (const [key, pool] of Object.entries(mixed.pools)) {
    const biome = Number(key) as BiomeId
    trees.set(biome, pool.obstacles.filter((sid) => isTreeDecoration(sid) && squareSize(byId.get(sid) as CatalogMapObject) === 1))
    bushes.set(biome, pool.obstacles.filter((sid) => !isTreeDecoration(sid) && /stump|log_|thorn|pumpkin|strange|tropical|plants/.test(sid) && squareSize(byId.get(sid) as CatalogMapObject) === 1))
    const bySize = new Map<number, Piece[]>()
    const add = (sid: string, weight: number) => {
      const size = squareSize(byId.get(sid) as CatalogMapObject)
      if (size !== null) bySize.set(size, [...(bySize.get(size) ?? []), { sid, weight }])
    }
    // The mountains of the biome and of the biomes it borrows from (their weight is the rule's share). The catalog lists "mountain_water"
    // models under Grass; they rise out of water, so they are left out of a land range.
    for (const sid of pool.mountains) if (!sid.startsWith('mountain_water')) add(sid, mixed.weights?.[biome]?.[sid] ?? 1)
    mountains.set(biome, bySize)
  }

  const lavaBiome = BIOME_ID_BY_CATALOG_NAME.get('Lava')
  const deadTrees = catalog.mapObjects.filter((o) => /^tree_dead_\d+$/.test(o.id) && squareSize(o) === 1).map((o) => o.id)

  // The water mountains rise out of water, so they have a pool of their own and are never part of a land range.
  const waterMountains = new Map<number, string[]>()
  for (const obj of catalog.mapObjects) {
    if (!obj.id.startsWith('mountain_water')) continue
    const size = squareSize(obj)
    if (size !== null) waterMountains.set(size, [...(waterMountains.get(size) ?? []), obj.id])
  }

  return {
    waterMountainSizes() {
      return [...waterMountains.keys()].sort((a, b) => b - a)
    },
    pickWaterMountain(size, rng, avoid = []) {
      const list = waterMountains.get(size) as string[]
      const free = list.filter((sid) => !avoid.includes(sid))
      const from = free.length > 0 ? free : list
      return from[Math.floor(rng() * from.length)]
    },
    biomeOf(baseSid, role) {
      const obj = byId.get(baseSid)
      const biome = obj?.biome ? BIOME_ID_BY_CATALOG_NAME.get(obj.biome) : undefined
      if (biome === undefined) return null
      if (role === 'tree') return isTreeDecoration(baseSid) && (trees.get(biome)?.length ?? 0) > 0 ? biome : null
      return baseSid.startsWith('mountain_') && (mountains.get(biome)?.get(1)?.length ?? 0) > 0 ? biome : null
    },
    biomeIdOf(sid) {
      const biome = byId.get(sid)?.biome
      return biome ? (BIOME_ID_BY_CATALOG_NAME.get(biome) ?? null) : null
    },
    hasTrees(biome) {
      return (trees.get(biome)?.length ?? 0) > 0
    },
    pickBush(biome, rng) {
      const list = bushes.get(biome) ?? []
      return list.length > 0 ? list[Math.floor(rng() * list.length)] : null
    },
    walkableBiomeOf(baseSid) {
      const obj = byId.get(baseSid)
      const biome = obj?.biome ? BIOME_ID_BY_CATALOG_NAME.get(obj.biome) : undefined
      return biome !== undefined && (walkables.get(biome)?.length ?? 0) > 0 ? biome : null
    },
    pickWalkable(biome, rng) {
      return pickWeighted(walkables.get(biome) as string[], rng, walkMixed.weights?.[biome])
    },
    pickTree(biome, rng, not) {
      // OE's lava trees are disliked: H3 lava trees become Deathland dead trees (not the withered pines or mushrooms), with a few lava trees mixed in.
      if (biome === lavaBiome && deadTrees.length > 0 && rng() >= LAVA_TREE_CHANCE) {
        const fresh = deadTrees.filter((sid) => sid !== not)
        return fresh[Math.floor(rng() * fresh.length)] ?? deadTrees[0]
      }
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
    pickMountain(biome, size, rng, avoid = []) {
      const list = mountains.get(biome)?.get(size) as Piece[]
      let pick = list[0].sid
      for (let attempt = 0; attempt < 8; attempt++) {
        const total = list.reduce((sum, p) => sum + p.weight, 0)
        let roll = rng() * total
        pick = list[list.length - 1].sid
        for (const p of list) { if (roll < p.weight) { pick = p.sid; break } roll -= p.weight }
        if (!avoid.includes(pick)) break
      }
      return pick
    },
  }
}
