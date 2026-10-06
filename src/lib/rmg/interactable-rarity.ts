// ─── RMG interactable rarity ─────────────────────────────────────────────────
// How likely an interactable is to be scattered on a map comes from the game's
// own content lists (Core/generator/content_lists/*.json): every entry there
// has a `weight`. A sid the game never rolls (weight 0 everywhere, e.g.
// `mirage`, `insaras_eye`, `flattering_mirror`) or that this generator files
// as rare (INTERACTABLE_RARE_SIDS) is not scattered at all. Every other sid is
// picked with its list weight inside its tier; a sid the lists don't mention
// gets DEFAULT_INTERACTABLE_WEIGHT. The tuning file can override any sid
// (`interactables.weightBySid`: 0 never, above 0 a weight — this also
// re-enables a rare sid).

import type { GameCatalog } from '@/lib/catalog/types'
import { INTERACTABLE_RARE_SIDS } from './object-variety'

/** Weight of a sid the content lists don't mention (typical list weights run 12-175). */
export const DEFAULT_INTERACTABLE_WEIGHT = 50

export interface InteractableRarity {
  /** True when the scatter must never pick this sid. */
  isBlocked(sid: string): boolean
  /** Relative pick weight inside a tier; 0 = never. */
  weight(sid: string): number
}

interface ListStats { weights: Map<string, number>; zeroOnly: Set<string> }

const statsCache = new WeakMap<object, ListStats>()

/** Per sid: mean of its positive weights over the lists that give it one
 *  (entries tied to a biome are left out), and the sids listed only with
 *  weight 0. */
function listStats(lists: NonNullable<GameCatalog['rmgContentLists']>): ListStats {
  const cached = statsCache.get(lists)
  if (cached) return cached
  const sums = new Map<string, { total: number; n: number }>()
  const listed = new Set<string>()
  for (const list of lists) {
    for (const entry of list.content) {
      if (entry.biome) continue
      listed.add(entry.sid)
      if (!(entry.weight > 0)) continue
      const s = sums.get(entry.sid) ?? { total: 0, n: 0 }
      s.total += entry.weight
      s.n += 1
      sums.set(entry.sid, s)
    }
  }
  const weights = new Map([...sums].map(([sid, s]) => [sid, s.total / s.n]))
  const zeroOnly = new Set([...listed].filter((sid) => !weights.has(sid)))
  const stats = { weights, zeroOnly }
  statsCache.set(lists, stats)
  return stats
}

const RARE_TIER = new Set<string>(INTERACTABLE_RARE_SIDS)

export function buildInteractableRarity(catalog: GameCatalog | undefined, weightBySid: Record<string, number> = {}): InteractableRarity {
  const stats = catalog?.rmgContentLists && catalog.rmgContentLists.length > 0 ? listStats(catalog.rmgContentLists) : undefined
  const weight = (sid: string): number => {
    const override = weightBySid[sid]
    if (override !== undefined) return override
    if (RARE_TIER.has(sid) || stats?.zeroOnly.has(sid)) return 0
    return stats?.weights.get(sid) ?? DEFAULT_INTERACTABLE_WEIGHT
  }
  return { weight, isBlocked: (sid) => !(weight(sid) > 0) }
}
