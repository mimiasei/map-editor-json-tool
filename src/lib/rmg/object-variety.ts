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

/** `sid -> real gold value`, folding `goodsValueBySid` (objects_logic/items,
 *  sparse — most buildings don't carry it) together with `generator_config
 *  .json`'s own `metaObjects` curve (the `random_item_*`/`random_hire_*`
 *  abstract tiers, which never appear in objects_logic at all) — issue #240
 *  Phase 2's one real value lookup, used by `rollContentPool`'s value-bucket
 *  gating below and by `zone-population.ts` for a resolved pick's guard
 *  value. */
export function resolveGoodsValue(catalog: GameCatalog, sid: string): number | undefined {
  return catalog.goodsValueBySid[sid] ?? catalog.rmgGeneratorConfig?.metaObjects.find((m) => m.sid === sid)?.value
}

/** Real weighted sid pick straight out of one named `Core/generator/
 *  content_pools/*.json` pool (issue #240 Phase 2) — no copied/hardcoded
 *  weight numbers, reads `catalog.rmgContentPools`/`rmgContentLists` live
 *  every call. Flattens every group's `includeLists` entries into one
 *  candidate list (a group's own inline `content` is an override/extension
 *  of a specific sid's weight within that group, per `CatalogContentPool`'s
 *  own doc comment — it replaces, not adds to, a same-sid list entry's
 *  weight), each candidate's effective pick weight = `group.weight *
 *  entry.weight`, additionally scaled by the pool's own `valueDistribution`
 *  price-bucket weight when the sid's real gold value is known
 *  (`resolveGoodsValue`) — an unknown-value sid (most buildings;
 *  `goodsValueBySid` is sparse) gets no value-bucket scaling at all
 *  (neutral, not excluded), since there's no real data to bias it by.
 *  `bans` and `isExcluded` both hard-exclude a sid from the whole pool
 *  (effectively an instant resample, no retry loop needed), unlike a
 *  zeroed weight which still participates in `includeLists` resolution but
 *  never gets picked. Returns `null` only if the pool is unknown or every
 *  candidate ended up excluded/zero-weight. */
export function rollContentPool(
  catalog: GameCatalog,
  poolName: string,
  rng: () => number,
  isExcluded?: (sid: string) => boolean,
): string | null {
  const pool = catalog.rmgContentPools.find((p) => p.name === poolName)
  if (!pool) return null
  const banned = new Set((pool.bans ?? []).map((b) => b.sid))
  const candidates: { sid: string; weight: number }[] = []
  for (const group of pool.groups) {
    if (group.weight <= 0) continue
    const overrides = new Map((group.content ?? []).map((c) => [c.sid, c.weight]))
    const seen = new Set<string>()
    for (const listName of group.includeLists ?? []) {
      const list = catalog.rmgContentLists.find((l) => l.name === listName)
      for (const entry of list?.content ?? []) {
        if (seen.has(entry.sid) || banned.has(entry.sid) || isExcluded?.(entry.sid)) continue
        seen.add(entry.sid)
        const weight = overrides.get(entry.sid) ?? entry.weight
        if (weight <= 0) continue
        let bucketScale = 1
        if (pool.valueDistribution) {
          const value = resolveGoodsValue(catalog, entry.sid)
          if (value !== undefined) {
            const { priceBounds, weights } = pool.valueDistribution
            let bucket = priceBounds.findIndex((bound) => value <= bound)
            if (bucket === -1) bucket = weights.length - 1
            bucketScale = weights[bucket] ?? 1
          }
        }
        candidates.push({ sid: entry.sid, weight: group.weight * weight * bucketScale })
      }
    }
    // Override entries whose sid wasn't already in one of this group's own
    // includeLists (e.g. basic_pools_resources.json's richness pools add
    // sids like `resource_gold` directly, with no matching list entry at
    // all for some of them).
    for (const [sid, weight] of overrides) {
      if (seen.has(sid) || banned.has(sid) || isExcluded?.(sid) || weight <= 0) continue
      candidates.push({ sid, weight: group.weight * weight })
    }
  }
  const total = candidates.reduce((sum, c) => sum + c.weight, 0)
  if (total <= 0) return null
  let roll = rng() * total
  for (const c of candidates) {
    if (roll < c.weight) return c.sid
    roll -= c.weight
  }
  return candidates[candidates.length - 1].sid
}

