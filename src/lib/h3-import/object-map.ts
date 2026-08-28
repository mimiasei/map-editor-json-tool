// ─── H3 object → OE sid resolution ───────────────────────────────────────────
// Ported from the reference project (leviritchie/homm3-olden-stock-translator)
// `vanilla_stock/object_map.py`, used with the author's explicit permission.
//
// `resolveObjectSid()` is the general entry point (issue #207 Phase 2),
// covering towns/monsters/mines/resources/dwellings/portals/artifacts in the
// same resolution order as the reference's `resolve_object_sid` — falling
// through to the scenery role+biome table (Phase 1) last. `OMIT_OBJECT_IDS`
// still means what it says (omit with a named reason, e.g. the boat/water-
// travel family, which has no stock ObjectConfig at all) — quests/heroes/
// events/complex payloads deferred here are real, temporary Phase 2 gaps
// (tracked in the conversion report), not permanent.
//
// Deliberately simplified vs. the reference this round: the monster-type
// "no stock strength budget" omit gate needs the neutral-strength model
// (Phase 3) — every monster resolves to `random-squad` for now, uncalibrated.

import * as h3obj from './h3m-object-registry'

export type OeBiome = 'grass' | 'snow' | 'dirt' | 'desert' | 'dead' | 'lava' | 'water' | 'sand'

/** H3 terrain id → the biome bucket key `BIOME_ROLE_REPLACEMENTS` uses.
 *  Distinct from `terrain-map.ts`'s H3-terrain→OE-tile-id table — this one
 *  is purely about which scenery-variant bucket to pick from. */
export const H3_TERRAIN_BIOME: Record<number, OeBiome> = {
  0: 'dirt', 1: 'sand', 2: 'grass', 3: 'snow', 4: 'dead', 5: 'grass', 6: 'dirt', 7: 'lava', 8: 'water', 9: 'dirt',
}

type SceneryRole = 'ground' | 'pool' | 'tree' | 'shrub' | 'pool_big' | 'water_decoration' | 'mountain' | 'rock' | 'ruin'

/** H3 object-class-id → scenery role. */
export const TERRAIN_OBJECT_ROLES: Record<number, SceneryRole> = {
  116: 'ground', 118: 'pool', 119: 'tree', 120: 'shrub', 124: 'pool', 125: 'water_decoration', 126: 'pool',
  127: 'pool_big', 128: 'pool', 129: 'mountain', 131: 'mountain', 133: 'mountain', 134: 'mountain', 135: 'tree',
  136: 'pool', 137: 'tree', 147: 'rock', 148: 'ruin', 149: 'pool_big', 150: 'shrub', 151: 'rock', 153: 'rock',
  206: 'mountain', // OBJECT_DESERT_HILLS
  207: 'rock', // OBJECT_UNKNOWN_SCENERY_207
  208: 'rock', 209: 'rock', 210: 'mountain', 211: 'rock',
}

export const BIOME_ROLE_REPLACEMENTS: Record<SceneryRole, Record<OeBiome, string>> = {
  mountain: { grass: 'mountain_green_small_1', snow: 'mountain_snow_small_1', dirt: 'mountain_dirt_small_1', desert: 'mountain_dirt_small_1', dead: 'mountain_dead_small_1', lava: 'mountain_lava_small_1', water: 'mountain_water_small_1', sand: 'mountain_dirt_small_1' },
  pool: { grass: 'pool_small', snow: 'pool_snow_small_1', dirt: 'pool_dirt_small_1', desert: 'pool_desert_small_1', dead: 'pool_dead_small_1', lava: 'pool_lava_small_1', water: 'water_reed_1', sand: 'pool_desert_small_1' },
  pool_big: { grass: 'pool_big', snow: 'pool_snow_big_1', dirt: 'pool_dirt_big_1', desert: 'pool_desert_big_1', dead: 'pool_dead_big_1', lava: 'pool_lava_big_1', water: 'water_reed_1', sand: 'pool_desert_big_1' },
  tree: { grass: 'pinetree_1', snow: 'pinetree_snow_1', dirt: 'tree_dirt_1', desert: 'grass_desert_1', dead: 'tree_dead_1', lava: 'tree_lava_1', water: 'water_reed_1', sand: 'grass_desert_1' },
  shrub: { grass: 'grass_1', snow: 'grass_snow_1', dirt: 'dirt_strange_flower', desert: 'grass_desert_1', dead: 'grass_death_1', lava: 'lava_stones_1', water: 'water_reed_1', sand: 'grass_desert_1' },
  rock: { grass: 'grass_stones_1', snow: 'snow_stones_1', dirt: 'dirt_rock_1', desert: 'desert_stones_1', dead: 'dead_stones_1', lava: 'lava_stones_1', water: 'water_reed_1', sand: 'desert_stones_1' },
  ground: { grass: 'grass_stones_1', snow: 'snow_stones_1', dirt: 'dirt_stones_1', desert: 'desert_dune_1', dead: 'dead_meadow', lava: 'lava_stones_1', water: 'water_reed_1', sand: 'desert_dune_1' },
  ruin: { grass: 'rocks_1', snow: 'snow_rock_hill_1', dirt: 'dirt_rock_1', desert: 'ruins_desert_1', dead: 'dead_sculls_bones_hill', lava: 'dirt_volcanic_rock', water: 'water_reed_1', sand: 'ruins_desert_1' },
  water_decoration: { grass: 'water_reed_1', snow: 'water_reed_1', dirt: 'water_reed_1', desert: 'water_reed_1', dead: 'water_reed_1', lava: 'water_reed_1', water: 'water_reed_1', sand: 'water_reed_1' },
}

