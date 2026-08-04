// ─── Faction naming and ordering ──────────────────────────────────────────────
// Entity records carry an internal faction id ("human", "undead"); the game shows
// a different name for each ("Temple", "Necropolis"). The catalog already resolves
// those from Core.zip — DB/fractions maps human → human_name → "Temple" — so prefer
// catalog data and keep the hardcoded table only as a fallback for when Core.zip is
// not loaded, and for the alias spellings the DB does not carry.

import type { CatalogFaction } from '@/lib/catalog/types'

/** Fallback display names, verified against Core.zip's English localization. */
const FACTION_DISPLAY: Record<string, string> = {
  human:    'Temple',
  humans:   'Temple',
  nature:   'Grove',
  undead:   'Necropolis',
  necros:   'Necropolis',
  demons:   'Hive',
  demon:    'Hive',
  dungeon:  'Dungeon',
  unfrozen: 'Schism',
  neutral:  'Neutral',
}

/**
 * Display order, taken from the DB filenames (1_human … 6_unfrozen) so groups
 * appear in the game's own order rather than alphabetically. Neutral sits after the
 * six playable factions; anything unrecognised sorts last.
 */
export const FACTION_ORDER: string[] = [
  'Temple',
  'Necropolis',
  'Dungeon',
  'Grove',
  'Hive',
  'Schism',
  'Neutral',
]

/**
 * Resolve an internal faction id to its display name. Pass the catalog's factions
 * when available so a future rename in the game data is picked up automatically.
 */
export function factionDisplayName(raw: string, catalogFactions?: CatalogFaction[]): string {
  const key = (raw ?? '').toLowerCase()
  if (!key) return ''

  const fromCatalog = catalogFactions?.find((f) => f.id.toLowerCase() === key)?.name
  if (fromCatalog) return fromCatalog

  return FACTION_DISPLAY[key] ?? raw
}

/** Sort index for a display name — unknown factions go last, then alphabetically. */
export function factionSortIndex(displayName: string): number {
  const i = FACTION_ORDER.indexOf(displayName)
  return i === -1 ? FACTION_ORDER.length : i
}

/**
 * Group items by faction display name, returned in FACTION_ORDER. Empty groups are
 * omitted, so a filtered list only shows the factions it still has entries for.
 */
export function groupByFaction<T>(
  items: T[],
  factionOf: (item: T) => string,
): Array<{ faction: string; items: T[] }> {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const faction = factionOf(item) || 'Unknown'
    const bucket = groups.get(faction)
    if (bucket) bucket.push(item)
    else groups.set(faction, [item])
  }

  return [...groups.entries()]
    .map(([faction, groupItems]) => ({ faction, items: groupItems }))
    .sort((a, b) => {
      const d = factionSortIndex(a.faction) - factionSortIndex(b.faction)
      return d !== 0 ? d : a.faction.localeCompare(b.faction)
    })
}