/** Real sid families rolled out of the generic content pools excluded for
 *  lack of CONFIRMED placement support — issue #240 Phase 2. `pandora_box`/
 *  `scroll_box`/`enchanted_scroll_box` are NOT excluded: `map-write.ts`'s own
 *  `SIDS_WITH_VARIANTS_ONLY` already backfills their real `propVariants` row
 *  on every fresh placement, confirmed by that file's own real-map survey
 *  (100% consistent across every sampled instance) — this module's own
 *  `place()` call routes through that exact backfill automatically, so no
 *  extra wiring is needed here. `mythic_scroll_box` is the one real
 *  exception: absent from every one of `map-write.ts`'s three confirmed-sid
 *  lists (not even its "mixed/partial coverage, default to neither table"
 *  bucket — just never surveyed at all, likely too rare in the sampled real
 *  maps), so there's no real-data backing for its placement behavior yet —
 *  left out rather than guessed, same spirit as Phase 1's `fickle_shrine`
 *  exclusion and CLAUDE.md's "editor-time validity ≠ game-runtime validity"
 *  lesson. Passed as `rollContentPool`'s `isExcluded` so a hit resamples
 *  into something else from the same pool instead of silently dropping a
 *  placement. */
export const UNSUPPORTED_CONTENT_POOL_SIDS = new Set(['mythic_scroll_box'])

/** Real interactable sids the actual game doesn't support as regular
 *  placeable content — not a guess: the 6 faction `*_city` hall objects are
 *  confirmed unsupported by Unfrozen's own Map Editor manual (per direct
 *  user confirmation, issue #238 follow-up); `campaign_`/`_campaign`-tagged
 *  sids are scripted campaign props (confirmed absent from every real
 *  `Core/generator/content_lists/*.json` entry and from this module's own
 *  curated interactable tiers); `block`/`block_2`/`block_campaign_*` are
 *  invisible collision markers, not real content; `custom_*` are per-map
 *  custom object clones (CLAUDE.md's own "raw here, resolved where shown"
 *  convention — not generic placeable content); `pvp_*` (`pvp_promo_
 *  barracks`/`pvp_promo_barracks_necropolis`) are PvP-mode-only promotional
 *  dwellings. Checked by substring/suffix, not just prefix, since several
 *  real sids embed `campaign`/`block` mid-string (`stinging_sword_campaign`,
 *  `block_campaign_tree_grass`, `campaign_M9_block_angel1`) — confirmed safe
 *  against false positives: every real interactable sid containing
 *  "campaign" or "block" is one of these, none legitimate. Shared by every
 *  RMG interactable pick path (`rollContentPool`'s `isExcluded`,
 *  `pickInteractableSid`'s cap-check) AND `InteractableSelectorDialog.tsx`'s
 *  own browser, so a sid can never leak into generation through one path
 *  while only being hidden in another. */
export function isRmgIneligibleInteractableSid(sid: string): boolean {
  return sid.includes('campaign') || sid.includes('block') || sid.endsWith('_city')
    || sid.startsWith('custom_') || sid.startsWith('pvp_')
}

/** Maps `generator_config.json`'s 4 named value-tier sids (abstract entries
 *  that only ever appear inside the real content-lists/pools system, never
 *  placed literally) to the `random-item` placeholder's own real `rarity`
 *  field (0-3) — confirmed one-for-one against Core/DB/items/items/*.json's
 *  own `rarity` string (`common`/`rare`/`epic`/`legendary`), issue #240
 *  Phase 2. */
