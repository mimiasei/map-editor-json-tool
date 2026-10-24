// ─── Map Grid — Decorations sub-categories ──────────────────────────────────
// Mirrors interactable-subcategories.ts's pattern for the "Decorations" grid
// group (environments/animals/fxs catalog categories — see tile-index.ts's
// own CATEGORY_TO_GROUP). Animals/fxs have no useful sid-naming convention of
// their own (confirmed: fish/camel/chicken_1 share nothing, fx sids only
// share a `fx_` prefix but checking the real catalog category is simpler and
// already available at every call site), so they're classified by category
// directly; environments falls back to the existing sid-naming convention.
// Shared by map-stats.ts (the stats panel) and MapGridDialog.tsx (the grid's
// own sub-category toggle) so both agree on exactly the same breakdown.

import type { GameCatalog } from '@/lib/catalog/types'
import { computeFootprintTiles } from '@/lib/map-grid/footprint'

export type DecorationSubcategory =
  | 'animals'
  | 'fx'
  | 'mountains'
  | 'trees'
  | 'rocks'
  | 'pools'
  | 'hills'
  | 'walkable'
  | 'campaignRelated'
  | 'other'

export const DECORATION_SUBCATEGORY_ORDER: DecorationSubcategory[] = [
  'animals',
  'fx',
  'mountains',
  'trees',
  'rocks',
  'pools',
  'hills',
  'walkable',
  'campaignRelated',
  'other',
]

export const DECORATION_SUBCATEGORY_LABELS: Record<DecorationSubcategory, string> = {
  animals: 'Animals',
  fx: 'FX',
  mountains: 'Mountains',
  trees: 'Trees',
  rocks: 'Rocks',
  pools: 'Pools',
  hills: 'Hills',
  walkable: 'Walkable',
  campaignRelated: 'Campaign related',
  other: 'Other decorations',
}

const WALKABLE_BIOMES = ['death', 'snow', 'desert', 'autumn', 'dirt']
const WALKABLE_PREFIXES = [
  'flowers_', 'mushrooms_', 'grass_1', 'grass_2', 'walkable',
  ...WALKABLE_BIOMES.map((b) => 'grass_' + b + '_1'),
  ...WALKABLE_BIOMES.map((b) => 'grass_' + b + '_2'),
]
const TREE_PREFIXES = ['tree_', 'pinetree', 'palm', 'cactus']
const ROCK_MARKERS = ['rock_', 'stone_', '_stones_']

/** Classifies a `decorations`-group placement by real catalog category first
 *  (animals/fxs), then by the `environments` sid-naming convention — order
 *  matters, first match wins. `category` is the placement's real
 *  `CatalogMapObject.category` (undefined for an unresolved sid). */
export function resolveDecorationSubcategory(sid: string, category: string | undefined): DecorationSubcategory {
  if (category === 'animals') return 'animals'
  if (category === 'fxs') return 'fx'
  if (sid.startsWith('mountain_')) return 'mountains'
  if (TREE_PREFIXES.some((t) => sid.startsWith(t))) return 'trees'
  if (ROCK_MARKERS.some((r) => sid.includes(r))) return 'rocks'
  if (sid.startsWith('pool_')) return 'pools'
  if (sid.startsWith('campaign_')) return 'campaignRelated'
  if (WALKABLE_PREFIXES.some((w) => sid.includes(w))) return 'walkable'
  if (sid.includes('_hill_')) return 'hills'
  return 'other'
}

const groundCoverCache = new WeakMap<GameCatalog, Map<string, boolean>>()

/** Walkable ground clutter (grass, flowers, mushrooms): a 'walkable' decoration with no solid
 *  footprint cell. It always sits at the bottom of a tile's stack and may be painted on tiles
 *  other objects block. The solid-cell check keeps out sids the naming convention calls walkable
 *  but that really block (grass_log_1, grass_stump_1, grass_tropical_1/2 and grass_hill_1/2 have
 *  a solid cell in Core.zip's 1_environments.json). */
export function isGroundCoverSid(sid: string, catalog: GameCatalog | null): boolean {
  if (!catalog) return false
  let cache = groundCoverCache.get(catalog)
  if (!cache) {
    cache = new Map()
    groundCoverCache.set(catalog, cache)
  }
  const known = cache.get(sid)
  if (known !== undefined) return known
  const template = catalog.mapObjects.find((o) => o.id === sid)
  const result = !!template
    && template.category === 'environments'
    && resolveDecorationSubcategory(sid, template.category) === 'walkable'
    && !computeFootprintTiles(template, 0, 0).some((cell) => cell.value === 1)
  cache.set(sid, result)
  return result
}
