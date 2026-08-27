// ─── Map grid — random Interactable brush ────────────────────────────────────
// Unlike environments (fuzzy-obstacle.ts's trees/mountains/pools), real
// `interactables` catalog data has almost no usable biome information:
// confirmed against the real catalog (Core/DB/map/objects/4_interactables.json,
// 316 entries) that only 49 carry a `biome` tag at all, and every single one
// of those is a faction city/barracks building (`barracks_human_1`,
// `human_city`, ...) — the real player-start city structures, NOT decorative
// scenery (inferInteractableBiomes's own doc comment in catalog/builder.ts
// confirms "~90% of interactables ... are genuinely terrain-agnostic by
// design"). Scattering those randomly would place fake city-founding
// structures, not harmless decorations, so they're excluded entirely here —
// this brush is for the OTHER ~250 interactables (mines, shrines, camps,
// monuments, ...), most of which have no real biome association at all.
//
// Per an explicit user decision this session (data doesn't support a
// game-confirmed biome pool the way trees/mountains do): INTERACTABLE_BIOME_TAGS
// below is a curated, editor-UI judgment call based on each object's own
// name/flavor text, NOT confirmed game data — unlike every other biome
// association in this codebase. Every interactable not in that list is
// "universal" (always eligible regardless of which biome tile it's painted
// on) — mines, storages, market, tavern, stables, research labs, and most
// shrines are genuinely gameplay/economy content the real game doesn't
// biome-restrict, so leaving them untagged is the more honest default, not
// a gap to fill in later.

import type { BiomeId } from './terrain-colors'
import { areBiomesCompatible } from './fuzzy-obstacle'
import type { CatalogMapObject } from '@/lib/catalog/types'

const ALL_BIOME_IDS: BiomeId[] = [1, 2, 3, 4, 5, 6, 7]

/** Real player-start city/barracks structures — see this module's own doc
 *  comment for why these can never be part of a random-scatter pool. */
function isCityOrBarracks(id: string): boolean {
  return id.startsWith('barracks_') || id.endsWith('_city') || id.startsWith('pvp_promo_barracks')
}

/** Every other exclusion is mechanical, not a judgment call: campaign-only/
 *  scripted variants (same convention as fuzzy-obstacle.ts's campaign_*
 *  exclusion), `custom_*` entries (confirmed exact duplicates of a
 *  non-custom counterpart with the same effective content — every one
 *  checked has a matching base id), functional teleport portals (need a
 *  paired partner to work at all — a lone randomly-placed one is broken,
 *  not decorative), and internal/placeholder objects (no real localized
 *  name — `name === id` is a genuine signal here, not a guess: every
 *  legitimate player-facing interactable has a translated display name). */
function isScatterable(obj: CatalogMapObject): boolean {
  if (isCityOrBarracks(obj.id)) return false
  if (obj.id.startsWith('campaign_') || obj.id.endsWith('_campaign')) return false
  if (obj.id.startsWith('custom_')) return false
  if (obj.id.startsWith('portal_')) return false
  if (obj.id.startsWith('block')) return false
  if (obj.id === 'fountain_2') return false // duplicate of fountain
  if (obj.name === obj.id) return false
  return true
}

/** Curated editor judgment call (see this module's own doc comment) —
 *  confident thematic fits only; everything else stays in the universal
 *  pool rather than guessing at a weaker association. */
const INTERACTABLE_BIOME_TAGS: Record<string, BiomeId> = {
  // Grass — pastoral, daylight, village life
  village: 1, windmill: 1, fountain: 1, circle_of_life: 1, tree_of_abundance: 1,
  tree_of_knowledge: 1, wise_owl: 1, altar_of_magic_2: 1, town_gate: 1,
  // Autumn — forest, harvest, exploration
  huntsmans_camp: 5, watchtower: 5, twilight_bloom: 5, altar_of_magic_4: 5,
  // Snow — arctic, winter
  boreal_call: 4, gingerbread_house: 4, flattering_mirror: 4,
  // Deathland — undead, graves, dark ritual
  overgrown_grave: 3, unforgotten_grave: 3, heros_crypt: 3, cursed_old_house: 3,
  the_gorge: 3, abandoned_corpse: 3, crow_nest: 3, sacrificial_shrine: 3,
  ritual_pyre: 3, uncanny_rite: 3, black_tower: 3, altar_of_magic_1: 3,
  unstable_ruins: 3, abandoned_mansion: 3,
  // Lava — infernal, fire, hell
  infernal_cirque: 6, gladiator_arena: 6, gladiator_spire: 6, eternal_dragon: 6,
  dragon_utopia: 6, arena: 6,
  // Dirt — underground, dungeon
  troglodyte_throne: 7, underground_lair: 7, raiders_camp: 7,
  // Sand/Desert
  mirage: 2, abandoned_outpost: 2, remote_foothold: 2, alvars_eye: 2,
}

export interface InteractablePools {
  byBiome: Record<BiomeId, string[]>
  /** Terrain-agnostic interactables (the vast majority — see doc comment
   *  above) — always included as candidates regardless of clicked biome. */
  universal: string[]
}

/** Buckets every real, scatterable `interactables` catalog entry, once per
 *  catalog (cheap to memoize by the caller, same convention as
 *  buildFuzzyObstaclePools/buildTreePools). */
export function buildInteractablePools(mapObjects: CatalogMapObject[]): InteractablePools {
  const byBiome = Object.fromEntries(ALL_BIOME_IDS.map((id) => [id, [] as string[]])) as Record<BiomeId, string[]>
  const universal: string[] = []
  for (const obj of mapObjects) {
    if (obj.category !== 'interactables' || !isScatterable(obj)) continue
    const taggedBiome = INTERACTABLE_BIOME_TAGS[obj.id]
    if (taggedBiome) byBiome[taggedBiome].push(obj.id)
    else universal.push(obj.id)
  }
  return { byBiome, universal }
}

export interface SampleInteractableOptions {
  /** Chance the pick draws from a different biome's tagged pool than the
   *  tile's own — 0 = always the tile's own biome + universal, 1 = always
   *  a different one + universal (the universal pool is always in play
   *  regardless, per this module's own doc comment). */
  crossBiomeChance?: number
  /** Whether a cross-biome pick can land on a visually jarring biome — see
   *  areBiomesCompatible, fuzzy-obstacle.ts. */
  allowHighContrastBiomes?: boolean
  /** Injectable for deterministic tests; defaults to Math.random. */
  rng?: () => number
}

/** Picks one interactable sid for a single tile of the given biome, or
 *  undefined if no candidates exist at all (shouldn't happen in practice —
 *  the universal pool alone has ~75 real entries). */
export function sampleInteractable(
  ownBiome: BiomeId,
  pools: InteractablePools,
  options: SampleInteractableOptions = {},
): string | undefined {
  const { crossBiomeChance = 0.1, allowHighContrastBiomes = true, rng = Math.random } = options
  let biomeId = ownBiome
  if (rng() < crossBiomeChance) {
    const candidates = ALL_BIOME_IDS.filter(
      (id) => id !== ownBiome && pools.byBiome[id].length > 0 && (allowHighContrastBiomes || areBiomesCompatible(ownBiome, id)),
    )
    if (candidates.length > 0) biomeId = candidates[Math.floor(rng() * candidates.length)]
  }
  const candidates = [...pools.byBiome[biomeId], ...pools.universal]
  if (candidates.length === 0) return undefined
  return candidates[Math.floor(rng() * candidates.length)]
}
