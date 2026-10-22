// ─── Bundled images for interactables and resources ─────────────────────────
// Rendered images (webp with alpha) in public/object-images and public/resource-images.
// They are named after the in-game display names, not the sids, so this maps sid -> file.
// Matched by comparing the file names with the `<sid>_name` tokens in Core.zip
// (Lang/english/texts/mapObjects.json); anything not listed here keeps the icon extracted
// from the game by the sidecar.

const OBJECT_FILES: Record<string, string> = {
  mine_gold: 'gold_mine',
  mine_ore: 'ore_mine',
  mine_wood: 'sawmill',
  mine_crystals: 'crystal_vein',
  mine_mercury: 'mercury_fissure',
  mine_gemstones: 'gem_mound',
  storage_gold: 'gold_storage',
  storage_ore: 'ore_storage',
  storage_wood: 'wood_storage',
  storage_crystals: 'crystal_storage',
  storage_mercury: 'mercury_storage',
  storage_gemstones: 'gem_storage',
  storage_dust: 'alchemical_storage',
  altar_of_magic_1: 'nightshade_shrine',
  altar_of_magic_2: 'daylight_shrine',
  altar_of_magic_3: 'arcane_shrine',
  altar_of_magic_4: 'primal_shrine',
  // The `*_prayer_name` tokens ("Endless Scroll of ...") belong to these four entries in 4_interactables.json.
  magic_amplifier_1: 'endless_scroll_of_silver',
  magic_amplifier_2: 'endless_scroll_of_gold',
  magic_amplifier_3: 'endless_scroll_of_platinum',
  magic_amplifier_4: 'endless_scroll_of_bronze',
  fickle_shrine: 'four_scholars_shrine',
  sacrificial_shrine: 'sacrificial_stone',
  mereas_shrine: 'meareas_altar',
  quixs_path: 'quixs_altar',
  shady_den: 'trophy_hunters_den',
  armory_automaton: 'summit_automaton',
  maze: 'living_maze',
  trial_scales: 'scales_of_worth',
  fort: 'pauper_knight_order',
  orb_observatory: 'four_scholars_observatory',
  college_of_wonder: 'mountain_monastery',
  learning_stone: 'learing_stone', // sic: the file name has the typo
  tree_of_knowledge: 'three_of_knowledge', // sic
  iridescent_abbey: 'iridicent_abbey', // sic
  forge: 'forge_of_the_second_man',
  market: 'marketplace',
  alchemy_lab: 'alchemical_lab',
  circus: 'travelling_circus',
  heros_crypt: 'tomb_of_a_nameless_hero',
  unforgotten_grave: 'tomb_of_vigilance',
  overgrown_grave: 'ancient_crypt',
  unstable_ruins: 'overgrown_vori_ruins',
  the_gorge: 'carrion_pile',
  alvars_eye: 'alvar_outpost',
  jousting_range: 'colosseum',
  prismatic_lair: 'prismatic_nest',
  arena: 'pit_of_the_glory',
  prison: 'hero_cage',
  mana_well: 'well',
  mysterious_stone: 'whispering_stone',
  tree_of_abundance: 'arborcopia',
  chimerologist: 'chimerologyst',
  monty_hall: 'the_monty_hall',
  pandora_box: 'pandora',
  // File name equals the sid.
  ...Object.fromEntries(
    [
      'stinging_sword', 'magic_wheel', 'knowledge_garden', 'beer_fountain', 'village', 'gingerbread_house',
      'university', 'fountain', 'stables', 'tavern', 'mirage', 'remote_foothold', 'goblin_cache',
      'abnormal_structure', 'boreal_call', 'petrified_memorial', 'dragon_utopia', 'black_tower',
      'abandoned_mansion', 'circle_of_life', 'uncanny_rite', 'raiders_camp', 'ritual_pyre',
      'troglodyte_throne', 'point_of_balance', 'twilight_bloom', 'research_laboratory', 'lost_library',
      'pile_of_books', 'mercenary_guild', 'legions_memorial', 'cursed_old_house',
    ].map((sid) => [sid, sid]),
  ),
}

const RESOURCE_FILES: Record<string, string> = {
  resource_gold: 'gold',
  resource_ore: 'ore',
  resource_wood: 'wood',
  resource_dust: 'dust',
  resource_mercury: 'mercury',
  resource_gemstones: 'gems',
  resource_crystals: 'crystal',
}

/** URL of the bundled image for a map object sid, or null when there is none. */
export function objectImagePath(sid: string | undefined): string | null {
  if (!sid) return null
  const base = import.meta.env.BASE_URL
  if (Object.prototype.hasOwnProperty.call(RESOURCE_FILES, sid)) return `${base}resource-images/${RESOURCE_FILES[sid]}.webp`
  if (Object.prototype.hasOwnProperty.call(OBJECT_FILES, sid)) return `${base}object-images/${OBJECT_FILES[sid]}.webp`
  return null
}
