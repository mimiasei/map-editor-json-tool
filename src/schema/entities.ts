// ─── Entity registries ────────────────────────────────────────────────────────
// Static lists of heroes, creatures, artifacts, and interactive map objects
// sourced from Core.zip (HeroesOldenEra_Data/StreamingAssets/Core.zip).
//
// IDs are written to JSON as-is. Labels are enriched with real names and
// faction/category from the bundled JSON data files (heroes.json, units.json,
// map-objects.json). Free-text entry is always available as a fallback for
// unknown / future IDs.

import heroesData from '@/data/heroes.json'
import unitsData from '@/data/units.json'
import mapObjectsData from '@/data/map-objects.json'

export interface EntityEntry {
  id: string
  label: string
  /** Icon SID — used by CatalogIcon for thumbnail support (issue #62) */
  icon?: string
}

/** Convert a snake_case ID to Title Case for display. */
export function toTitleCase(id: string): string {
  return id
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

// ─── Lookup maps from bundled data ───────────────────────────────────────────

type HeroEntry = { sid: string; name: string; faction: string }
type UnitEntry = { sid: string; name: string; faction: string }
type MapObjectEntry = { sid: string; name: string | null; category: string | null }

const HERO_LOOKUP = new Map<string, HeroEntry>(
  (heroesData as HeroEntry[]).map((h) => [h.sid, h]),
)

const UNIT_LOOKUP = new Map<string, UnitEntry>(
  (unitsData as UnitEntry[]).map((u) => [u.sid, u]),
)

const MAP_OBJECT_LOOKUP = new Map<string, MapObjectEntry>(
  (mapObjectsData as MapObjectEntry[]).map((o) => [o.sid, o]),
)

// ─── Entry builder helpers ────────────────────────────────────────────────────

function e(id: string): EntityEntry {
  return { id, label: toTitleCase(id) }
}

function hero(id: string): EntityEntry {
  const data = HERO_LOOKUP.get(id)
  if (data) return { id, label: `${data.name} (${data.faction})` }
  return { id, label: toTitleCase(id) }
}

function unit(id: string): EntityEntry {
  const data = UNIT_LOOKUP.get(id)
  if (data) return { id, label: `${data.name} (${data.faction})` }
  return { id, label: toTitleCase(id) }
}

function mapObj(id: string): EntityEntry {
  const data = MAP_OBJECT_LOOKUP.get(id)
  if (data?.name) return { id, label: data.category ? `${data.name} (${data.category})` : data.name }
  return { id, label: toTitleCase(id) }
}

// ─── Heroes ───────────────────────────────────────────────────────────────────
// Source: DB/heroes/**/*.json
// Includes all standard multiplayer/custom-map heroes. Campaign-specific and
// tutorial heroes are included (prefixed campaign_ / tutorial_).

export const HEROES: EntityEntry[] = [
  // Demons (Hive)
  hero('demon_hero_1'), hero('demon_hero_2'), hero('demon_hero_3'), hero('demon_hero_4'),
  hero('demon_hero_5'), hero('demon_hero_6'), hero('demon_hero_7'), hero('demon_hero_8'),
  hero('demon_hero_9'), hero('demon_hero_10'), hero('demon_hero_11'), hero('demon_hero_12'),
  hero('demon_hero_13'), hero('demon_hero_14'), hero('demon_hero_15'), hero('demon_hero_16'),
  hero('demon_hero_17'), hero('demon_hero_18'),
  // Humans (Temple)
  hero('human_hero_1'), hero('human_hero_2'), hero('human_hero_3'), hero('human_hero_4'),
  hero('human_hero_5'), hero('human_hero_6'), hero('human_hero_7'), hero('human_hero_8'),
  hero('human_hero_9'), hero('human_hero_10'), hero('human_hero_11'), hero('human_hero_12'),
  hero('human_hero_13'), hero('human_hero_14'), hero('human_hero_15'), hero('human_hero_16'),
  hero('human_hero_17'), hero('human_hero_18'),
  // Dungeon
  hero('dungeon_hero_1'), hero('dungeon_hero_2'), hero('dungeon_hero_3'), hero('dungeon_hero_4'),
  hero('dungeon_hero_5'), hero('dungeon_hero_6'), hero('dungeon_hero_7'), hero('dungeon_hero_8'),
  hero('dungeon_hero_9'), hero('dungeon_hero_10'), hero('dungeon_hero_11'), hero('dungeon_hero_12'),
  hero('dungeon_hero_13'), hero('dungeon_hero_14'), hero('dungeon_hero_15'), hero('dungeon_hero_16'),
  hero('dungeon_hero_17'), hero('dungeon_hero_18'),
  // Nature (Grove)
  hero('nature_hero_1'), hero('nature_hero_2'), hero('nature_hero_3'), hero('nature_hero_4'),
  hero('nature_hero_5'), hero('nature_hero_6'), hero('nature_hero_7'), hero('nature_hero_8'),
  hero('nature_hero_9'), hero('nature_hero_10'), hero('nature_hero_11'), hero('nature_hero_12'),
  hero('nature_hero_13'), hero('nature_hero_14'), hero('nature_hero_15'), hero('nature_hero_16'),
  hero('nature_hero_17'), hero('nature_hero_18'),
  // Necros (Necropolis)
  hero('necro_hero_1'), hero('necro_hero_2'), hero('necro_hero_3'), hero('necro_hero_4'),
  hero('necro_hero_5'), hero('necro_hero_6'), hero('necro_hero_7'), hero('necro_hero_8'),
  hero('necro_hero_9'), hero('necro_hero_10'), hero('necro_hero_11'), hero('necro_hero_12'),
  hero('necro_hero_13'), hero('necro_hero_14'), hero('necro_hero_15'), hero('necro_hero_16'),
  hero('necro_hero_17'), hero('necro_hero_18'),
  // Unfrozen (Schism)
  hero('unfrozen_hero_1'), hero('unfrozen_hero_2'), hero('unfrozen_hero_3'), hero('unfrozen_hero_4'),
  hero('unfrozen_hero_5'), hero('unfrozen_hero_6'), hero('unfrozen_hero_7'), hero('unfrozen_hero_8'),
  hero('unfrozen_hero_9'), hero('unfrozen_hero_10'), hero('unfrozen_hero_11'), hero('unfrozen_hero_12'),
  hero('unfrozen_hero_13'), hero('unfrozen_hero_14'), hero('unfrozen_hero_15'), hero('unfrozen_hero_16'),
  hero('unfrozen_hero_17'), hero('unfrozen_hero_18'),
  // Campaign heroes
  e('campaign_hero_1'), e('campaign_hero_2'), e('campaign_hero_3'),
  e('campaign_hero_4'), e('campaign_hero_5'),
  e('cm_fun_hero_1'), e('cm_fun_hero_human_1'),
  e('campaign_M2_hero_sylvan'),
  e('campaign_M3_hero_temple'), e('campaign_M3_hero_undead'),
  e('campaign_M4_hero_preacher'),
  e('campaign_M4_hero_sylvan_1'), e('campaign_M4_hero_sylvan_2'), e('campaign_M4_hero_sylvan_3'),
  e('campaign_M4_hero_temple_1'), e('campaign_M4_hero_temple_2'), e('campaign_M4_hero_temple_3'),
  e('campaign_M4_hero_unfrozen'),
  e('campaign_M5_hero_undead_1'), e('campaign_M5_hero_undead_2'),
  e('campaign_M6_hero_unfrozen'),
  e('campaign_M9_hero_temple_1'), e('campaign_M9_hero_temple_2'), e('campaign_M9_hero_temple_3'),
  e('campaign_M9_hero_temple_4'), e('campaign_M9_hero_temple_5'), e('campaign_M9_hero_temple_main'),
  e('campaign_M9_hero_undead_1'), e('campaign_M9_hero_undead_2'), e('campaign_M9_hero_undead_3'),
  e('campaign_M9_hero_undead_4'), e('campaign_M9_hero_undead_ambush'), e('campaign_M9_hero_undead_main'),
  e('campaign_M9_hero_undead_npc'),
  e('campaign_M10_hero_demon_1'), e('campaign_M10_hero_demon_2'),
  e('campaign_M10_hero_demon_3'), e('campaign_M10_hero_demon_4'),
  e('campaign_M10_hero_demon_generic_1'), e('campaign_M10_hero_demon_generic_2'),
  e('campaign_M10_hero_demon_generic_3'), e('campaign_M10_hero_demon_generic_4'),
  e('campaign_M10_hero_demon_generic_5'), e('campaign_M10_hero_demon_generic_6'),
  // Tutorial heroes
  e('tutorial_hero_1'), e('tutorial_hero_2'), e('tutorial_hero_3'), e('tutorial_hero_4'),
  e('tutorial_M_hero_1'), e('tutorial_M_hero_2'),
]

// ─── Creatures / Units ────────────────────────────────────────────────────────
// Source: DB/units/units_logics/**/*.json (filenames stripped of _l suffix)
// Base, upgraded (_upg), and alternate upgrade (_upg_alt) variants included.

export const CREATURES: EntityEntry[] = [
  // Demons (Hive)
  unit('godslayer'), unit('godslayer_upg'), unit('godslayer_upg_alt'),
  unit('hive_queen'), unit('hive_queen_upg'), unit('hive_queen_upg_alt'),
  unit('jaw'), unit('jaw_upg'), unit('jaw_upg_alt'),
  unit('lava_larva'),
  unit('locust'), unit('locust_upg'), unit('locust_upg_alt'),
  unit('olgoi'), unit('olgoi_upg'), unit('olgoi_upg_alt'),
  unit('trick_demon'), unit('trick_demon_upg'), unit('trick_demon_upg_alt'),
  unit('wasp'), unit('wasp_upg'), unit('wasp_upg_alt'),
  // Dungeon
  unit('assassin'), unit('assassin_upg'), unit('assassin_upg_alt'),
  unit('black_dragon'), unit('black_dragon_upg'), unit('black_dragon_upg_alt'),
  unit('blade_dancer'), unit('blade_dancer_upg'), unit('blade_dancer_upg_alt'),
  unit('hydra'), unit('hydra_upg'), unit('hydra_upg_alt'),
  unit('medusa'), unit('medusa_upg'), unit('medusa_upg_alt'),
  unit('minos'), unit('minos_upg'), unit('minos_upg_alt'),
  unit('trogl'), unit('trogl_upg'), unit('trogl_upg_alt'),
  // Humans (Temple)
  unit('angel'), unit('angel_upg'), unit('angel_upg_alt'),
  unit('crossbowman'), unit('crossbowman_upg'), unit('crossbowman_upg_alt'),
  unit('esquire'), unit('esquire_upg'), unit('esquire_upg_alt'),
  unit('griffin'), unit('griffin_upg'), unit('griffin_upg_alt'),
  unit('inquisitor'), unit('inquisitor_upg'), unit('inquisitor_upg_alt'),
  unit('lightweaver'), unit('lightweaver_upg'), unit('lightweaver_upg_alt'),
  unit('sunlight_cavalry'), unit('sunlight_cavalry_upg'), unit('sunlight_cavalry_upg_alt'),
  // Nature (Grove)
  unit('aqualotl'), unit('aqualotl_upg'), unit('aqualotl_upg_alt'),
  unit('druid'), unit('druid_upg'), unit('druid_upg_alt'),
  unit('elf_tracker'), unit('elf_tracker_upg'), unit('elf_tracker_upg_alt'),
  unit('ent'), unit('ent_upg'), unit('ent_upg_alt'),
  unit('phoenix'), unit('phoenix_upg'), unit('phoenix_upg_alt'),
  unit('qilin'), unit('qilin_upg'), unit('qilin_upg_alt'),
  unit('twinkle'), unit('twinkle_upg'), unit('twinkle_upg_alt'),
  // Undead (Necropolis)
  unit('avatar_of_war'), unit('avatar_of_war_upg'), unit('avatar_of_war_upg_alt'),
  unit('flicker'), unit('flicker_upg'), unit('flicker_upg_alt'),
  unit('graverobber'), unit('graverobber_upg'), unit('graverobber_upg_alt'),
  unit('lich'), unit('lich_upg'), unit('lich_upg_alt'),
  unit('pet'), unit('pet_upg'), unit('pet_upg_alt'),
  unit('skeleton'), unit('skeleton_upg'), unit('skeleton_upg_alt'),
  unit('vampire'), unit('vampire_upg'), unit('vampire_upg_alt'),
  // Unfrozen (Schism)
  unit('arbitrator'), unit('arbitrator_upg'), unit('arbitrator_upg_alt'),
  unit('eldritch_flyer'), unit('eldritch_flyer_upg'), unit('eldritch_flyer_upg_alt'),
  unit('frostworm_rider'), unit('frostworm_rider_upg'), unit('frostworm_rider_upg_alt'),
  unit('lesser_eldritch'), unit('lesser_eldritch_upg'), unit('lesser_eldritch_upg_alt'),
  unit('succubus'), unit('succubus_upg'), unit('succubus_upg_alt'),
  unit('unfrozen_cultist'), unit('unfrozen_cultist_upg'), unit('unfrozen_cultist_upg_alt'),
  unit('unspeakable'), unit('unspeakable_upg'), unit('unspeakable_upg_alt'),
  // Neutral / Special
  unit('dragon'), unit('dragon_upg'), unit('dragon_upg_alt'),
  unit('animated_armor'),
  unit('avatar'), unit('avatar_nature'), unit('avatar_unfrozen'),
  unit('coatl'),
  unit('dragon_hunter'),
  unit('fairy_dragon'),
  unit('giant_frog'),
  unit('gnat'),
  unit('gorilla'),
  unit('halfling'),
  unit('kitten_horn'),
  unit('lich_dragon'),
  unit('mech_guard'),
  unit('peasant'), unit('peasant_normal'),
  unit('pixie'),
  unit('primal_remnant'),
  unit('sentinel'),
  unit('star_child'),
  unit('undead_peasant'),
  unit('unicorn'),
]

// ─── Artifacts ────────────────────────────────────────────────────────────────
// Source: DB/items/items/*.json (all slot categories combined)
// Scroll artifacts are included but grouped last to keep the list scannable.

export const ARTIFACTS: EntityEntry[] = [
  // Equipment — unique/rare/epic sets
  e('ancient_idol_artifact'),
  e('angelic_alliance_armor_of_wonder_artifact'),
  e('angelic_alliance_celestial_sash_of_bliss_artifact'),
  e('angelic_alliance_helm_of_heavenly_enlightenment_artifact'),
  e('angelic_alliance_lions_shield_of_courage_artifact'),
  e('angelic_alliance_sandals_of_the_saint_artifact'),
  e('angelic_alliance_sword_of_judgement_artifact'),
  e('ambassadors_word_ambassadors_sash_artifact'),
  e('ambassadors_word_diplomatic_gifts_artifact'),
  e('banner_of_four_winds_artifact'),
  e('beelzebubs_blessing_chitinous_shield_artifact'),
  e('beelzebubs_blessing_demon_claw_artifact'),
  e('beelzebubs_blessing_demon_crest_artifact'),
  e('beelzebubs_blessing_heartbeat_artifact'),
  e('boreolos_foot_artifact'),
  e('boreolos_hand_artifact'),
  e('boreolos_head_artifact'),
  e('boreolos_heart_artifact'),
  e('caduceus_artifact'),
  e('cards_deck_artifact'),
  e('catechism_of_daylight_magic_artifact'),
  e('catechism_of_night_magic_artifact'),
  e('catechism_of_primal_magic_artifact'),
  e('catechism_of_spacetime_magic_artifact'),
  e('chain_link_artifact'),
  e('chain_mail_artifact'),
  e('clothes_of_enlightenment_artifact'),
  e('crown_of_the_supreme_magi_artifact'),
  e('demonic_heart_artifact'),
  e('duelists_pride_brass_knuckles_artifact'),
  e('duelists_pride_buckler_artifact'),
  e('duelists_pride_rapier_artifact'),
  e('eagle_armor_artifact'),
  e('elixir_of_life_flask_of_oblivion_artifact'),
  e('elixir_of_life_lifeblood_fairy_artifact'),
  e('elixir_of_life_ring_of_life_artifact'),
  e('endless_bag_artifact'),
  e('ethereal_knowledge_glass_dagger_artifact'),
  e('ethereal_knowledge_mirror_shoes_artifact'),
  e('ethereal_knowledge_third_eye_artifact'),
  e('ethereal_knowledge_vortex_dress_artifact'),
  e('excalibur_artifact'),
  e('fallen_angel_wings_artifact'),
  e('fine_wand_artifact'),
  e('flag_of_truce_artifact'),
  e('garotte_artifact'),
  e('gifts_of_dwarven_lords_automated_antimagic_shield_artifact'),
  e('gifts_of_dwarven_lords_crimson_resonance_controller_artifact'),
  e('gifts_of_dwarven_lords_emerald_resonance_controller_artifact'),
  e('gifts_of_dwarven_lords_protective_belt_artifact'),
  e('golden_goose_egg_artifact'),
  e('head_torch_artifact'),
  e('holy_sigil_of_eridore_artifact'),
  e('holy_sigil_of_insara_artifact'),
  e('holy_sigil_of_mearea_artifact'),
  e('holy_sigil_of_quix_artifact'),
  e('holy_sigil_of_roph_artifact'),
  e('holy_sigil_of_the_second_man_artifact'),
  e('holy_sigil_of_the_seven_magi_artifact'),
  e('holy_sigil_of_uurdt_artifact'),
  e('hourglass_of_protection_artifact'),
  e('inner_song_fancy_mask_artifact'),
  e('inner_song_music_sheet_artifact'),
  e('inner_song_singing_pan_pipe_artifact'),
  e('keepers_fortitude_keepers_oberegus_artifact'),
  e('keepers_fortitude_keepers_ring_artifact'),
  e('knights_honor_armet_artifact'),
  e('knights_honor_drums_of_war_artifact'),
  e('knights_honor_lance_artifact'),
  e('knights_honor_misericorde_artifact'),
  e('knights_honor_plate_armor_artifact'),
  e('legions_step_artifact'),
  e('living_arrows_light_and_shade_cloak_artifact'),
  e('living_arrows_quivering_quiver_artifact'),
  e('living_arrows_shroomwood_bow_artifact'),
  e('lords_ring_artifact'),
  e('magic_key_ring_artifact'),
  e('milos_curse_golden_moth_artifact'),
  e('milos_curse_golden_pig_artifact'),
  e('milos_curse_skull_of_milos_artifact'),
  e('monster_head_artifact'),
  e('ogres_club_of_havoc_artifact'),
  e('omencaller_artifact'),
  e('orb_of_destruction_artifact'),
  e('orb_of_inhibition_artifact'),
  e('paupers_glory_dumb_club_artifact'),
  e('paupers_glory_last_coin_artifact'),
  e('paupers_glory_rags_artifact'),
  e('paupers_glory_rope_belt_artifact'),
  e('paupers_glory_straw_hat_artifact'),
  e('paupers_glory_wooden_ring_artifact'),
  e('pole_star_artifact'),
  e('power_of_the_dragon_father_dragon_crest_artifact'),
  e('power_of_the_dragon_father_dragon_scale_armor_artifact'),
  e('power_of_the_dragon_father_dragon_scale_shield_artifact'),
  e('power_of_the_dragon_father_dragon_wing_artifact'),
  e('power_of_the_dragon_father_dragonbone_greaves_artifact'),
  e('power_of_the_dragon_father_piercing_eye_of_a_dragon_artifact'),
  e('power_of_the_dragon_father_red_dragon_flame_tongue_artifact'),
  e('power_of_the_dragon_father_slithering_sash_artifact'),
  e('resonant_sphere_orb_of_daylight_artifact'),
  e('resonant_sphere_orb_of_eternity_artifact'),
  e('resonant_sphere_orb_of_twilight_artifact'),
  e('resonant_sphere_primal_orb_artifact'),
  e('ring_of_neutrality_artifact'),
  e('rule_of_shadow_liquid_silence_artifact'),
  e('rule_of_shadow_nostrias_gaze_artifact'),
  e('rule_of_shadow_the_truthmaker_artifact'),
  e('rule_of_shadow_the_truthseeker_artifact'),
  e('runestone_shards_artifact'),
  e('scholars_wisdom_scholars_oberegus_artifact'),
  e('scholars_wisdom_scholars_tiara_artifact'),
  e('seal_of_silence_artifact'),
  e('seven_league_boots_artifact'),
  e('shackles_of_war_artifact'),
  e('shadow_of_death_bone_boots_artifact'),
  e('shadow_of_death_cursed_armor_artifact'),
  e('shadow_of_death_dark_hatchet_artifact'),
  e('shadow_of_death_second_shade_artifact'),
  e('shamaniac_soul_clutching_ring_artifact'),
  e('shamaniac_soul_gemwood_mask_artifact'),
  e('shamaniac_soul_iridescent_cloak_artifact'),
  e('shamaniac_soul_shaman_staff_artifact'),
  e('shoddy_shield_artifact'),
  e('sixth_finger_artifact'),
  e('soulless_sash_artifact'),
  e('soulscaller_ring_artifact'),
  e('spellbinders_hat_artifact'),
  e('spells_in_a_bottle_artifact'),
  e('spyglass_artifact'),
  e('swamp_boots_artifact'),
  e('tactical_guide_artifact'),
  e('tarq_of_the_rampaging_ogre_artifact'),
  e('tranquility_brightmind_tiara_artifact'),
  e('tranquility_magic_mirror_artifact'),
  e('tranquility_ring_of_serenity_artifact'),
  e('tunic_of_the_cyclops_king_artifact'),
  e('two_faced_mask_artifact'),
  e('ukhtabar_seal_tabar_seal_artifact'),
  e('ukhtabar_seal_ukh_seal_artifact'),
  e('voodoosh_doll_artifact'),
  e('wanderers_way_backpack_artifact'),
  e('wanderers_way_boots_of_travel_artifact'),
  e('warlord_boots_artifact'),
  e('warriors_strength_warriors_belt_artifact'),
  e('warriors_strength_warriors_oberegus_artifact'),
  e('wizards_might_wizards_cloak_artifact'),
  e('wizards_might_wizards_oberegus_artifact'),
  // Mythic scrolls
  e('mythic_magic_scroll_artifact_neutral_magic_dimension_door'),
  e('mythic_magic_scroll_artifact_neutral_magic_light_gate'),
  e('mythic_magic_scroll_artifact_neutral_magic_pocket_dimension'),
  e('mythic_magic_scroll_artifact_neutral_magic_second_sight'),
  e('mythic_magic_scroll_artifact_neutral_magic_shadow_form'),
  e('mythic_magic_scroll_artifact_neutral_magic_town_portal'),
]

// ─── Interactive Map Objects ───────────────────────────────────────────────────
// Source: DB/objects_logic/**/*.json
// These are the object types that appear in ObjectInteractionBefore/After,
// ObjectLose, ObjectCaptureEntity, and SpawnObject action parameters.

export const MAP_OBJECTS: EntityEntry[] = [
  // Cities / towns
  mapObj('demon_city'), mapObj('dungeon_city'), mapObj('human_city'), mapObj('nature_city'),
  mapObj('necros_city'), mapObj('undead_city'), mapObj('unfrozen_city'),
  // Resource mines
  mapObj('mines'), mapObj('magic_mines'), mapObj('res_mines'),
  // Dwellings / hire
  mapObj('hires'), mapObj('random_hires'), mapObj('unit_res_trade_labs'), mapObj('unit_upgrades'),
  // Markets / trade
  mapObj('markets'), mapObj('market_items'), mapObj('item_markets'), mapObj('res_trade_labs'), mapObj('resources'), mapObj('resources_camps'),
  // Stat boosters
  mapObj('arena'), mapObj('barracks'), mapObj('forge'), mapObj('fort'), mapObj('stables'),
  mapObj('knowledge_garden'), mapObj('learning_stone'), mapObj('tree_of_knowledge'), mapObj('tree_of_abundance'),
  mapObj('college_of_wonder'), mapObj('orb_observatory'), mapObj('magic_amplifier_1'), mapObj('magic_amplifier_2'),
  mapObj('magic_amplifier_3'), mapObj('magic_amplifier_4'), mapObj('magic_wheel'),
  mapObj('stinging_sword'), mapObj('circus'), mapObj('gladiator_arena'),
  // Magic / shrine
  mapObj('altar_of_magic_1'), mapObj('altar_of_magic_2'), mapObj('altar_of_magic_3'), mapObj('altar_of_magic_4'),
  mapObj('fickle_shrine'), mapObj('sacrificial_shrine'), mapObj('mana_well'), mapObj('beer_fountain'),
  mapObj('fairy_ring'), mapObj('mysterious_stone'), mapObj('shroom_of_growth'), mapObj('circle_of_life'),
  mapObj('mystical_tower'), mapObj('black_tower'), mapObj('boreal_call'),
  // Chests / loot
  mapObj('chests'), mapObj('goblin_cache'), mapObj('pandora_box'), mapObj('scroll_box'), mapObj('enchanted_scroll_box'),
  mapObj('mythic_scroll_box'), mapObj('rewards'),
  // Info / exploration
  mapObj('crow_nest'), mapObj('watchtower'), mapObj('wind_rose'), mapObj('sea_map'),
  mapObj('insaras_eye'), mapObj('alvars_eye'), mapObj('celestial_sphere'), mapObj('tear_of_truth'),
  // Adventure
  mapObj('dragon_utopia'), mapObj('eternal_dragon'), mapObj('infernal_cirque'), mapObj('lost_library'),
  mapObj('prison'), mapObj('town_gate'), mapObj('outposts'), mapObj('portals'), mapObj('mirages'), mapObj('mirage'),
  mapObj('garrisons'), mapObj('chimerologist'), mapObj('pocket_dimension'), mapObj('remote_foothold'),
  // Special / campaign objects
  mapObj('campaign_lost_library_empty'),
  mapObj('campaign_M4_construction_site'), mapObj('campaign_M4_diary'),
  mapObj('campaign_M4_stargazer_tower'), mapObj('campaign_M4_burning_man'),
  mapObj('campaign_M9_necromancy_amplifier'), mapObj('campaign_M9_phoenix_egg'), mapObj('campaign_M9_phoenix_nest'),
  mapObj('campaign_M9_scientist_house'), mapObj('campaign_M9_sylvan_altar'),
  mapObj('campaign_flattering_mirror'), mapObj('campaign_gingerbread_house'), mapObj('campaign_shady_den'),
  mapObj('campaign_magic_altar_of_magic_1'), mapObj('campaign_magic_altar_of_magic_2'),
  mapObj('campaign_magic_altar_of_magic_3'), mapObj('campaign_magic_altar_of_magic_4'),
  mapObj('campaign_stat_1_armory_automaton'), mapObj('campaign_stat_1_knowledge_garden'),
  mapObj('campaign_stat_1_magic_wheel'), mapObj('campaign_stat_1_stinging_sword'),
  mapObj('campaign_stat_2_fort'), mapObj('campaign_stat_2_orb_observatory'),
  mapObj('campaign_stat_college_of_wonder'), mapObj('campaign_stat_maze'), mapObj('campaign_stat_trial_scales'),
  // Miscellaneous
  mapObj('abandoned_corpse'), mapObj('abandoned_mansion'), mapObj('abandoned_outpost'), mapObj('abnormal_structure'),
  mapObj('alchemy_lab'), mapObj('armory_automaton'), mapObj('camp_fire'), mapObj('crystal_trail'),
  mapObj('cursed_old_house'), mapObj('flattering_mirror'),
  mapObj('fountain'), mapObj('fountain_2'), mapObj('gardener'), mapObj('gingerbread_house'),
  mapObj('heros_crypt'), mapObj('huntsmans_camp'), mapObj('iridescent_abbey'), mapObj('jousting_range'),
  mapObj('knowledge_garden_campaign'), mapObj('legions_memorial'), mapObj('maze'), mapObj('mercenary_guild'),
  mapObj('mereas_shrine'), mapObj('monty_hall'), mapObj('overgrown_grave'), mapObj('peasant_cart'),
  mapObj('petrified_memorial'), mapObj('pile_of_books'), mapObj('point_of_balance'),
  mapObj('prismatic_lair'), mapObj('quixs_path'), mapObj('raiders_camp'), mapObj('research_laboratory'),
  mapObj('ritual_pyre'), mapObj('shady_den'), mapObj('taverns'), mapObj('testing_grounds'), mapObj('the_gorge'),
  mapObj('troglodyte_throne'), mapObj('twilight_bloom'), mapObj('uncanny_rite'), mapObj('underground_lair'),
  mapObj('unforgotten_grave'), mapObj('university'), mapObj('unstable_ruins'), mapObj('vanguard'),
  mapObj('village'), mapObj('windmill'), mapObj('wise_owl'),
]

// ─── Lookup helpers ───────────────────────────────────────────────────────────

export type EntityCategory = 'hero' | 'creature' | 'artifact' | 'mapObject' | 'spell' | 'skill' | 'buff'

export const ENTITY_REGISTRIES: Record<EntityCategory, EntityEntry[]> = {
  hero: HEROES,
  creature: CREATURES,
  artifact: ARTIFACTS,
  mapObject: MAP_OBJECTS,
  // spell, skill, buff have no hardcoded fallbacks — catalog-only
  spell: [],
  skill: [],
  buff: [],
}

export const ENTITY_LABELS: Record<EntityCategory, string> = {
  hero: 'heroes',
  creature: 'creatures',
  artifact: 'artifacts',
  mapObject: 'map objects',
  spell: 'spells',
  skill: 'skills',
  buff: 'buffs',
}
