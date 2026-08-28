// ─── H3 monster count → OE random-squad requestedValue calibration ─────────
// Ported from the reference project (leviritchie/homm3-olden-stock-translator)
// `vanilla_stock/stock_neutral_strength.py` + its baked
// `h3_neutral_strength_model.json`, used with the author's explicit
// permission. The data below is generated directly from that JSON (not
// hand-transcribed — see object-map.ts's own doc comment on why that
// matters), trimmed to the fields this port actually uses.
//
// Formula: `requestedValue = round_half_up(count_or_nominal * squadValue, 50)`.
// `squadValue` is a baked snapshot of Golden-Era Core's own `h3_`-prefixed
// unit rows (ported H3 creatures in Olden's value space) — stock OE has no
// `h3_` units of its own, but its native tier medians sit close to this
// scale, so `SpawnsCreator` fills the budget with real stock units at
// roughly the right power level.

export const REQUESTED_VALUE_ROUNDING = 50.0

/** H3's own "random monster level N" tiles (`AVWmonN.def`) with no placed
 *  count use this nominal stack size per level. */
export const NOMINAL_STACK_COUNT_BY_LEVEL: Record<number, number> = {
  1: 20, 2: 20, 3: 15, 4: 10, 5: 8, 6: 7, 7: 4,
}

export const TIER_MEDIAN_SQUAD_VALUE: Record<number, number> = {
  1: 80.0, 2: 184.0, 3: 317.5, 4: 575.5, 5: 852.0, 6: 1670.0, 7: 6433.0,
}

export interface CreatureSquadValue { unitSid: string; squadValue: number; tier: number }

/** H3 concrete-monster CRTRAITS creature index (object id 54's `subtype`) →
 *  baked squad value/tier. 141 of ~157 real H3 creature types are covered;
 *  the rest (HotA-only additions, mostly) have no stock budget and should
 *  omit rather than guess (see `hasKnownCreatureType`). */