/** Stock 1x1 blocker donor per biome, used to tile a multi-cell H3 footprint
 *  when the resolved sid doesn't already match it exactly (see
 *  scenery-footprint.ts). */
export const SCENERY_FOOTPRINT_FILL_BY_BIOME: Record<OeBiome, string> = {
  grass: 'mountain_green_small_1', snow: 'mountain_snow_small_1', dirt: 'mountain_dirt_small_1',
  desert: 'mountain_dirt_small_1', dead: 'mountain_dead_small_1', lava: 'mountain_lava_small_1',
  water: 'mountain_water_small_1', sand: 'mountain_dirt_small_1',
}

/** Object id 199 (a large real H3 tree/rock scenery family with 48 distinct
 *  `.def` animations) — resolved by exact per-animation lookup rather than
 *  role+biome, since its H3 subtype has no OE-side biome concept of its
 *  own. Generated directly from `substitution_table.json`'s `scenery_blocker`
 *  rows (all 3 replacement sids are already stock-legal, no GE remap
 *  needed) — do not hand-edit; regenerate from the source JSON if this ever
 *  needs to change (an earlier hand-transcription of this table from a
 *  research summary silently invented nonexistent entries and dropped real
 *  ones — confirmed wrong against real maps in `maps/H3_Maps/`, replaced
 *  with this table generated straight from the JSON). Keys are lowercased
 *  at lookup time — H3 animation filenames are observed in mixed case
 *  across real maps. */
export const OBJECT_199_ANIMATION_TO_SID: Record<string, string> = {
  'avlswt00.def': 'tree_dirt_1',
  'avlswt01.def': 'tree_dirt_1',
  'avlswt02.def': 'tree_dirt_1',
  'avlswt03.def': 'tree_dirt_1',
  'avlswt04.def': 'tree_dirt_1',
  'avlswt05.def': 'tree_dirt_1',
  'avlswt06.def': 'tree_dirt_1',
  'avlswt07.def': 'tree_dirt_1',
  'avlswt08.def': 'tree_dirt_1',
  'avlswt09.def': 'tree_dirt_1',
  'avlswt10.def': 'tree_dirt_1',
  'avlswt11.def': 'tree_dirt_1',
  'avlswt12.def': 'tree_dirt_1',
  'avlswt13.def': 'tree_dirt_1',
  'avlswt14.def': 'tree_dirt_1',
  'avlswt16.def': 'tree_dirt_1',
  'avlswt17.def': 'tree_dirt_1',
  'avlswt18.def': 'tree_dirt_1',
  'avlswt19.def': 'tree_dirt_1',
  'avlswtr0.def': 'dirt_rock_1',
  'avlswtr1.def': 'dirt_rock_1',
  'avlswtr2.def': 'dirt_rock_1',
  'avlswtr3.def': 'dirt_rock_1',
  'avlswtr4.def': 'dirt_rock_1',
  'avlswtr5.def': 'dirt_rock_1',
  'avlswtr6.def': 'desert_cracked_stones_2',
  'avlswtr7.def': 'dirt_rock_1',
  'avlswtr8.def': 'dirt_rock_1',
  'avlswtr9.def': 'dirt_rock_1',
  'avltro00.def': 'tree_dirt_1',
  'avltro01.def': 'tree_dirt_1',
  'avltro03.def': 'tree_dirt_1',
  'avltro04.def': 'tree_dirt_1',
  'avltro05.def': 'tree_dirt_1',
  'avltro06.def': 'tree_dirt_1',
  'avltro07.def': 'tree_dirt_1',
  'avltro08.def': 'tree_dirt_1',
  'avltro09.def': 'tree_dirt_1',
  'avltro10.def': 'tree_dirt_1',
  'avltro11.def': 'tree_dirt_1',
  'avltro12.def': 'tree_dirt_1',
  'avltrro0.def': 'dirt_rock_1',
  'avltrro2.def': 'dirt_rock_1',
  'avltrro3.def': 'dirt_rock_1',
  'avltrro4.def': 'dirt_rock_1',
  'avltrro5.def': 'dirt_rock_1',
  'avltrro6.def': 'tree_dirt_1',
  'avltrro7.def': 'tree_dirt_1',
}

