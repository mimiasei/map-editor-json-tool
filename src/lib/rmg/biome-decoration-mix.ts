// ─── RMG biome decoration mix ─────────────────────────────────────────────────
// Which decorations a biome may borrow from other biomes, and how often, plus
// which of its own decorations it must not use. Edit BIOME_DECORATION_RULES
// below; `scripts/list-decoration-pools.ts` prints every biome's objects with
// the type / variant / number the rules match on.
//
// How a borrow rule works: for each decoration list of the `into` biome
// (obstacles, clutter, mountains, pools) the objects of the `from` biome that
// match the rule are added to it, weighted so that they make up `chance` of
// the picks from that list. Several rules into the same biome add up (capped
// at MAX_BORROWED_SHARE). Because the borrowed objects sit in the biome's
// ordinary lists, single decorations and cluster members borrow alike.

import type { BiomeId } from '@/lib/map-grid/terrain-colors'
import { BIOME_NAMES } from '@/lib/map-grid/terrain-colors'
import { matchesDecoration, parseDecorationSid, type DecorationMatcher } from '@/lib/map-grid/decoration-sid'
import { isTreeDecoration, type FuzzyObstaclePool } from '@/lib/map-grid/fuzzy-obstacle'

export type BiomeName = 'Grass' | 'Sand' | 'Deathland' | 'Snow' | 'Autumn' | 'Lava' | 'Dirt'

/** `into` may use the matching objects of `from`, making up `chance` (0-1) of its picks. */
export interface BorrowRule extends DecorationMatcher {
  into: BiomeName
  from: BiomeName
  chance: number
}

/** `biome` never uses its own matching objects. */
export interface DenyRule extends DecorationMatcher {
  deny: BiomeName
}

export type DecorationRule = BorrowRule | DenyRule

/** Grass, Autumn and Dirt borrow each other's decorations (5 % each way) — the
 *  mixing the generator always did between these three. Sand, Snow, Lava and
 *  Deathland use only their own unless a rule below says otherwise. */
export const BIOME_DECORATION_RULES: DecorationRule[] = [
  { into: 'Grass', from: 'Autumn', chance: 0.05 },
  { into: 'Grass', from: 'Dirt', chance: 0.05 },
  { into: 'Autumn', from: 'Grass', chance: 0.05 },
  { into: 'Autumn', from: 'Dirt', chance: 0.05 },
  { into: 'Dirt', from: 'Grass', chance: 0.05 },
  { into: 'Dirt', from: 'Autumn', chance: 0.05 },
  // Examples:
  // { into: 'Lava', from: 'Deathland', type: 'tree', variant: 'dead', num: { max: 4 }, chance: 0.06 },
  // { deny: 'Deathland', type: 'tree', variant: 'dead', num: { min: 7 } },
]

/** However many rules feed one list, borrowed objects never exceed this share of it. */
const MAX_BORROWED_SHARE = 0.9

const BIOME_ID_BY_NAME = Object.fromEntries(
  (Object.entries(BIOME_NAMES) as [string, string][]).map(([id, name]) => [name, Number(id) as BiomeId]),
) as Record<BiomeName, BiomeId>

type ListName = 'obstacles' | 'clutter' | 'mountains' | 'pools'
const LIST_NAMES: ListName[] = ['obstacles', 'clutter', 'mountains', 'pools']

export type SidWeights = Partial<Record<BiomeId, Record<string, number>>>

export interface MixedDecorationPools {
  pools: Record<BiomeId, FuzzyObstaclePool>
  /** The tree_/pinetree_ objects of each biome's mixed `obstacles` (the forest-cluster pool). */
  treePools: Record<BiomeId, FuzzyObstaclePool>
  weights: SidWeights | undefined
}

function isBorrowRule(rule: DecorationRule): rule is BorrowRule {
  return 'into' in rule
}

function copyPools(pools: Record<BiomeId, FuzzyObstaclePool>): Record<BiomeId, FuzzyObstaclePool> {
  const result = {} as Record<BiomeId, FuzzyObstaclePool>
  for (const [id, pool] of Object.entries(pools)) {
    result[Number(id) as BiomeId] = { obstacles: [...pool.obstacles], clutter: [...pool.clutter], mountains: [...pool.mountains], pools: [...pool.pools] }
  }
  return result
}