export const CREATURE_TYPE_SQUAD_VALUE: Record<number, CreatureSquadValue> = {
  0: { unitSid: 'h3_pikeman', squadValue: 80.0, tier: 1 },
  1: { unitSid: 'h3_pikeman_upg', squadValue: 115.0, tier: 1 },
  2: { unitSid: 'h3_archer', squadValue: 126.0, tier: 2 },
  3: { unitSid: 'h3_archer_upg', squadValue: 184.0, tier: 2 },
  4: { unitSid: 'h3_griffin', squadValue: 320.0, tier: 3 },
  5: { unitSid: 'h3_griffin_upg', squadValue: 340.0, tier: 3 },
  6: { unitSid: 'h3_swordsman', squadValue: 445.0, tier: 4 },
  7: { unitSid: 'h3_swordsman_upg', squadValue: 588.0, tier: 4 },
  8: { unitSid: 'h3_monk', squadValue: 582.0, tier: 5 },
  9: { unitSid: 'h3_monk_upg', squadValue: 750.0, tier: 5 },
  10: { unitSid: 'h3_cavalier', squadValue: 1946.0, tier: 6 },
  11: { unitSid: 'h3_cavalier_upg', squadValue: 2100.0, tier: 6 },
  12: { unitSid: 'h3_angel', squadValue: 5019.0, tier: 7 },
  13: { unitSid: 'h3_angel_upg', squadValue: 7600.0, tier: 7 },
  14: { unitSid: 'h3_centaur', squadValue: 100.0, tier: 1 },
  15: { unitSid: 'h3_centaur_captain', squadValue: 120.0, tier: 1 },
  16: { unitSid: 'h3_dwarf', squadValue: 138.0, tier: 2 },
  17: { unitSid: 'h3_battle_dwarf', squadValue: 190.0, tier: 2 },
  18: { unitSid: 'h3_wood_elf', squadValue: 234.0, tier: 3 },
  19: { unitSid: 'h3_grand_elf', squadValue: 331.0, tier: 3 },
  20: { unitSid: 'h3_pegasus', squadValue: 518.0, tier: 4 },
  21: { unitSid: 'h3_silver_pegasus', squadValue: 532.0, tier: 4 },
  22: { unitSid: 'h3_dendroid_guard', squadValue: 517.0, tier: 5 },
  23: { unitSid: 'h3_dendroid_soldier', squadValue: 803.0, tier: 5 },
  24: { unitSid: 'h3_unicorn', squadValue: 1806.0, tier: 6 },
  25: { unitSid: 'h3_war_unicorn', squadValue: 2030.0, tier: 6 },
  26: { unitSid: 'h3_green_dragon', squadValue: 4872.0, tier: 7 },
  27: { unitSid: 'h3_gold_dragon', squadValue: 7600.0, tier: 7 },
  28: { unitSid: 'h3_gremlin', squadValue: 44.0, tier: 1 },
  29: { unitSid: 'h3_gremlin_upg', squadValue: 66.0, tier: 1 },
  30: { unitSid: 'h3_gargoyle', squadValue: 165.0, tier: 2 },
  31: { unitSid: 'h3_gargoyle_upg', squadValue: 201.0, tier: 2 },
  32: { unitSid: 'h3_golem', squadValue: 250.0, tier: 3 },
  33: { unitSid: 'h3_golem_upg', squadValue: 330.0, tier: 3 },
  34: { unitSid: 'h3_mage', squadValue: 570.0, tier: 4 },
  35: { unitSid: 'h3_mage_upg', squadValue: 680.0, tier: 4 },
  36: { unitSid: 'h3_genie', squadValue: 884.0, tier: 5 },
  37: { unitSid: 'h3_genie_upg', squadValue: 942.0, tier: 5 },
  38: { unitSid: 'h3_naga', squadValue: 2016.0, tier: 6 },
  39: { unitSid: 'h3_naga_upg', squadValue: 2600.0, tier: 6 },
  40: { unitSid: 'h3_giant', squadValue: 3718.0, tier: 7 },
  41: { unitSid: 'h3_giant_upg', squadValue: 7500.0, tier: 7 },
  42: { unitSid: 'h3_imp', squadValue: 50.0, tier: 1 },
  43: { unitSid: 'h3_imp_upg', squadValue: 60.0, tier: 1 },
  44: { unitSid: 'h3_gog', squadValue: 159.0, tier: 2 },
  45: { unitSid: 'h3_gog_upg', squadValue: 190.0, tier: 2 },
  46: { unitSid: 'h3_hell_hound', squadValue: 357.0, tier: 3 },
  47: { unitSid: 'h3_hell_hound_upg', squadValue: 392.0, tier: 3 },
  48: { unitSid: 'h3_demon', squadValue: 445.0, tier: 4 },
  49: { unitSid: 'h3_demon_upg', squadValue: 480.0, tier: 4 },
  50: { unitSid: 'h3_pit_fiend', squadValue: 765.0, tier: 5 },
  51: { unitSid: 'h3_pit_fiend_upg', squadValue: 1224.0, tier: 5 },
  52: { unitSid: 'h3_efreeti', squadValue: 1670.0, tier: 6 },
  53: { unitSid: 'h3_efreeti_upg', squadValue: 1848.0, tier: 6 },
  54: { unitSid: 'h3_devil', squadValue: 5101.0, tier: 7 },
  55: { unitSid: 'h3_devil_upg', squadValue: 7115.0, tier: 7 },
  56: { unitSid: 'h3_skeleton', squadValue: 60.0, tier: 1 },
  57: { unitSid: 'h3_skeleton_upg', squadValue: 85.0, tier: 1 },
  58: { unitSid: 'h3_walking_dead', squadValue: 98.0, tier: 2 },
  59: { unitSid: 'h3_walking_dead_upg', squadValue: 128.0, tier: 2 },
  60: { unitSid: 'h3_wight', squadValue: 252.0, tier: 3 },
  61: { unitSid: 'h3_wight_upg', squadValue: 315.0, tier: 3 },
  62: { unitSid: 'h3_vampire', squadValue: 555.0, tier: 4 },
  63: { unitSid: 'h3_vampire_upg', squadValue: 783.0, tier: 4 },
  64: { unitSid: 'h3_lich', squadValue: 848.0, tier: 5 },
  65: { unitSid: 'h3_lich_upg', squadValue: 1079.0, tier: 5 },
  66: { unitSid: 'h3_black_knight', squadValue: 2087.0, tier: 6 },
  67: { unitSid: 'h3_black_knight_upg', squadValue: 2382.0, tier: 6 },
  68: { unitSid: 'h3_bone_dragon', squadValue: 3388.0, tier: 7 },
  69: { unitSid: 'h3_bone_dragon_upg', squadValue: 4696.0, tier: 7 },
  70: { unitSid: 'h3_troglodyte', squadValue: 59.0, tier: 1 },
  71: { unitSid: 'h3_troglodyte_upg', squadValue: 84.0, tier: 1 },
  72: { unitSid: 'h3_harpy', squadValue: 140.0, tier: 2 },
  73: { unitSid: 'h3_harpy_upg', squadValue: 238.0, tier: 2 },
  74: { unitSid: 'h3_beholder', squadValue: 315.0, tier: 3 },
  75: { unitSid: 'h3_beholder_upg', squadValue: 367.0, tier: 3 },
  76: { unitSid: 'h3_medusa', squadValue: 517.0, tier: 4 },
  77: { unitSid: 'h3_medusa_upg', squadValue: 577.0, tier: 4 },
  78: { unitSid: 'h3_minotaur', squadValue: 835.0, tier: 5 },
  79: { unitSid: 'h3_minotaur_upg', squadValue: 1068.0, tier: 5 },
  80: { unitSid: 'h3_manticore', squadValue: 1547.0, tier: 6 },
  81: { unitSid: 'h3_manticore_upg', squadValue: 1589.0, tier: 6 },
  82: { unitSid: 'h3_red_dragon', squadValue: 4702.0, tier: 7 },
  83: { unitSid: 'h3_red_dragon_upg', squadValue: 7600.0, tier: 7 },
  84: { unitSid: 'h3_goblin', squadValue: 60.0, tier: 1 },
  85: { unitSid: 'h3_goblin_upg', squadValue: 78.0, tier: 1 },
  86: { unitSid: 'h3_wolf_rider', squadValue: 130.0, tier: 2 },
  87: { unitSid: 'h3_wolf_rider_upg', squadValue: 203.0, tier: 2 },
  88: { unitSid: 'h3_orc', squadValue: 192.0, tier: 3 },
  89: { unitSid: 'h3_orc_upg', squadValue: 240.0, tier: 3 },
  90: { unitSid: 'h3_ogre', squadValue: 416.0, tier: 4 },
  91: { unitSid: 'h3_ogre_upg', squadValue: 672.0, tier: 4 },
  92: { unitSid: 'h3_roc', squadValue: 1027.0, tier: 5 },
  93: { unitSid: 'h3_roc_upg', squadValue: 1106.0, tier: 5 },
  94: { unitSid: 'h3_cyclops', squadValue: 1266.0, tier: 6 },
  95: { unitSid: 'h3_cyclops_upg', squadValue: 1443.0, tier: 6 },
  96: { unitSid: 'h3_behemoth', squadValue: 3162.0, tier: 7 },
  97: { unitSid: 'h3_behemoth_upg', squadValue: 6168.0, tier: 7 },
  98: { unitSid: 'h3_gnoll', squadValue: 56.0, tier: 1 },
  99: { unitSid: 'h3_gnoll_upg', squadValue: 90.0, tier: 1 },
  100: { unitSid: 'h3_lizardman', squadValue: 130.0, tier: 2 },
  101: { unitSid: 'h3_lizardman_upg', squadValue: 185.0, tier: 2 },
  102: { unitSid: 'h3_gorgon', squadValue: 890.0, tier: 5 },
  103: { unitSid: 'h3_gorgon_upg', squadValue: 1028.0, tier: 5 },
  104: { unitSid: 'h3_serpent_fly', squadValue: 268.0, tier: 3 },
  105: { unitSid: 'h3_serpent_fly_upg', squadValue: 312.0, tier: 3 },
  106: { unitSid: 'h3_basilisk', squadValue: 552.0, tier: 4 },
  107: { unitSid: 'h3_basilisk_upg', squadValue: 650.0, tier: 4 },
  108: { unitSid: 'h3_wyvern', squadValue: 1350.0, tier: 6 },
  109: { unitSid: 'h3_wyvern_upg', squadValue: 1518.0, tier: 6 },
  110: { unitSid: 'h3_hydra', squadValue: 4120.0, tier: 7 },
  111: { unitSid: 'h3_hydra_upg', squadValue: 5931.0, tier: 7 },
  112: { unitSid: 'h3_air_elemental', squadValue: 170.0, tier: 2 },
  113: { unitSid: 'h3_earth_elemental', squadValue: 330.0, tier: 5 },
  114: { unitSid: 'h3_fire_elemental', squadValue: 345.0, tier: 4 },
  115: { unitSid: 'h3_water_elemental', squadValue: 315.0, tier: 3 },
  116: { unitSid: 'h3_golem', squadValue: 250.0, tier: 3 },
  117: { unitSid: 'h3_golem_upg', squadValue: 330.0, tier: 3 },
  118: { unitSid: 'h3_pixie', squadValue: 55.0, tier: 1 },
  119: { unitSid: 'h3_pixie_upg', squadValue: 95.0, tier: 1 },
  120: { unitSid: 'h3_psychic_elemental', squadValue: 1669.0, tier: 6 },
  121: { unitSid: 'h3_psychic_elemental_upg', squadValue: 2012.0, tier: 6 },
  123: { unitSid: 'h3_water_elemental_upg', squadValue: 340.0, tier: 3 },
  125: { unitSid: 'h3_earth_elemental_upg', squadValue: 490.0, tier: 5 },
  127: { unitSid: 'h3_air_elemental_upg', squadValue: 190.0, tier: 2 },
  129: { unitSid: 'h3_fire_elemental_upg', squadValue: 470.0, tier: 4 },
  130: { unitSid: 'h3_firebird', squadValue: 4547.0, tier: 7 },
  131: { unitSid: 'h3_firebird_upg', squadValue: 6721.0, tier: 7 },
  132: { unitSid: 'h3_azure_dragon', squadValue: 78845.0, tier: 7 },
  133: { unitSid: 'h3_crystal_dragon', squadValue: 39338.0, tier: 7 },
  134: { unitSid: 'h3_faerie_dragon', squadValue: 30501.0, tier: 7 },
  135: { unitSid: 'h3_rust_dragon', squadValue: 26433.0, tier: 7 },
  136: { unitSid: 'h3_enchanter', squadValue: 1210.0, tier: 6 },
  137: { unitSid: 'h3_sharpshooter', squadValue: 585.0, tier: 4 },
  138: { unitSid: 'h3_neutral_halfling', squadValue: 75.0, tier: 1 },
  139: { unitSid: 'h3_peasant', squadValue: 15.0, tier: 1 },
  140: { unitSid: 'h3_boar', squadValue: 154.0, tier: 2 },
  141: { unitSid: 'h3_mummy', squadValue: 270.0, tier: 3 },
  142: { unitSid: 'h3_nomad', squadValue: 345.0, tier: 3 },
  143: { unitSid: 'h3_rogue', squadValue: 135.0, tier: 2 },
  144: { unitSid: 'h3_troll', squadValue: 1024.0, tier: 4 },
}

