// ─── H3 scenery object → OE sid resolution ───────────────────────────────────
// Ported from the reference project (leviritchie/homm3-olden-stock-translator)
// `vanilla_stock/object_map.py`'s scenery-role branch (`TERRAIN_OBJECT_ROLES` /
// `BIOME_ROLE_REPLACEMENTS`) and `substitution_table.json`'s `scenery_blocker`
// rows (object id 199 only — the one H3 object family resolved by exact
// per-animation table lookup rather than role+biome), used with the author's
// explicit permission.
//
// Scope: SCENERY objects only (this phase's job). Every other H3 object id
// (towns, heroes, monsters, mines, resources, portals, quests, ...) resolves
// to `null` here — walked correctly by h3m-object-walk.ts so the byte cursor
// never desyncs, but not yet emitted onto the OE map (tracked as a named,
// deferred gap in the conversion report — see convert-h3m-to-map.ts — not a
// silent drop).

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