export interface SceneryResolution {
  /** Base sid before random-variant substitution (scenery-variants.ts). */
  sid: string
  footprintFillSid: string
}

/** Resolve an H3 scenery object to a base OE sid + fallback 1x1 filler,
 *  or `null` if this object id isn't a recognized scenery family (defer to
 *  Phase 2, or omit). */
export function resolveSceneryObjectSid(templateObjectId: number, templateAnimation: string, h3TerrainAtTile: number): SceneryResolution | null {
  const biome = H3_TERRAIN_BIOME[h3TerrainAtTile] ?? 'grass'
  const fillSid = SCENERY_FOOTPRINT_FILL_BY_BIOME[biome]

  if (templateObjectId === 199) {
    const sid = OBJECT_199_ANIMATION_TO_SID[templateAnimation.toLowerCase()]
    if (!sid) return null
    return { sid, footprintFillSid: fillSid }
  }

  const role = TERRAIN_OBJECT_ROLES[templateObjectId]
  if (!role) return null
  const sid = BIOME_ROLE_REPLACEMENTS[role][biome]
  return { sid, footprintFillSid: fillSid }
}

// ─── General (non-scenery) object resolution — issue #207 Phase 2 ───────────

/** Water-travel/boat family and complex-payload objects with no stock
 *  equivalent (or deferred to a later phase) — omit with a named reason
 *  rather than guess. */
export const OMIT_OBJECT_IDS: Record<number, string> = {
  8: 'boat_no_stock_objectconfig',
  [h3obj.OBJECT_FLOTSAM]: 'flotsam_water_travel_omit',
  [h3obj.OBJECT_SHIPYARD]: 'shipyard_requires_boat_omit',
  [h3obj.OBJECT_SEA_CHEST]: 'sea_chest_water_travel_omit',
  [h3obj.OBJECT_SHIPWRECK]: 'shipwreck_water_bank_omit',
  [h3obj.OBJECT_SHIPWRECK_SURVIVOR]: 'shipwreck_survivor_omit',
  [h3obj.OBJECT_OCEAN_BOTTLE]: 'ocean_bottle_omit',
  [h3obj.OBJECT_QUEST_GUARD]: 'quest_guard_payload_deferred',
  [h3obj.OBJECT_PRISON]: 'prison_payload_deferred',
  [h3obj.OBJECT_HERO_PLACEHOLDER]: 'hero_placeholder_deferred',
  [h3obj.OBJECT_RANDOM_DWELLING]: 'random_dwelling_decoder_unsupported',
  [h3obj.OBJECT_RANDOM_DWELLING_LVL]: 'random_dwelling_lvl_unsupported',
  [h3obj.OBJECT_RANDOM_DWELLING_FACTION]: 'random_dwelling_faction_unsupported',
  [h3obj.OBJECT_PANDORAS_BOX]: 'pandoras_box_deferred',
  [h3obj.OBJECT_GRAIL]: 'grail_deferred',
  [h3obj.OBJECT_SIGN]: 'sign_message_deferred',
  [h3obj.OBJECT_SCHOLAR]: 'scholar_deferred',
  [h3obj.OBJECT_WITCH_HUT]: 'witch_hut_deferred',
  [h3obj.OBJECT_GARRISON]: 'garrison_army_payload_deferred',
  [h3obj.OBJECT_GARRISON2]: 'garrison_army_payload_deferred',
  [h3obj.OBJECT_HERO]: 'placed_hero_identity_omit_use_city_spawns',
  [h3obj.OBJECT_RANDOM_HERO]: 'random_hero_omit_use_city_spawns',
  [h3obj.OBJECT_SPELL_SCROLL]: 'spell_scroll_deferred',
  [h3obj.OBJECT_CORPSE]: 'corpse_deferred',
  [h3obj.OBJECT_LEAN_TO]: 'lean_to_deferred',
  [h3obj.OBJECT_WAGON]: 'wagon_deferred',
  [h3obj.OBJECT_WARRIORS_TOMB]: 'warriors_tomb_deferred',
  [h3obj.OBJECT_CRYPT]: 'crypt_bank_deferred',
  [h3obj.OBJECT_CREATURE_BANK]: 'creature_bank_deferred',
  [h3obj.OBJECT_BLACK_MARKET]: 'black_market_deferred',
  [h3obj.OBJECT_UNIVERSITY]: 'university_deferred',
  [h3obj.OBJECT_TREE_OF_KNOWLEDGE]: 'tree_of_knowledge_deferred',
  [h3obj.OBJECT_BORDER_GATE]: 'border_gate_deferred',
  [h3obj.OBJECT_SEER_HUT]: 'seer_hut_omitted_no_stock_interactable',
}

