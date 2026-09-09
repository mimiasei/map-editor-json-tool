// ─── RMG object variety — concrete alternatives to random placeholders ─────
// (issue #210, follow-up to Milestones 1-4)
// User-reported: every treasure/guard the generator placed was a
// random-item/random-squad placeholder that only resolves to something
// real at runtime — real shipped maps mix these with concrete, specific
// objects (a real named artifact, a real resource pile, a real
// pre-composed army). This module supplies the real alternatives, drawn
// from the loaded GameCatalog, not invented.

import type { CatalogSquadTemplate, GameCatalog } from '@/lib/catalog/types'
import { TIER_MEDIAN_SQUAD_VALUE } from '@/lib/h3-import/neutral-strength'

/** Real, concrete resource-pile sids (Core/DB/map/objects/4_interactables.json)
 *  — confirmed real across every shipped sample map with zero extra
 *  objectsProperties config needed: every real instance surveyed has
 *  `propRewardParams.parameters: []` (the actual amount is baked into the
 *  object's own game logic, not map data), matching `addObjectInstances`'s
 *  own existing backfill default for these sids. */
export const STORAGE_SIDS = ['storage_gold', 'storage_wood', 'storage_ore', 'storage_mercury', 'storage_crystals', 'storage_gemstones', 'storage_dust']

/** Real, concrete resource-PICKUP sids (Core/DB/map/objects/3_resources.json)
 *  — a genuinely distinct object family from `STORAGE_SIDS` above (tag
 *  `"Resource"`, not `"Interact"`), confirmed present alongside storage piles
 *  in every real sample map surveyed this session. Needs a `propResParams`
 *  row (`map-write.ts`'s `RESOURCE_PICKUP_TABLE_DEFAULT`) unlike `STORAGE_SIDS`,
 *  which needs no extra config at all — real surveyed `value` fields are
 *  overwhelmingly `0` (the majority pattern across all three analyzed maps,
 *  meaning "use the object's own built-in default amount"), so that's the
 *  safe default `addObjectInstances` backfills. */
export const RESOURCE_SIDS = ['resource_gold', 'resource_wood', 'resource_ore', 'resource_mercury', 'resource_crystals', 'resource_gemstones', 'resource_dust', 'chest']

/** Every real artifact pickup sid in the loaded catalog, excluding the
 *  handful of "Shadow of Death"-prefixed items confirmed (via a real
 *  sample-map survey — 4 instances across 2 maps, always with a
 *  `propEntities` link to a matching `relicN` quest object) to expect a
 *  cross-link this generator has no matching quest object to provide.
 *  Every other real instance surveyed (~70, including several other named
 *  combination-artifact pieces) needs no extra config at all — placed
 *  bare, matching `addObjectInstances`'s own defaults. */
export function collectArtifactSids(catalog: GameCatalog): string[] {
  return catalog.mapObjects
    .filter((o) => o.category === 'artifacts' && !o.id.startsWith('shadow_of_death_'))
    .map((o) => o.id)
}

/** The squad-template tier (1-7) whose real median value
 *  (neutral-strength.ts's own H3-calibrated table, already trusted
 *  elsewhere in this generator for value-model work) sits closest to
 *  `targetValue` — used so a concrete army's rough strength matches what a
 *  random-squad rolling the same requestedValue would have produced,
 *  rather than an arbitrary tier. */
function nearestTier(targetValue: number): number {
  let best = 1
  let bestDiff = Infinity
  for (const [tierStr, median] of Object.entries(TIER_MEDIAN_SQUAD_VALUE)) {
    const diff = Math.abs(median - targetValue)
    if (diff < bestDiff) {
      bestDiff = diff
      best = Number(tierStr)
    }
  }
  return best
}

/**
 * A real, pre-composed squad template (Core/DB/squads/**, ~4200 real
 * entries) matching `fraction` and the tier closest to `targetValue` —
 * `catalog.squadTemplates[].id` is confirmed to be the exact sid a real
 * `squads[]` (entityType 2) map entry references (verified against a real
 * shipped map's own squad placement). Falls back to the `'neutral'`
 * fraction once if `fraction` has no template at that tier, then gives up
 * (`null`) rather than guessing a mismatched fraction.
 */
export function pickSquadTemplate(
  catalog: GameCatalog,
  fraction: string,
  targetValue: number,
  rng: () => number,
): CatalogSquadTemplate | null {
  const tier = nearestTier(targetValue)
  for (const candidateFraction of [fraction, 'neutral']) {
    const matches = catalog.squadTemplates.filter((t) => t.fraction === candidateFraction && t.tier === tier)
    if (matches.length > 0) return matches[Math.floor(rng() * matches.length)]
  }
  return null
}

