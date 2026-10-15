// ─── RMG biome decoration mix ─────────────────────────────────────────────────
// Which decorations a biome may borrow from other biomes, and how often, plus
// which of its own decorations it must not use. Edit BIOME_DECORATION_RULES
// below; `scripts/list-decoration-pools.ts` prints every biome's objects with
// the type / variant / number the rules match on.
//
// How a borrow rule works: for each decoration list of the `into` biome
// (obstacles, clutter, mountains, pools) the objects of the `from` biome that
// match the rule are added to it, weighted so that they make up `chance` of the
// picks of the rule's `type` from that list ('tree' = 6 % of the tree picks, not
// of every obstacle pick; a rule without a type is measured against the whole
// list). Rules naming the same type add up (capped at MAX_BORROWED_SHARE).
// Because the borrowed objects sit in the biome's ordinary lists, single
// decorations, cluster members and the other steps that use these lists
// borrow alike.

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
  { into: 'Grass', from: 'Autumn', chance: 0.1 },
  { into: 'Grass', from: 'Dirt', chance: 0.2 },
  { into: 'Autumn', from: 'Grass', chance: 0.2 },
  { into: 'Autumn', from: 'Dirt', chance: 0.2 },
  { into: 'Dirt', from: 'Grass', chance: 0.2 },
  { into: 'Dirt', from: 'Autumn', chance: 0.1 },
  // Lava also gets some Deathland scenery: mountains, mushroom trees and withered pines.
  // (The two tree rules add up: 20 % of Lava's tree picks.)
  { into: 'Lava', from: 'Deathland', type: 'mountain', chance: 0.15 },
  { into: 'Lava', from: 'Deathland', type: 'tree', variant: 'mushroom', chance: 0.1 },
  { into: 'Lava', from: 'Deathland', type: 'tree', variant: 'pine_withered', chance: 0.1 },
  { into: 'Lava', from: 'Deathland', type: 'tree', variant: 'dead', num: { max: 4 }, chance: 0.3 },
  // { deny: 'Deathland', type: 'tree', variant: 'dead', num: { min: 7 } },
]

/** The trees around a wood mine on `biome`: these objects of `from` INSTEAD of the biome's own trees
 *  (the mix rules above are not used for them). `weight` (default 1) is how much more often an
 *  object is tried first. A biome without a rule keeps its own trees. */
export interface MineForestRule extends DecorationMatcher {
  biome: BiomeName
  from: BiomeName
  weight?: number
}

export const MINE_FOREST_RULES: MineForestRule[] = [
  // Lava's own trees do not suit a wood mine: Deathland's withered pines, and its dead trees less often.
  { biome: 'Lava', from: 'Deathland', type: 'tree', variant: 'pine_withered', weight: 3 },
  { biome: 'Lava', from: 'Deathland', type: 'tree', variant: 'dead', weight: 1 },
]

/** The tree objects (and their pick weights) for a wood mine on `biome`, or undefined when no
 *  MINE_FOREST_RULES entry covers it. `basePools` are the unmixed per-biome lists. */
export function mineForestTrees(
  biome: BiomeId, basePools: Record<BiomeId, FuzzyObstaclePool>, rules: MineForestRule[] = MINE_FOREST_RULES,
): { trees: string[]; weights: Record<string, number> } | undefined {
  const weights: Record<string, number> = {}
  for (const rule of rules) {
    if (BIOME_ID_BY_NAME[rule.biome] !== biome) continue
    for (const sid of basePools[BIOME_ID_BY_NAME[rule.from]].obstacles) {
      if (isTreeDecoration(sid) && matchesDecoration(rule, parseDecorationSid(sid), 'obstacles')) weights[sid] = (weights[sid] ?? 0) + (rule.weight ?? 1)
    }
  }
  const trees = Object.keys(weights)
  return trees.length > 0 ? { trees, weights } : undefined
}

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

interface BorrowEntry {
  sids: string[]
  from: BiomeId
  chance: number
  /** The types the rule names; undefined when it names none (measured against the whole list). */
  types: string[] | undefined
  typeKey: string
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
  const borrowed = new Map<string, { biome: BiomeId; list: ListName; entries: BorrowEntry[] }>()
  for (const rule of rules) {
    if (!isBorrowRule(rule) || rule.chance <= 0) continue
    const into = BIOME_ID_BY_NAME[rule.into]
    const from = BIOME_ID_BY_NAME[rule.from]
    if (into === from) continue
    const types = rule.type === undefined ? undefined : Array.isArray(rule.type) ? rule.type : [rule.type]
    for (const list of LIST_NAMES) {
      const own = new Set(pools[into][list])
      const sids = basePools[from][list].filter((sid) => !own.has(sid) && matchesDecoration(rule, parseDecorationSid(sid), list))
      if (sids.length === 0) continue
      const key = `${into}:${list}`
      const slot = borrowed.get(key) ?? { biome: into, list, entries: [] }
      slot.entries.push({ sids, from, chance: rule.chance, types, typeKey: types ? [...types].sort().join(',') : '*' })
      borrowed.set(key, slot)
    }
  }