/** H3 town subtype → [stock city sid, faction]. */
export const H3_TOWN_SUBTYPE_TO_STOCK: Record<number, [string, string]> = {
  0: ['human_city', 'human'],
  1: ['nature_city', 'nature'],
  3: ['demon_city', 'demon'],
  4: ['undead_city', 'undead'],
  5: ['dungeon_city', 'dungeon'],
}

/** H3 town subtypes with no stock faction counterpart — free-choice
 *  (`random-city`) rather than failing the whole map. */
export const H3_TOWN_SUBTYPE_FREE_CHOICE = new Set([2, 6, 7, 8, 9, 10, 11])

const MONOLITH_TWO_WAY_ANIMATION_SID: Record<string, string> = {
  'avxmn2g0.def': 'portal_1', 'avxmn2o0.def': 'portal_2', 'avxmn2p0.def': 'portal_3',
  'avxmn4b0.def': 'portal_1', 'avxmn5b0.def': 'portal_2', 'avxmn6b0.def': 'portal_3',
  'avxmn7b0.def': 'portal_1', 'avxmn8b0.def': 'portal_2', 'avxmn9bw.def': 'portal_3',
  'avxmn2pink0.def': 'portal_1', 'avxmn2t0.def': 'portal_2', 'avxmn2y0.def': 'portal_3',
  'avxmn2b0.def': 'portal_1', 'avxmn9b0.def': 'portal_2', 'avxmn10b.def': 'portal_3',
  'avxmn11b.def': 'portal_1', 'avxmn12b.def': 'portal_2', 'avxmn2bl.def': 'portal_3',
  'avxmn2rd.def': 'portal_1', 'avxmn19p.def': 'portal_2', 'avxmn20b.def': 'portal_3',
  'avxptw_0.def': 'portal_1', 'avxptw_1.def': 'portal_2', 'avxptw_2.def': 'portal_3', 'avxptw_3.def': 'portal_1',
}

const RESOURCE_ANIMATION_TOKEN_SID: Record<string, string> = {
  gold: 'resource_gold', wood: 'resource_wood', ore: 'resource_ore', crys: 'resource_crystals',
  merc: 'resource_mercury', gems: 'resource_gemstones', sulf: 'resource_dust',
}

