// ─── Entity registries ────────────────────────────────────────────────────────
// Static lists of heroes, creatures, artifacts, and interactive map objects
// sourced from Core.zip (HeroesOldenEra_Data/StreamingAssets/Core.zip).
//
// IDs are written to JSON as-is. Labels are derived by converting snake_case
// to Title Case for display in the UI. Free-text entry is always available as
// a fallback for unknown / future IDs.

export interface EntityEntry {
  id: string
  label: string
}

/** Convert a snake_case ID to Title Case for display. */
export function toTitleCase(id: string): string {
  return id
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function e(id: string): EntityEntry {
  return { id, label: toTitleCase(id) }
}

// ─── Heroes ───────────────────────────────────────────────────────────────────
// Source: DB/heroes/**/*.json
// Includes all standard multiplayer/custom-map heroes. Campaign-specific and
// tutorial heroes are included (prefixed campaign_ / tutorial_).

export const HEROES: EntityEntry[] = [
  // Demons
  e('demon_hero_1'), e('demon_hero_2'), e('demon_hero_3'), e('demon_hero_4'),
  e('demon_hero_5'), e('demon_hero_6'), e('demon_hero_7'), e('demon_hero_8'),
  e('demon_hero_9'), e('demon_hero_10'), e('demon_hero_11'), e('demon_hero_12'),
  e('demon_hero_13'), e('demon_hero_14'), e('demon_hero_15'), e('demon_hero_16'),
  e('demon_hero_17'), e('demon_hero_18'),
  // Humans (Temple)
  e('human_hero_1'), e('human_hero_2'), e('human_hero_3'), e('human_hero_4'),
  e('human_hero_5'), e('human_hero_6'), e('human_hero_7'), e('human_hero_8'),
  e('human_hero_9'), e('human_hero_10'), e('human_hero_11'), e('human_hero_12'),
  e('human_hero_13'), e('human_hero_14'), e('human_hero_15'), e('human_hero_16'),
  e('human_hero_17'), e('human_hero_18'),
  // Dungeon
  e('dungeon_hero_1'), e('dungeon_hero_2'), e('dungeon_hero_3'), e('dungeon_hero_4'),
  e('dungeon_hero_5'), e('dungeon_hero_6'), e('dungeon_hero_7'), e('dungeon_hero_8'),
  e('dungeon_hero_9'), e('dungeon_hero_10'), e('dungeon_hero_11'), e('dungeon_hero_12'),
  e('dungeon_hero_13'), e('dungeon_hero_14'), e('dungeon_hero_15'), e('dungeon_hero_16'),
  e('dungeon_hero_17'), e('dungeon_hero_18'),
  // Nature (Sylvan)
  e('nature_hero_1'), e('nature_hero_2'), e('nature_hero_3'), e('nature_hero_4'),
  e('nature_hero_5'), e('nature_hero_6'), e('nature_hero_7'), e('nature_hero_8'),
  e('nature_hero_9'), e('nature_hero_10'), e('nature_hero_11'), e('nature_hero_12'),
  e('nature_hero_13'), e('nature_hero_14'), e('nature_hero_15'), e('nature_hero_16'),
  e('nature_hero_17'), e('nature_hero_18'),
  // Necros (Undead)
  e('necro_hero_1'), e('necro_hero_2'), e('necro_hero_3'), e('necro_hero_4'),
  e('necro_hero_5'), e('necro_hero_6'), e('necro_hero_7'), e('necro_hero_8'),
  e('necro_hero_9'), e('necro_hero_10'), e('necro_hero_11'), e('necro_hero_12'),
  e('necro_hero_13'), e('necro_hero_14'), e('necro_hero_15'), e('necro_hero_16'),
  e('necro_hero_17'), e('necro_hero_18'),
  // Unfrozen
  e('unfrozen_hero_1'), e('unfrozen_hero_2'), e('unfrozen_hero_3'), e('unfrozen_hero_4'),
  e('unfrozen_hero_5'), e('unfrozen_hero_6'), e('unfrozen_hero_7'), e('unfrozen_hero_8'),
  e('unfrozen_hero_9'), e('unfrozen_hero_10'), e('unfrozen_hero_11'), e('unfrozen_hero_12'),
  e('unfrozen_hero_13'), e('unfrozen_hero_14'), e('unfrozen_hero_15'), e('unfrozen_hero_16'),
  e('unfrozen_hero_17'), e('unfrozen_hero_18'),
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
  // Demons
  e('godslayer'), e('godslayer_upg'), e('godslayer_upg_alt'),
  e('hive_queen'), e('hive_queen_upg'), e('hive_queen_upg_alt'),
  e('jaw'), e('jaw_upg'), e('jaw_upg_alt'),
  e('lava_larva'),
  e('locust'), e('locust_upg'), e('locust_upg_alt'),
  e('olgoi'), e('olgoi_upg'), e('olgoi_upg_alt'),
  e('trick_demon'), e('trick_demon_upg'), e('trick_demon_upg_alt'),
  e('wasp'), e('wasp_upg'), e('wasp_upg_alt'),
  // Dungeon
  e('assassin'), e('assassin_upg'), e('assassin_upg_alt'),
  e('black_dragon'), e('black_dragon_upg'), e('black_dragon_upg_alt'),
  e('blade_dancer'), e('blade_dancer_upg'), e('blade_dancer_upg_alt'),
  e('hydra'), e('hydra_upg'), e('hydra_upg_alt'),
  e('medusa'), e('medusa_upg'), e('medusa_upg_alt'),
  e('minos'), e('minos_upg'), e('minos_upg_alt'),
  e('trogl'), e('trogl_upg'), e('trogl_upg_alt'),
  // Humans (Temple)
  e('angel'), e('angel_upg'), e('angel_upg_alt'),
  e('crossbowman'), e('crossbowman_upg'), e('crossbowman_upg_alt'),
  e('esquire'), e('esquire_upg'), e('esquire_upg_alt'),
  e('griffin'), e('griffin_upg'), e('griffin_upg_alt'),
  e('inquisitor'), e('inquisitor_upg'), e('inquisitor_upg_alt'),
  e('lightweaver'), e('lightweaver_upg'), e('lightweaver_upg_alt'),
  e('sunlight_cavalry'), e('sunlight_cavalry_upg'), e('sunlight_cavalry_upg_alt'),
  // Nature (Sylvan)
  e('aqualotl'), e('aqualotl_upg'), e('aqualotl_upg_alt'),
  e('druid'), e('druid_upg'), e('druid_upg_alt'),
  e('elf_tracker'), e('elf_tracker_upg'), e('elf_tracker_upg_alt'),
  e('ent'), e('ent_upg'), e('ent_upg_alt'),
  e('phoenix'), e('phoenix_upg'), e('phoenix_upg_alt'),
  e('qilin'), e('qilin_upg'), e('qilin_upg_alt'),
  e('twinkle'), e('twinkle_upg'), e('twinkle_upg_alt'),
  // Undead (Necros)
  e('avatar_of_war'), e('avatar_of_war_upg'), e('avatar_of_war_upg_alt'),
  e('flicker'), e('flicker_upg'), e('flicker_upg_alt'),
  e('graverobber'), e('graverobber_upg'), e('graverobber_upg_alt'),
  e('lich'), e('lich_upg'), e('lich_upg_alt'),
  e('pet'), e('pet_upg'), e('pet_upg_alt'),
  e('skeleton'), e('skeleton_upg'), e('skeleton_upg_alt'),
  e('vampire'), e('vampire_upg'), e('vampire_upg_alt'),
  // Unfrozen
  e('arbitrator'), e('arbitrator_upg'), e('arbitrator_upg_alt'),
  e('eldritch_flyer'), e('eldritch_flyer_upg'), e('eldritch_flyer_upg_alt'),
  e('frostworm_rider'), e('frostworm_rider_upg'), e('frostworm_rider_upg_alt'),
  e('lesser_eldritch'), e('lesser_eldritch_upg'), e('lesser_eldritch_upg_alt'),
  e('succubus'), e('succubus_upg'), e('succubus_upg_alt'),
  e('unfrozen_cultist'), e('unfrozen_cultist_upg'), e('unfrozen_cultist_upg_alt'),
  e('unspeakable'), e('unspeakable_upg'), e('unspeakable_upg_alt'),
  // Neutral / Special
  e('dragon'), e('dragon_upg'), e('dragon_upg_alt'),
  e('animated_armor'),
  e('avatar'), e('avatar_nature'), e('avatar_unfrozen'),
  e('coatl'),
  e('dragon_hunter'),
  e('fairy_dragon'),
  e('giant_frog'),
  e('gnat'),
  e('gorilla'),
  e('halfling'),
  e('kitten_horn'),
  e('lich_dragon'),
  e('mech_guard'),
  e('peasant'), e('peasant_normal'),
  e('pixie'),
  e('primal_remnant'),
  e('sentinel'),
  e('star_child'),
  e('undead_peasant'),
  e('unicorn'),
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
  e('demon_city'), e('dungeon_city'), e('human_city'), e('nature_city'),
  e('necros_city'), e('undead_city'), e('unfrozen_city'),
  // Resource mines
  e('mines'), e('magic_mines'), e('res_mines'),
  // Dwellings / hire
  e('hires'), e('random_hires'), e('unit_res_trade_labs'), e('unit_upgrades'),
  // Markets / trade
  e('markets'), e('market_items'), e('item_markets'), e('res_trade_labs'), e('resources'), e('resources_camps'),
  // Stat boosters
  e('arena'), e('barracks'), e('forge'), e('fort'), e('stables'),
  e('knowledge_garden'), e('learning_stone'), e('tree_of_knowledge'), e('tree_of_abundance'),
  e('college_of_wonder'), e('orb_observatory'), e('magic_amplifier_1'), e('magic_amplifier_2'),
  e('magic_amplifier_3'), e('magic_amplifier_4'), e('magic_wheel'),
  e('stinging_sword'), e('circus'), e('gladiator_arena'),
  // Magic / shrine
  e('altar_of_magic_1'), e('altar_of_magic_2'), e('altar_of_magic_3'), e('altar_of_magic_4'),
  e('fickle_shrine'), e('sacrificial_shrine'), e('mana_well'), e('beer_fountain'),
  e('fairy_ring'), e('mysterious_stone'), e('shroom_of_growth'), e('circle_of_life'),
  e('mystical_tower'), e('black_tower'), e('boreal_call'),
  // Chests / loot
  e('chests'), e('goblin_cache'), e('pandora_box'), e('scroll_box'), e('enchanted_scroll_box'),
  e('mythic_scroll_box'), e('rewards'),
  // Info / exploration
  e('crow_nest'), e('watchtower'), e('wind_rose'), e('sea_map'),
  e('insaras_eye'), e('alvars_eye'), e('celestial_sphere'), e('tear_of_truth'),
  // Adventure
  e('dragon_utopia'), e('eternal_dragon'), e('infernal_cirque'), e('lost_library'),
  e('prison'), e('town_gate'), e('outposts'), e('portals'), e('mirages'), e('mirage'),
  e('garrisons'), e('chimerologist'), e('pocket_dimension'), e('remote_foothold'),
  // Special / campaign objects
  e('campaign_lost_library_empty'),
  e('campaign_M4_construction_site'), e('campaign_M4_diary'),
  e('campaign_M4_stargazer_tower'), e('campaign_M4_burning_man'),
  e('campaign_M9_necromancy_amplifier'), e('campaign_M9_phoenix_egg'), e('campaign_M9_phoenix_nest'),
  e('campaign_M9_scientist_house'), e('campaign_M9_sylvan_altar'),
  e('campaign_flattering_mirror'), e('campaign_gingerbread_house'), e('campaign_shady_den'),
  e('campaign_magic_altar_of_magic_1'), e('campaign_magic_altar_of_magic_2'),
  e('campaign_magic_altar_of_magic_3'), e('campaign_magic_altar_of_magic_4'),
  e('campaign_stat_1_armory_automaton'), e('campaign_stat_1_knowledge_garden'),
  e('campaign_stat_1_magic_wheel'), e('campaign_stat_1_stinging_sword'),
  e('campaign_stat_2_fort'), e('campaign_stat_2_orb_observatory'),
  e('campaign_stat_college_of_wonder'), e('campaign_stat_maze'), e('campaign_stat_trial_scales'),
  // Miscellaneous
  e('abandoned_corpse'), e('abandoned_mansion'), e('abandoned_outpost'), e('abnormal_structure'),
  e('alchemy_lab'), e('armory_automaton'), e('camp_fire'), e('crystal_trail'),
  e('cursed_old_house'), e('flattering_mirror'),
  e('fountain'), e('fountain_2'), e('gardener'), e('gingerbread_house'),
  e('heros_crypt'), e('huntsmans_camp'), e('iridescent_abbey'), e('jousting_range'),
  e('knowledge_garden_campaign'), e('legions_memorial'), e('maze'), e('mercenary_guild'),
  e('mereas_shrine'), e('monty_hall'), e('overgrown_grave'), e('peasant_cart'),
  e('petrified_memorial'), e('pile_of_books'), e('point_of_balance'),
  e('prismatic_lair'), e('quixs_path'), e('raiders_camp'), e('research_laboratory'),
  e('ritual_pyre'), e('shady_den'), e('taverns'), e('testing_grounds'), e('the_gorge'),
  e('troglodyte_throne'), e('twilight_bloom'), e('uncanny_rite'), e('underground_lair'),
  e('unforgotten_grave'), e('university'), e('unstable_ruins'), e('vanguard'),
  e('village'), e('windmill'), e('wise_owl'),
]

// ─── Lookup helpers ───────────────────────────────────────────────────────────

export type EntityCategory = 'hero' | 'creature' | 'artifact' | 'mapObject'

export const ENTITY_REGISTRIES: Record<EntityCategory, EntityEntry[]> = {
  hero: HEROES,
  creature: CREATURES,
  artifact: ARTIFACTS,
  mapObject: MAP_OBJECTS,
}

export const ENTITY_LABELS: Record<EntityCategory, string> = {
  hero: 'heroes',
  creature: 'creatures',
  artifact: 'artifacts',
  mapObject: 'map objects',
}