  for (const { biome, list, entries } of borrowed.values()) {
    const ownSids = [...pools[biome][list]]
    const ownWeights = weights?.[biome]
    // Own objects with no real weight keep it that way (they are never picked) — unless
    // none of them has one, then the whole list was a uniform pick and stays one.
    const target = ensureWeights(biome)
    if (ownSids.reduce((sum, sid) => sum + (ownWeights?.[sid] ?? 0), 0) <= 0) {
      for (const sid of ownSids) target[sid] = 1
    }
    const ownWeightOf = (sid: string): number => target[sid] ?? 0
    const ownParsed = ownSids.map((sid) => ({ weight: ownWeightOf(sid), type: parseDecorationSid(sid).type }))
    // Rules naming the same types share one group: the group's borrowed objects make up
    // exactly the summed chance (capped) of the picks of those types in this biome's list.
    const groups = new Map<string, BorrowEntry[]>()
    for (const entry of entries) groups.set(entry.typeKey, [...(groups.get(entry.typeKey) ?? []), entry])

    // The biome's real weights can already hold entries for other biomes' objects
    // (Dirt's tilesets list grass objects); the rules decide the share, so they replace them.
    const borrowedWeights = new Map<string, number>()
    for (const group of groups.values()) {
      const types = group[0].types
      const typed = ownParsed.filter((own) => !types || types.includes(own.type)).reduce((sum, own) => sum + own.weight, 0)
      // A biome with none of that type (Sand has no pines) measures against its whole list instead.
      const base = typed > 0 ? typed : ownParsed.reduce((sum, own) => sum + own.weight, 0) || 1
      const groupChance = Math.min(MAX_BORROWED_SHARE, group.reduce((sum, entry) => sum + entry.chance, 0))
      const rawChance = group.reduce((sum, entry) => sum + entry.chance, 0)
      for (const { sids, from, chance } of group) {
        const portion = base * groupChance / (1 - groupChance) * (chance / rawChance)
        const sourceWeights = weights?.[from]
        const sourceTotal = sids.reduce((sum, sid) => sum + (sourceWeights?.[sid] ?? 0), 0)
        for (const sid of sids) {
          const share = sourceTotal > 0 ? (sourceWeights?.[sid] ?? 0) / sourceTotal : 1 / sids.length
          borrowedWeights.set(sid, (borrowedWeights.get(sid) ?? 0) + portion * share)
          if (!pools[biome][list].includes(sid)) pools[biome][list].push(sid)
        }
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

/** For each biome, the objects of other biomes that the rules (borrow rules and wood-mine forests)
 *  let it use — biome isolation (biome-isolation.ts) must not refuse those. */
export function decorationIsolationExceptions(
  basePools: Record<BiomeId, FuzzyObstaclePool>, rules: DecorationRule[] = BIOME_DECORATION_RULES, mineRules: MineForestRule[] = MINE_FOREST_RULES,
): Map<number, Set<string>> {
  const exceptions = new Map<number, Set<string>>()
  const allow = (biome: BiomeId, sid: string): void => {
    const set = exceptions.get(biome) ?? new Set<string>()
    set.add(sid)
    exceptions.set(biome, set)
  }
  for (const rule of rules) {
    if (!isBorrowRule(rule) || rule.chance <= 0) continue
    for (const list of LIST_NAMES) {
      for (const sid of basePools[BIOME_ID_BY_NAME[rule.from]][list]) {
        if (matchesDecoration(rule, parseDecorationSid(sid), list)) allow(BIOME_ID_BY_NAME[rule.into], sid)
      }
    }
  }
  for (const rule of mineRules) {
    for (const sid of basePools[BIOME_ID_BY_NAME[rule.from]].obstacles) {
      if (isTreeDecoration(sid) && matchesDecoration(rule, parseDecorationSid(sid), 'obstacles')) allow(BIOME_ID_BY_NAME[rule.biome], sid)
    }
  }
  return exceptions
}

/** `list` in random order, an object with a higher weight tending to come earlier. With no
 *  weight for any of the objects (a biome the rules never touch) it is the plain shuffle,
 *  drawing the same random numbers as before the rules existed. */
export function shuffledByWeight(list: string[], rng: () => number, weights?: Record<string, number>): string[] {
  const out = [...list]
  if (!weights || !out.some((sid) => (weights[sid] ?? 0) > 0)) {
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      ;[out[i], out[j]] = [out[j], out[i]]
    }
    return out
  }
  // Weighted random order: sort by rng^(1/weight); a zero weight goes last.
  const key = (sid: string): number => {
    const weight = weights[sid] ?? 0
    return weight > 0 ? Math.pow(rng(), 1 / weight) : -rng()
  }
  return out.map((sid) => ({ sid, key: key(sid) })).sort((a, b) => b.key - a.key).map((entry) => entry.sid)
}