const MINE_SUBTYPE_SID: Record<number, string> = {
  0: 'mine_wood', 1: 'mine_mercury', 2: 'mine_ore', 3: 'alchemy_lab', 4: 'mine_crystals', 5: 'mine_gemstones', 6: 'mine_gold',
}
const MINE_ANIMATION_EXACT_SID: Record<string, string> = {
  'avmalch0.def': 'alchemy_lab', 'avmalcs0.def': 'alchemy_lab', 'avmsulf0.def': 'alchemy_lab',
  'avmorsb0.def': 'mine_ore', 'avmorsn0.def': 'mine_ore', 'avmore0.def': 'mine_ore',
  'avmsawg0.def': 'mine_wood', 'avmsaws0.def': 'mine_wood', 'avmwwhl0.def': 'mine_wood',
  'avmgold0.def': 'mine_gold', 'avmgos0.def': 'mine_gold', 'avmgems0.def': 'mine_gemstones',
  'avmcrys0.def': 'mine_crystals', 'avmcrgr0.def': 'mine_crystals',
}
const MINE_ANIMATION_TOKEN_SID: Record<string, string> = {
  gog: 'mine_gold', gos: 'mine_gold', god: 'mine_gold', gold: 'mine_gold',
  ors: 'mine_ore', ord: 'mine_ore', ore: 'mine_ore',
  saw: 'mine_wood', wwh: 'mine_wood',
  crys: 'mine_crystals', crgr: 'mine_crystals', crdr: 'mine_crystals', crsu: 'mine_crystals',
  gem: 'mine_gemstones', ger: 'mine_gemstones', ged: 'mine_gemstones',
  sulf: 'alchemy_lab', alc: 'alchemy_lab',
}
const ABANDONED_MINE_SID = 'campaign_M2_empty_mine'

const CREATURE_GENERATOR_ANIMATION_SID: Record<string, string> = {
  'avgpike0.def': 'barracks_human_1', 'avgcros0.def': 'barracks_human_2', 'avggrff0.def': 'barracks_human_3',
  'avgswor0.def': 'barracks_human_4', 'avgmonk0.def': 'barracks_human_5', 'avgcavl0.def': 'barracks_human_6',
  'avgangl0.def': 'barracks_human_7',
}

/** Template id → stock sid, no further logic needed. */
const DIRECT_TEMPLATE_SID: Record<number, string> = {
  [h3obj.OBJECT_TREASURE_CHEST]: 'chest',
  [h3obj.OBJECT_CAMPFIRE]: 'camp_fire',
  [h3obj.OBJECT_RANDOM_RESOURCE]: 'random-res',
  [h3obj.OBJECT_SUBTERRANEAN_GATE]: 'portal_5',
  [h3obj.OBJECT_WHIRLPOOL]: 'portal_magic',
  [h3obj.OBJECT_RANDOM_TOWN]: 'random-city',
  [h3obj.OBJECT_RANDOM_ARTIFACT]: 'random-item',
  [h3obj.OBJECT_RANDOM_ARTIFACT_TREASURE]: 'random-item',
  [h3obj.OBJECT_RANDOM_ARTIFACT_MINOR]: 'random-item',
  [h3obj.OBJECT_RANDOM_ARTIFACT_MAJOR]: 'random-item',
  [h3obj.OBJECT_RANDOM_ARTIFACT_RELIC]: 'random-item',
  [h3obj.OBJECT_MONSTER]: 'random-squad',
  71: 'random-squad', 72: 'random-squad', 73: 'random-squad', 74: 'random-squad', 75: 'random-squad',
  162: 'random-squad', 163: 'random-squad', 164: 'random-squad',
  11: 'quixs_path', 28: 'fairy_ring', 31: 'fountain', 37: 'watchtower', 38: 'fountain', 42: 'watchtower',
  60: 'watchtower', 61: 'altar_of_magic_1', 64: 'quixs_path', 80: 'altar_of_magic_1',
  [h3obj.OBJECT_SHRINE_INCANTATION]: 'scroll_box',
  [h3obj.OBJECT_SHRINE_GESTURE]: 'enchanted_scroll_box',
  [h3obj.OBJECT_SHRINE_THOUGHT]: 'mythic_scroll_box',
}

function animationTokenMatch(animation: string, table: Record<string, string>): string | null {
  const lowered = animation.toLowerCase()
  for (const [token, sid] of Object.entries(table)) {
    if (lowered.includes(token)) return sid
  }
  return null
}

export type ObjectKind = 'town' | 'portal' | 'resource' | 'mine' | 'dwelling' | 'artifact' | 'random_squad' | 'interactable' | 'map_event' | 'scenery'

export type ObjectResolution =
  | { action: 'omit'; reason: string }
  | { action: 'emit'; sid: string; kind: ObjectKind; reason: string; factionSid?: string; freeChoice?: boolean }

/** Resolve any H3 object (not just scenery) to a stock OE sid, in the same
 *  priority order as the reference's `resolve_object_sid`: an explicit omit,
 *  then town/monolith/resource/mine/creature-generator/direct-template
 *  tables, falling through to the scenery role+biome table (Phase 1) last. */
