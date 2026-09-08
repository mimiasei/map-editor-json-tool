// ─── Map Grid — Interactables sub-categories (issue #130) ───────────────────
// Core/DB/map/objects/4_interactables.json has no useful categorical field —
// all 315 entries share tag:"Interact" (confirmed during issue #130's
// investigation). The only real structure is the `id` naming convention,
// grouped here in the order they should appear in the sub-category picker.

export type InteractableSubcategory =
  | 'dwellings'
  | 'portals'
  | 'resourceStorage'
  | 'mines'
  | 'altarsOfMagic'
  | 'magicAmplifiers'
  | 'shrines'
  | 'unitTrade'
  | 'campaignOnly'
  | 'adventureSites'
  | 'treasureAwards'
  | 'marketsTrade'
  | 'special'
  | 'other'

export const INTERACTABLE_SUBCATEGORY_ORDER: InteractableSubcategory[] = [
  'dwellings',
  'portals',
  'resourceStorage',
  'mines',
  'altarsOfMagic',
  'magicAmplifiers',
  'shrines',
  'unitTrade',
  'campaignOnly',
  'adventureSites',
  'treasureAwards',
  'marketsTrade',
  'special',
  'other',
]

export const INTERACTABLE_SUBCATEGORY_LABELS: Record<InteractableSubcategory, string> = {
  dwellings: 'Dwellings',
  portals: 'Portals',
  resourceStorage: 'Resource Storage',
  mines: 'Mines',
  altarsOfMagic: 'Altars of Magic',
  magicAmplifiers: 'Magic Amplifiers',
  shrines: 'Shrines',
  unitTrade: 'Unit Trade',
  campaignOnly: 'Campaign-only',
  adventureSites: 'Adventure Sites',
  treasureAwards: 'Treasures & Awards',
  marketsTrade: 'Markets & Trade',
  special: 'Special',
  other: 'Other',
}

const ADVENTURE_SITE_SIDS = new Set([
    'abandoned_mansion', 'abnormal_structure', 'alvars_eye', 'overgrown_grave', 'black_tower',
    'boreal_call', 'the_gorge', 'circle_of_life', 'jousting_range', 'cursed_old_house',
    'dragon_utopia', 'orb_observatory', 'infernal_cirque', 'iridescent_abbey', 'knowledge_garden',
    'learning_stone', 'legions_memorial', 'maze', 'lost_library', 'magic_wheel', 'mereas_shrine',
    'college_of_wonder', 'unstable_ruins', 'fort', 'petrified_memorial', 'point_of_balance',
    'prismatic_lair', 'raiders_camp', 'research_laboratory', 'ritual_pyre', 'trial_scales',
    'stinging_sword', 'armory_automaton', 'unforgotten_grave', 'circus', 'tree_of_knowledge',
    'troglodyte_throne', 'shady_den', 'twilight_bloom', 'uncanny_rite', 'underground_lair',
    'university', 'wise_owl',
])

const TREASURE_AWARDS_SIDS = new Set([
    'peasant_cart', 'mystical_tower', 'beer_fountain', 'camp_fire', 'crow_nest',
    'crystal_trail', 'huntsmans_camp', 'abandoned_corpse', 'fountain',
    'gingerbread_house', 'goblin_cache', 'gardener',
    'pandora_box', 'pile_of_books', 'quixs_path', 'watchtower',
    'stables', 'tear_of_truth', 'monty_hall', 'chest', 'village', 'mana_well', 'mysterious_stone',
    'wind_rose', 'windmill', 'flattering_mirror',
])

const MARKETS_TRADE_SIDS = new Set([
    'alchemy_lab', 'forge', 'market',
])

const SPECIAL_SIDS = new Set([
    'gladiator_arena', 'gladiator_spire', 'arena', 'remote_foothold', 'abandoned_outpost',
    'tree_of_abundance', 'celestial_sphere', 'chimerologist', 'eternal_dragon', 'prison',
    'insaras_eye', 'mirage', 'tavern', 'heros_crypt',
])

/** Classifies an interactable's `id` (== PlacedObject.sid) by naming
 *  convention. Order matters — checked top to bottom, first match wins. */
export function resolveInteractableSubcategory(sid: string): InteractableSubcategory {
  if (sid.startsWith('campaign_') || sid.endsWith('_campaign')) return 'campaignOnly'
  if (sid.startsWith('barracks_')) return 'dwellings'
  if (sid.startsWith('portal_')) return 'portals'
  if (sid.startsWith('storage_') || sid.startsWith('custom_storage_')) return 'resourceStorage'
  if (sid.startsWith('mine_')) return 'mines'
  if (sid.startsWith('altar_of_magic_') || sid.startsWith('custom_altar_of_magic_')) return 'altarsOfMagic'
  if (sid.startsWith('magic_amplifier_')) return 'magicAmplifiers'
  if (sid.includes('shrine')) return 'shrines'
  if (sid.startsWith('unit_trade_lab_')) return 'unitTrade'
  if (ADVENTURE_SITE_SIDS.has(sid)) return 'adventureSites'
  if (TREASURE_AWARDS_SIDS.has(sid)) return 'treasureAwards'
  if (MARKETS_TRADE_SIDS.has(sid)) return 'marketsTrade'
  if (SPECIAL_SIDS.has(sid)) return 'special'
  return 'other'
}
