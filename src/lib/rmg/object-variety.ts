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

/** Real weighted random-hire tier table (Core/generator/content_lists/
 *  generator_content_lists.json's `content_list_building_random_hires` — one
 *  of issue #240 Phase 0's collected generic content lists, weights 250/
 *  250/225/225/200/200/150 for tiers 1-7, favoring cheaper tiers but not
 *  flat) combined with `generator_config.json`'s real `random_hire_1..7`
 *  value/guardValue curve (also Phase 0) — replaces the flat, always-tier-1
 *  `random-hire` placeholder this generator never actually varied. Returns
 *  `null` when this catalog has no generator-data (the static fallback
 *  catalog, or an older Core.zip with no `Core/generator/` files) rather
 *  than guessing a tier with no real weight/value data behind it. */
export function pickRandomHireTier(catalog: GameCatalog, rng: () => number): { tier: number; value: number; guardValue: number } | null {
  const list = catalog.rmgContentLists.find((l) => l.name === 'content_list_building_random_hires')
  const metaObjects = catalog.rmgGeneratorConfig?.metaObjects
  if (!list || !metaObjects || list.content.length === 0) return null
  const totalWeight = list.content.reduce((sum, c) => sum + c.weight, 0)
  if (totalWeight <= 0) return null
  let roll = rng() * totalWeight
  let chosenSid = list.content[0].sid
  for (const c of list.content) {
    if (roll < c.weight) { chosenSid = c.sid; break }
    roll -= c.weight
  }
  const tierMatch = /^random_hire_(\d)$/.exec(chosenSid)
  const meta = metaObjects.find((m) => m.sid === chosenSid)
  if (!tierMatch || !meta || meta.guardValue === undefined) return null
  return { tier: Number(tierMatch[1]), value: meta.value, guardValue: meta.guardValue }
}

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
 *  Re-tiered for issue #240 Phase 1 by cross-referencing every explicitly
 *  rarity-labeled real content list across BOTH generic content-list files
 *  (`basic_content_lists.json` and `generator_content_lists.json` — e.g.
 *  `content_list_building_common_hero_stats` vs `..._uncommon_hero_stats`
 *  vs `basic_content_list_building_epic_interact`), not just one file's
 *  numbered tiers as the original hand-tiering did. 29 sids moved tier
 *  (e.g. `fort`: real data groups it into `..._uncommon_hero_stats` with
 *  `orb_observatory`/`college_of_wonder`, not common — the mistiering this
 *  phase was scoped to fix; `learning_stone`/`lost_library`/`magic_wheel`/
 *  `stinging_sword`/`armory_automaton`/`knowledge_garden` all turned out to
 *  be real COMMON tier despite TSE previously filing them as uncommon).
 *  Sids with no explicit common/uncommon/epic label anywhere (e.g.
 *  `market`, `camp_fire`, `mystical_tower`) were left at their original
 *  tier — no real data to move them, in either direction. `fickle_shrine`
 *  (real, placeable, confirmed in `Core/DB/map/objects/4_interactables.json`)
 *  was found but excluded: it's tagged BOTH uncommon and epic across the two
 *  files, an unresolvable conflict, not a confident tier. `tree_of_abundance`
 *  has the same two-file conflict (uncommon in `generator_content_lists
 *  .json`, epic in `basic_content_lists.json`) but was already RARE here
 *  pre-phase-1, so it's left unchanged rather than un-asserted. */
export const INTERACTABLE_COMMON_SIDS = [
  'abandoned_corpse', 'abandoned_mansion', 'armory_automaton', 'beer_fountain',
  'black_tower', 'camp_fire', 'crow_nest', 'crystal_trail', 'flattering_mirror',
  'fountain', 'fountain_2', 'gardener', 'gingerbread_house', 'goblin_cache',
  'huntsmans_camp', 'insaras_eye', 'knowledge_garden', 'learning_stone',
  'lost_library', 'magic_wheel', 'mana_well', 'mereas_shrine', 'mysterious_stone',
  'mystical_tower', 'pandora_box', 'peasant_cart', 'pile_of_books', 'quixs_path',
  'stables', 'stinging_sword', 'tear_of_truth', 'village', 'watchtower',
  'wind_rose', 'windmill',
]

export const INTERACTABLE_UNCOMMON_SIDS = [
  'alchemy_lab', 'alvars_eye', 'arena', 'boreal_call', 'celestial_sphere',
  'chimerologist', 'circle_of_life', 'circus', 'college_of_wonder',
  'cursed_old_house', 'forge', 'fort', 'gladiator_arena', 'gladiator_spire',
  'heros_crypt', 'infernal_cirque', 'iridescent_abbey', 'jousting_range',
  'legions_memorial', 'market', 'maze', 'mercenary_guild', 'monty_hall',
  'orb_observatory', 'overgrown_grave', 'petrified_memorial', 'point_of_balance',
  'prismatic_lair', 'raiders_camp', 'ritual_pyre', 'sacrificial_shrine',
  'shady_den', 'tavern', 'the_gorge', 'tree_of_knowledge', 'trial_scales',
  'uncanny_rite', 'unforgotten_grave', 'university', 'wise_owl',
]

export const INTERACTABLE_RARE_SIDS = [
  'abandoned_outpost', 'abnormal_structure', 'dragon_utopia', 'eternal_dragon',
  'mirage', 'prison', 'remote_foothold', 'research_laboratory',
  'tree_of_abundance', 'troglodyte_throne', 'twilight_bloom', 'underground_lair',
  'unstable_ruins',
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