export function resolveObjectSid(
  templateObjectId: number, templateAnimation: string, templateSubtype: number, h3TerrainAtTile: number,
): ObjectResolution {
  const oid = templateObjectId
  const anim = templateAnimation || ''
  const subtype = templateSubtype || 0

  if (oid in OMIT_OBJECT_IDS) return { action: 'omit', reason: OMIT_OBJECT_IDS[oid] }

  if (oid === h3obj.OBJECT_ARTIFACT) {
    return { action: 'emit', sid: 'random-item', kind: 'artifact', reason: 'lossy_specific_h3_artifact_to_stock_random_item' }
  }

  if (oid === h3obj.OBJECT_TOWN) {
    if (H3_TOWN_SUBTYPE_FREE_CHOICE.has(subtype)) {
      return { action: 'emit', sid: 'random-city', kind: 'town', factionSid: '', freeChoice: true, reason: 'unmapped_h3_town_subtype_free_choice' }
    }
    const stock = H3_TOWN_SUBTYPE_TO_STOCK[subtype]
    if (!stock) return { action: 'omit', reason: `unsupported_town_subtype_${subtype}` }
    return { action: 'emit', sid: stock[0], kind: 'town', factionSid: stock[1], freeChoice: false, reason: 'lossy_h3_town_subtype_to_stock_city' }
  }

  if (oid === h3obj.OBJECT_TWO_WAY_MONOLITH) {
    const sid = MONOLITH_TWO_WAY_ANIMATION_SID[anim.toLowerCase()]
    if (!sid) return { action: 'omit', reason: `unmapped_monolith_animation_${anim}` }
    return { action: 'emit', sid, kind: 'portal', reason: 'monolith_animation_exact' }
  }

  if (oid === h3obj.OBJECT_RESOURCE) {
    const sid = animationTokenMatch(anim, RESOURCE_ANIMATION_TOKEN_SID) ?? 'resource_gold'
    return { action: 'emit', sid, kind: 'resource', reason: 'resource_animation_token' }
  }

  if (oid === h3obj.OBJECT_ABANDONED_MINE) {
    return { action: 'emit', sid: ABANDONED_MINE_SID, kind: 'mine', reason: 'abandoned_mine_stock_empty_mine' }
  }

  if (oid === h3obj.OBJECT_MINE) {
    const sid = MINE_SUBTYPE_SID[subtype]
      ?? MINE_ANIMATION_EXACT_SID[anim.toLowerCase()]
      ?? animationTokenMatch(anim, MINE_ANIMATION_TOKEN_SID)
    if (!sid) return { action: 'omit', reason: `unmapped_mine_subtype_${subtype}` }
    return { action: 'emit', sid, kind: 'mine', reason: 'mine_subtype_or_animation' }
  }

  // Monster strength-budget gating (omit unknown/HotA-only creature types)
  // needs the neutral-strength model — deferred to Phase 3; every monster
  // resolves to an uncalibrated random-squad for now.
  if (h3obj.FIXED_CREATURE_GENERATOR_IDS.has(oid)) {
    const sid = CREATURE_GENERATOR_ANIMATION_SID[anim.toLowerCase()] ?? 'barracks_human_1'
    return { action: 'emit', sid, kind: 'dwelling', reason: 'creature_generator_animation_to_stock_barracks' }
  }

  if (oid in DIRECT_TEMPLATE_SID) {
    const sid = DIRECT_TEMPLATE_SID[oid]
    let kind: ObjectKind = sid.startsWith('portal') ? 'portal' : 'interactable'
    if (oid === h3obj.OBJECT_EVENT) kind = 'map_event'
    if (sid === 'random-squad') kind = 'random_squad'
    // The 5 random-artifact-class ids (65-69) route through this same
    // direct table (all resolving to 'random-item') — found missing by
    // validate-map.ts's random-item<->propRandomItems bijection check,
    // which flagged real converted maps with random-item instances that
    // never got a rarity row because this fell through to 'interactable'.
    if (sid === 'random-item') kind = 'artifact'
    if (sid === 'random-city') return { action: 'emit', sid, kind: 'town', factionSid: '', freeChoice: true, reason: 'direct_template_random_city_free_choice' }
    return { action: 'emit', sid, kind, reason: 'direct_template_sid' }
  }

  const scenery = resolveSceneryObjectSid(oid, anim, h3TerrainAtTile)
  if (scenery) return { action: 'emit', sid: scenery.sid, kind: 'scenery', reason: 'scenery_role_or_animation' }

  return { action: 'omit', reason: `unmapped_template_object_id_${oid}` }
}
