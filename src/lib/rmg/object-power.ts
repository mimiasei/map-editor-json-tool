// ─── How powerful a placed interactable is, and where it belongs on a map ────
// Evidence (Core.zip DB/objects_logic, read Nov 2026): every event bank carries per-variant `value` (+ `rollChance`) - the game's own price for the
// object, whether it is guarded (dragon_utopia ~27K) or free (lost_library 16K, unguarded). tavern/market have only `goodsValue` (2500/5000).
// Shipped maps (13 with 2+ starts): very strong objects sit a median of 30-40 tiles from the nearest start, strong ones ~28, and each start has
// 1-2 village-type objects within 15 tiles. The quality pass (quality-pass.ts) and the interactable pick weights both read this file.

import type { GameCatalog } from '@/lib/catalog/types'

export type PowerTier = 'weak' | 'medium' | 'strong' | 'veryStrong'

/** objects_logic folders whose entries are interactables worth ranking (chests, mirages, prisons, mines and cities are not). */
const POWER_SOURCES = new Set(['event_banks', 'taverns', 'markets'])

/** Village or city feel: they belong near a start, not out in the wild. Utility buildings and small free rewards, all weak or medium. */
export const SETTLEMENT_SIDS = new Set(['windmill', 'village', 'stables', 'peasant_cart', 'huntsmans_camp', 'tavern', 'market'])

const powerCache = new WeakMap<GameCatalog, Map<string, number>>()

interface LogicVariant { rollChance?: number; value?: number }

/** Roll-weighted mean `value` over an object's variants, else its `goodsValue`; undefined when the object has neither. */
export function interactablePower(catalog: GameCatalog | null, sid: string): number | undefined {
  if (!catalog?.objectLogics) return undefined
  let table = powerCache.get(catalog)
  if (!table) {
    table = new Map()
    for (const logic of catalog.objectLogics) {
      if (!POWER_SOURCES.has(logic.sourcePath) || logic.id.startsWith('campaign_')) continue
      const variants = Array.isArray(logic.raw.variants) ? (logic.raw.variants as LogicVariant[]) : []
      const priced = variants.filter((v) => typeof v.value === 'number')
      if (priced.length > 0) {
        const total = priced.reduce((s, v) => s + (v.rollChance ?? 1), 0) || 1
        table.set(logic.id, priced.reduce((s, v) => s + (v.value as number) * (v.rollChance ?? 1), 0) / total)
      } else if (typeof logic.raw.goodsValue === 'number') {
        table.set(logic.id, logic.raw.goodsValue)
      }
    }
    powerCache.set(catalog, table)
  }
  return table.get(sid)
}

/** Thresholds from the spread of the 93 ranked objects: lost_library 16K is strong, dragon_utopia/research_laboratory/unstable_ruins ~24-28K are very strong. */
export function powerTier(value: number): PowerTier {
  if (value >= 20000) return 'veryStrong'
  if (value >= 10000) return 'strong'
  if (value >= 4000) return 'medium'
  return 'weak'
}

/** Tile distances are given for a 128x128 map and grow with the map's side. */
export function sizeScale(sizeX: number, sizeZ: number): number {
  return Math.min(2, Math.max(0.6, Math.sqrt(sizeX * sizeZ) / 128))
}

/** Closest a tier may stand to any player start (128x128 tiles). Shipped maps: very strong median 30-40, strong ~28; their minimums are lower, so these are floors. */
export const TIER_MIN_START_DISTANCE: Record<PowerTier, number> = { weak: 0, medium: 7, strong: 14, veryStrong: 22 }

/** Most interactables of a tier per 10,000 tiles; weak ones are not capped. Upper range of the shipped maps (strong 7-60, very strong 1-24 per 10K, chests left out). */
export const TIER_MAX_PER_10K: Partial<Record<PowerTier, number>> = { strong: 25, veryStrong: 8 }

/** Pick-weight multiplier by tier, so powerful objects are rarer than weak ones when the scatter rolls. */
export const TIER_PICK_FACTOR: Record<PowerTier, number> = { weak: 1, medium: 0.85, strong: 0.6, veryStrong: 0.4 }

/** Village objects wanted within `SETTLEMENT_RADIUS` of each start (shipped maps: 1-2 within 15 tiles). */
export const SETTLEMENT_PER_START = 2
export const SETTLEMENT_RADIUS = 14
