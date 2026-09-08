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