export function hasKnownCreatureType(creatureType: number): boolean {
  return creatureType in CREATURE_TYPE_SQUAD_VALUE
}

export function roundedRequestedValue(value: number, rounding = REQUESTED_VALUE_ROUNDING): number {
  return Math.floor(value / rounding + 0.5) * rounding
}

/** H3's typed "random monster level N" tile (`AVWmonN.def`), or `null` if
 *  this animation isn't that family. */
export function h3RandomMonsterLevel(templateAnimation: string): number | null {
  const m = /^AVWmon(\d+)\.def$/i.exec(templateAnimation || '')
  return m ? Number(m[1]) : null
}

/** SpawnsCreator budget for an H3 monster tile → stock `random-squad`.
 *  `count` is the placed stack size (0 = "use nominal for this level/tier").
 *  Returns `null` (an omit, not a guess) for a concrete creature type with
 *  no baked squad value — HotA-only or otherwise unmapped. */
export function stockRandomSquadRequestedValue(templateAnimation: string, templateObjectId: number, templateSubtype: number, count: number): number | null {
  const level = h3RandomMonsterLevel(templateAnimation)
  if (level !== null) {
    const median = TIER_MEDIAN_SQUAD_VALUE[level]
    const nominal = NOMINAL_STACK_COUNT_BY_LEVEL[level]
    if (median === undefined || nominal === undefined) return null
    const effectiveCount = count > 0 ? count : nominal
    return roundedRequestedValue(median * effectiveCount)
  }

  if (templateObjectId === 54 && templateSubtype >= 0) {
    const row = CREATURE_TYPE_SQUAD_VALUE[templateSubtype]
    if (!row) return null
    const nominal = NOMINAL_STACK_COUNT_BY_LEVEL[row.tier]
    const effectiveCount = count > 0 ? count : (nominal ?? 1)
    return roundedRequestedValue(row.squadValue * effectiveCount)
  }

  return null
}