/** Real, non-mine/non-dwelling/non-storage/non-resource interactable sids
 *  (issue #210 follow-up — user-reported "RMG never places anything but
 *  dwellings/mines/storage piles") — the same real sids already curated for
 *  `interactable-subcategories.ts`'s Map Stats UI grouping (its
 *  `ADVENTURE_SITE_SIDS`/`TREASURE_AWARDS_SIDS`/`MARKETS_TRADE_SIDS`/
 *  `SPECIAL_SIDS`, hand-partitioned here into rarity tiers instead of
 *  imported directly since the tier a sid belongs to doesn't follow that
 *  file's own grouping). `chest` is excluded here: it's already covered by
 *  `RESOURCE_SIDS` above as a treasure pickup, not a building.
 *
 *  Hand-tiered into three rarity bands by cross-referencing this game's own
 *  real weighted content lists (`Core/generator/content_lists/
 *  basic_content_lists.json`), which are never parsed directly by this
 *  generator (per-template pool filenames vary, more moving parts than
 *  warranted here) but confirm a real common/uncommon/rare split: simple
 *  hero-buff/utility sites are weighted ~75-150 in the real "tier 1" lists,
 *  bigger named buildings ~50-100 in an "uncommon" list, and unique lore
 *  sites appear only in a separate, much-less-often-selected "epic" list. */
export const INTERACTABLE_COMMON_SIDS = [
  'mystical_tower', 'beer_fountain', 'camp_fire', 'crow_nest', 'crystal_trail',
  'huntsmans_camp', 'fountain', 'gardener', 'pile_of_books', 'quixs_path',
  'watchtower', 'stables', 'tear_of_truth', 'mana_well', 'mysterious_stone',
  'wind_rose', 'windmill', 'flattering_mirror', 'peasant_cart', 'wise_owl',
  'jousting_range', 'maze', 'fort', 'petrified_memorial', 'abandoned_corpse',
  'gingerbread_house', 'goblin_cache', 'pandora_box', 'monty_hall', 'village',
]

export const INTERACTABLE_UNCOMMON_SIDS = [
  'market', 'forge', 'alchemy_lab', 'university', 'circus', 'infernal_cirque',
  'arena', 'gladiator_arena', 'gladiator_spire', 'tavern', 'celestial_sphere',
  'chimerologist', 'knowledge_garden', 'learning_stone', 'legions_memorial',
  'lost_library', 'magic_wheel', 'college_of_wonder', 'research_laboratory',
  'orb_observatory', 'unstable_ruins', 'raiders_camp', 'point_of_balance',
  'trial_scales', 'stinging_sword', 'armory_automaton', 'circle_of_life',
  'boreal_call', 'the_gorge', 'unforgotten_grave', 'cursed_old_house',
  'overgrown_grave', 'mereas_shrine',
]

export const INTERACTABLE_RARE_SIDS = [
  'tree_of_abundance', 'eternal_dragon', 'prison', 'insaras_eye', 'mirage',
  'remote_foothold', 'abandoned_outpost', 'dragon_utopia', 'black_tower',
  'prismatic_lair', 'iridescent_abbey', 'tree_of_knowledge', 'troglodyte_throne',
  'shady_den', 'twilight_bloom', 'uncanny_rite', 'underground_lair',
  'abandoned_mansion', 'abnormal_structure', 'alvars_eye', 'ritual_pyre',
  'heros_crypt',
]

/** Weighted tier pick (common:uncommon:rare ≈ 6:3:1, matching the real
 *  weight ratio noted above) then a random sid within that tier not
 *  already at its `contentCountLimits` cap — falling back through the
 *  other tiers (starting with the more common ones) if the rolled tier is
 *  fully capped or empty, so a capped tier never silently skips this
 *  placement outright. Returns `null` only if every tier is fully capped. */
export function pickInteractableSid(rng: () => number, isAtCap: (sid: string) => boolean): string | null {
  const tiers = [INTERACTABLE_COMMON_SIDS, INTERACTABLE_UNCOMMON_SIDS, INTERACTABLE_RARE_SIDS]
  const weights = [6, 3, 1]
  let roll = rng() * weights.reduce((sum, w) => sum + w, 0)
  let chosen = weights.length - 1
  for (let i = 0; i < weights.length; i++) {
    if (roll < weights[i]) { chosen = i; break }
    roll -= weights[i]
  }
  for (const i of [chosen, 0, 1, 2]) {
    const available = tiers[i].filter((sid) => !isAtCap(sid))
    if (available.length > 0) return available[Math.floor(rng() * available.length)]
  }
  return null
}