/** Applies `rules` to the per-biome decoration lists. `weights` is the optional
 *  real per-sid pick weighting (buildFuzzyObstacleWeights): borrowed objects get
 *  weights relative to it, so a biome's own favourites stay its favourites. */
export function applyBiomeDecorationMix(
  basePools: Record<BiomeId, FuzzyObstaclePool>, baseWeights: SidWeights | undefined,
  rules: DecorationRule[] = BIOME_DECORATION_RULES,
): MixedDecorationPools {
  const pools = copyPools(basePools)
  let weights = baseWeights
  const ensureWeights = (biome: BiomeId): Record<string, number> => {
    weights = { ...weights }
    weights[biome] = { ...weights[biome] }
    return weights[biome]
  }

  // Deny rules first: they only ever shrink a biome's own lists.
  for (const rule of rules) {
    if (isBorrowRule(rule)) continue
    const biome = BIOME_ID_BY_NAME[rule.deny]
    for (const list of LIST_NAMES) {
      pools[biome][list] = pools[biome][list].filter((sid) => !matchesDecoration(rule, parseDecorationSid(sid), list))
    }
  }

  // Borrowed objects per target biome and list, with the chance each rule gives them.
  const borrowed = new Map<string, { biome: BiomeId; list: ListName; entries: { sids: string[]; from: BiomeId; chance: number }[] }>()
  for (const rule of rules) {
    if (!isBorrowRule(rule) || rule.chance <= 0) continue
    const into = BIOME_ID_BY_NAME[rule.into]
    const from = BIOME_ID_BY_NAME[rule.from]
    if (into === from) continue
    for (const list of LIST_NAMES) {
      const own = new Set(pools[into][list])
      const sids = basePools[from][list].filter((sid) => !own.has(sid) && matchesDecoration(rule, parseDecorationSid(sid), list))
      if (sids.length === 0) continue
      const key = `${into}:${list}`
      const slot = borrowed.get(key) ?? { biome: into, list, entries: [] }
      slot.entries.push({ sids, from, chance: rule.chance })
      borrowed.set(key, slot)
    }
  }

  for (const { biome, list, entries } of borrowed.values()) {
    const ownSids = pools[biome][list]
    const ownWeights = weights?.[biome]
    // Own objects with no real weight keep it that way (they are never picked) — unless
    // none of them has one, then the whole list was a uniform pick and stays one.
    const ownTotal = ownSids.reduce((sum, sid) => sum + (ownWeights?.[sid] ?? 0), 0)
    const target = ensureWeights(biome)
    let ownWeightTotal = ownTotal
    if (ownTotal <= 0) {
      for (const sid of ownSids) target[sid] = 1
      ownWeightTotal = ownSids.length
    }
    if (ownWeightTotal <= 0) ownWeightTotal = 1 // an empty own list: borrowed objects are all there is
    const totalChance = Math.min(MAX_BORROWED_SHARE, entries.reduce((sum, entry) => sum + entry.chance, 0))
    const borrowedWeightTotal = ownWeightTotal * totalChance / (1 - totalChance)
    const rawTotal = entries.reduce((sum, entry) => sum + entry.chance, 0)
    // The biome's real weights can already hold entries for other biomes' objects
    // (Dirt's tilesets list grass objects); the rules decide the share, so they replace them.
    const borrowedWeights = new Map<string, number>()
    for (const { sids, from, chance } of entries) {
      const portion = borrowedWeightTotal * (chance / rawTotal)
      const sourceWeights = weights?.[from]
      const sourceTotal = sids.reduce((sum, sid) => sum + (sourceWeights?.[sid] ?? 0), 0)
      for (const sid of sids) {
        const share = sourceTotal > 0 ? (sourceWeights?.[sid] ?? 0) / sourceTotal : 1 / sids.length
        borrowedWeights.set(sid, (borrowedWeights.get(sid) ?? 0) + portion * share)
        if (!pools[biome][list].includes(sid)) pools[biome][list].push(sid)
      }
    }
    for (const [sid, weight] of borrowedWeights) target[sid] = weight
  }

  const treePools = {} as Record<BiomeId, FuzzyObstaclePool>
  for (const [id, pool] of Object.entries(pools)) {
    treePools[Number(id) as BiomeId] = { obstacles: pool.obstacles.filter(isTreeDecoration), clutter: [], mountains: [], pools: [] }
  }
  return { pools, treePools, weights }
}