const RANDOM_ITEM_TIER_TO_RARITY: Record<string, number> = {
  random_item_common: 0,
  random_item_rare: 1,
  random_item_epic: 2,
  random_item_legendary: 3,
}

export interface ResolvedContentPoolPick {
  sid: string
  randomItemOverrides?: { rarity: number }
  randomHireOverrides?: { tier: number }
  /** Only set for a `random_hire_N` resolution — its real, separate
   *  `guardValue` from `generator_config.json`, reused directly (the tier
   *  is already decided, by this sid itself, so there's no need to re-roll
   *  a weighted tier pick a second time). */
  guardValue?: number
}

/** Turns one real sid rolled out of `rollContentPool` (issue #240 Phase 2)
 *  into something this generator can actually place. Most sids need no
 *  translation at all (a real, already-placeable building/storage/resource
 *  sid, same "no extra config" universe this module's other exports already
 *  document) — only the two abstract bookkeeping families (`random_item_*`/
 *  `random_hire_*`, which are never real placeable objects themselves) need
 *  resolving into a concrete sid or a placeholder + override. A
 *  `random_item_*` tier prefers a real, concrete artifact of the matching
 *  real rarity (keeping this generator's existing "concrete over
 *  placeholder" feature) over the bare `random-item` placeholder, falling
 *  back to the placeholder only once every matching-rarity artifact is
 *  already used/capped this zone. Returns `null` only for `random_hire_N`
 *  when this Core.zip is missing `generator_config.json`'s matching entry
 *  (old data) — every other case always resolves to something placeable. */
export function resolveContentPoolPick(
  sid: string,
  catalog: GameCatalog,
  usedArtifactSids: Set<string>,
  preferredSids: Set<string> | undefined,
  isAtCap: (sid: string) => boolean,
  rng: () => number,
): ResolvedContentPoolPick | null {
  const rarity = RANDOM_ITEM_TIER_TO_RARITY[sid]
  if (rarity !== undefined) {
    const rarityLabel = ['common', 'rare', 'epic', 'legendary'][rarity]
    const available = catalog.artifacts.filter(
      (a) => a.rarity === rarityLabel && !a.id.startsWith('shadow_of_death_') && !usedArtifactSids.has(a.id) && !isAtCap(a.id),
    )
    if (available.length > 0) {
      const preferred = preferredSids ? available.filter((a) => preferredSids.has(a.id)) : []
      const pool = preferred.length > 0 && rng() < 0.7 ? preferred : available
      const artifact = pool[Math.floor(rng() * pool.length)]
      usedArtifactSids.add(artifact.id)
      return { sid: artifact.id }
    }
    return { sid: 'random-item', randomItemOverrides: { rarity } }
  }
  const hireMatch = /^random_hire_(\d)$/.exec(sid)
  if (hireMatch) {
    const meta = catalog.rmgGeneratorConfig?.metaObjects.find((m) => m.sid === sid)
    if (!meta || meta.guardValue === undefined) return null
    return { sid: 'random-hire', randomHireOverrides: { tier: Number(hireMatch[1]) }, guardValue: meta.guardValue }
  }
  return { sid }
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
 *  placement outright. Inside a tier a sid is picked by `weightFor` (its rarity
 *  weight, interactable-rarity.ts). Returns `null` only if every tier is fully capped. */
export function pickInteractableSid(rng: () => number, isAtCap: (sid: string) => boolean, weightFor: (sid: string) => number = () => 1): string | null {
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
    if (available.length === 0) continue
    // Weighted by the sid's rarity weight (all 1 without one = uniform).
    const total = available.reduce((sum, sid) => sum + weightFor(sid), 0)
    if (!(total > 0)) return available[Math.floor(rng() * available.length)]
    let pick = rng() * total
    for (const sid of available) {
      pick -= weightFor(sid)
      if (pick < 0) return sid
    }
    return available[available.length - 1]
  }
  return null
}
