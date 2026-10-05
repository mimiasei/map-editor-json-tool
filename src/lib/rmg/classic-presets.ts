// ─── RMG "Classic" mode presets (issue #250) ────────────────────────────────
// Three word-labelled selectors that stand in for the ~30 Advanced sliders.
// Classic and Advanced are either-or: the dialog resolves a Classic choice to
// the same options Advanced sliders would produce (everything not controlled
// here stays at `DEFAULT_TEMPLATE_OVERRIDES`), so nothing downstream knows
// which mode was used.

import { DEFAULT_TEMPLATE_OVERRIDES } from './template'
import { DEFAULT_LONE_GUARD_CHANCE, DEFAULT_RIVER_CHANCE_PER_ZONE, DEFAULT_RIVER_CLIFF_CLEARANCE, DEFAULT_RIVER_MEANDER, DEFAULT_RIVER_MOUTH_WIDENING, DEFAULT_RIVER_CONFLUENCE_CHANCE, DEFAULT_RIVER_BANK_DENSITY, DEFAULT_MINE_DISTRIBUTION, EMPTY_TUNING, type RmgTuning } from './rmg-tuning'
import { MIN_ELEVATION_SPAN } from './zone-elevation'
import type { RmgSchema } from './rmg-schema'
import { LAYOUT_ARCHETYPES } from './zone-archetypes'

export type RmgRichness = 'poor' | 'modest' | 'medium' | 'rich' | 'very_rich'
export type RmgComplexity = 'sparse' | 'light' | 'medium' | 'dense' | 'very_dense'
export type RmgWaterLevel = 'none' | 'few' | 'some' | 'many' | 'islands'

/** `pool` is the real `content_pool_general_resources_treasure_zone_<pool>`
 *  suffix (the data has zero/poor/medium/rich only — no `very_poor`/
 *  `very_rich`, confirmed in Core/generator/content_pools), `tier` the real
 *  `template_pool_random_t<tier>_base` building-value tier (0-5). The five
 *  steps spread both across their real ranges. */
export const RICHNESS_LEVELS: { id: RmgRichness; label: string; pool: 'poor' | 'medium' | 'rich'; tier: number }[] = [
  { id: 'poor', label: 'Poor', pool: 'poor', tier: 0 },
  { id: 'modest', label: 'Modest', pool: 'poor', tier: 1 },
  { id: 'medium', label: 'Medium', pool: 'medium', tier: 2 },
  { id: 'rich', label: 'Rich', pool: 'rich', tier: 4 },
  { id: 'very_rich', label: 'Very rich', pool: 'rich', tier: 5 },
]

/** Multiplier applied to the default decoration/interactable/treasure/squad
 *  densities. */
export const COMPLEXITY_LEVELS: { id: RmgComplexity; label: string; scale: number }[] = [
  { id: 'sparse', label: 'Sparse', scale: 0.4 },
  { id: 'light', label: 'Light', scale: 0.7 },
  { id: 'medium', label: 'Medium', scale: 1 },
  { id: 'dense', label: 'Dense', scale: 1.4 },
  { id: 'very_dense', label: 'Very dense', scale: 1.8 },
]

export const WATER_LEVELS: { id: RmgWaterLevel; label: string; waterContent: 'none' | 'normal' | 'islands'; waterChance: number }[] = [
  { id: 'none', label: 'None', waterContent: 'none', waterChance: 0 },
  { id: 'few', label: 'Few lakes', waterContent: 'normal', waterChance: 0.15 },
  { id: 'some', label: 'Some lakes', waterContent: 'normal', waterChance: 0.4 },
  { id: 'many', label: 'Many lakes', waterContent: 'normal', waterChance: 0.8 },
  { id: 'islands', label: 'Islands', waterContent: 'islands', waterChance: 0.4 },
]

export type RmgDifficulty = 'easy' | 'normal' | 'hard' | 'impossible' | 'deadly' | 'hell'

/** The game's six difficulty levels, in order — the array index is the
 *  difficulty index the game's RMG schema conditions on (0-5,
 *  `RmgSchema.difficulties`) and the GME mod sends as `--difficulty`. Names
 *  from Core.zip `DB/difficulties_lobby.json`. Level 0 is this generator's
 *  own calibrated guard strength; higher levels scale it up. */
export const DIFFICULTY_LEVELS: { id: RmgDifficulty; label: string }[] = [
  { id: 'easy', label: 'Easy' },
  { id: 'normal', label: 'Normal' },
  { id: 'hard', label: 'Hard' },
  { id: 'impossible', label: 'Impossible' },
  { id: 'deadly', label: 'Deadly' },
  { id: 'hell', label: 'Hell' },
]

export function difficultyIndex(difficulty: RmgDifficulty): number {
  return Math.max(0, DIFFICULTY_LEVELS.findIndex((d) => d.id === difficulty))
}

export interface ClassicSettings {
  richness: RmgRichness
  complexity: RmgComplexity
  difficulty: RmgDifficulty
  water: RmgWaterLevel
}

export const DEFAULT_CLASSIC_SETTINGS: ClassicSettings = { richness: 'medium', complexity: 'medium', difficulty: 'normal', water: 'some' }

/** Slider maxima in GenerateRandomMapDialog — a scaled value never exceeds
 *  what the Advanced slider itself could set. */
const MAX_OBSTACLE = 1
const MAX_INTERACTABLE = 0.4
const MAX_TREASURE = 3
const MAX_SQUAD = 1

export function resolveClassicSettings(settings: ClassicSettings, tuning: RmgTuning = EMPTY_TUNING): {
  waterContent: 'none' | 'normal' | 'islands'
  waterChance: number
  obstacleDensity: number
  interactableDensity: number
  treasureDensity: number
  squadDensity: number
  richness: RmgRichness
  difficulty: RmgDifficulty
} {
  const d = DEFAULT_TEMPLATE_OVERRIDES
  const scale = tuning.complexity[settings.complexity]?.scale ?? COMPLEXITY_LEVELS.find((c) => c.id === settings.complexity)?.scale ?? 1
  const water = WATER_LEVELS.find((w) => w.id === settings.water) ?? WATER_LEVELS[2]
  return {
    waterContent: water.waterContent,
    waterChance: tuning.water[water.id]?.waterChance ?? water.waterChance,
    obstacleDensity: Math.min(MAX_OBSTACLE, d.obstacleDensity * scale),
    interactableDensity: Math.min(MAX_INTERACTABLE, d.interactableDensity * scale),
    treasureDensity: Math.min(MAX_TREASURE, d.treasureDensity * scale),
    squadDensity: Math.min(MAX_SQUAD, d.squadDensity * scale),
    richness: settings.richness,
    difficulty: settings.difficulty,
  }
}

const DEFAULT_VALLEY_CHANCE_MAX = 0.05

/** A richness level's content pool and building tier, with tuning applied. */
export function resolveRichness(id: RmgRichness, tuning: RmgTuning = EMPTY_TUNING): { pool: 'poor' | 'medium' | 'rich'; tier: number } {
  const base = RICHNESS_LEVELS.find((r) => r.id === id) ?? RICHNESS_LEVELS[2]
  const t = tuning.richness[id]
  return { pool: t?.pool ?? base.pool, tier: t?.tier ?? base.tier }
}

/** Every tunable value as it is without a tuning file — written to
 *  rmg-tuning.defaults.json (rmg-tuning.ts) as the reference for what can be
 *  overridden. `schema` supplies the elevation layouts and difficulty values
 *  (the game's, or the built-in copy). */
export function buildTuningDefaults(schema: RmgSchema, treasureGuardShare: number) {
  return {
    _about: 'Reference only — this file is rewritten by the Scenario Editor on every map generation. Copy any values into rmg-tuning.json (same folder) to override them; every key there is optional. Keys starting with _ are comments.',
    complexity: Object.fromEntries(COMPLEXITY_LEVELS.map((c) => [c.id, { scale: c.scale }])),
    richness: Object.fromEntries(RICHNESS_LEVELS.map((r) => [r.id, { pool: r.pool, tier: r.tier }])),
    water: Object.fromEntries(WATER_LEVELS.map((w) => [w.id, { waterChance: w.waterChance }])),
    elevation: {
      _schemaSource: schema.source === 'game' ? 'zoneLayouts read from the game (map_schemas/Default.mrmg.json)' : 'zoneLayouts: built-in copy of the game values',
      valleyChanceMax: DEFAULT_VALLEY_CHANCE_MAX,
      minAreaSpan: MIN_ELEVATION_SPAN,
      zoneLayouts: schema.zoneLayouts,
    },
    difficulty: Object.fromEntries(DIFFICULTY_LEVELS.map((d, i) => [d.id, schema.difficulties[i]])),
    mines: {
      _about: 'Mines per neutral zone = round(zone tiles / tilesPerMine), clamped to min..max; types drawn by these relative weights without repeats until every type was used. Player zones always get wood + ore, plus one extra mine with extraMineChance (the same for every player), its type by playerExtraTypeWeights. Defaults come from the game\'s own maps (6-13 mines per player, ~40% gemstones/crystals/mercury).',
      ...DEFAULT_MINE_DISTRIBUTION,
    },
    rivers: {
      _about: 'chancePerZone (0-1): each land zone\'s chance of adding one river to the map (0 = no rivers). A river starts at a mountain on a hill, falls off it once (waterfall) and runs on level ground to a lake or the map edge; without a big enough hill it runs between lakes/map edges. meander (0-1): how strongly rivers wind (0 = nearly straight). cliffClearance (0-6): tiles a river keeps from hills and cliff walls, so it never runs along a cliff foot with a row of waterfalls (0 = no rule). mouthWidening (0-1): share of a river\'s length, counted from the mouth, that is made wider with side tiles (0 = always 1 tile wide). confluenceChance (0-1): chance that a new river flows into an earlier river as a tributary instead of running on to a lake or the map edge (0 = rivers never join). bankDecoration (0-1): average chance per tile next to a river of a walkable stone, tuft or reed; it comes in clumps (0 = bare banks).',
      chancePerZone: DEFAULT_RIVER_CHANCE_PER_ZONE,
      meander: DEFAULT_RIVER_MEANDER,
      cliffClearance: DEFAULT_RIVER_CLIFF_CLEARANCE,
      mouthWidening: DEFAULT_RIVER_MOUTH_WIDENING,
      confluenceChance: DEFAULT_RIVER_CONFLUENCE_CHANCE,
      bankDecoration: DEFAULT_RIVER_BANK_DENSITY,
    },
    layout: {
      _about:'Relative chance of each zone layout per map (0 disables one). ring: players and neutral zones alternate on one ring; ringCenter: ring plus a richer treasure zone in the middle; innerRing: players outside, neutral zones in an inner ring; doubleNeutral: two neutral zones between neighbours; pockets: ring plus a dead-end treasure pocket per player; hub: every player has a spoke to a shared center. Some layouts are only used up to a player count (doubleNeutral, pockets, hub: 4; innerRing: 7) or on maps big enough for their zones; otherwise ring is used.',
      weights: Object.fromEntries(LAYOUT_ARCHETYPES.map((a) => [a, 1])),
    },
    guards: {
      _about: 'Chance (0-1) that a guard is placed on the object\'s entrance tile (preferably the one straight in front of it), blocking it. Every object with an entrance keeps one entrance tile free for this, and guards are decided after all objects are placed, so this covers every interactable (also those from the interactables scatter). dwelling includes random dwellings (random-hire), artifact includes random items (random-item). null = built-in behavior: mines in neutral zones are always guarded; mines in player zones and dwelling..artifact follow complexity (the guard squad density: sparse 0.18, light 0.32, medium 0.45, dense 0.63, very_dense 0.81); randomCity follows difficulty.cityGuardChance. chanceBySid overrides a category for one object sid (e.g. "windmill"). loneGuardChancePerZone: chance per neutral zone of one guard standing on its own, at least 6 tiles from any object entrance.',
      chance: {
        mine: null, dwelling: null, resource: null,
        interactableCommon: null, interactableUncommon: null, interactableRare: null,
        artifact: null, treasure: Math.round(treasureGuardShare * 1000) / 1000, randomCity: null,
      },
      chanceBySid: {},
      loneGuardChancePerZone: DEFAULT_LONE_GUARD_CHANCE,
    },
  }
}

/** Random value within [lo%, hi%] of the slider's own min..max range. */
export function randomInSliderBand(min: number, max: number, loPct: number, hiPct: number, rng: () => number): number {
    const t = loPct + rng() * (hiPct - loPct)
    return min + t * (max - min)
}

/** Classic mode's full option set: the resolved presets plus the per-
 *  generation random terrain-feel values. Takes the generation's own `rng`
 *  so a seeded run reproduces a Classic map exactly (these randoms used to
 *  be drawn from `Math.random` regardless of the seed). Shared by the
 *  dialog and the headless CLI path (issue #258). */
export function buildClassicOptions(settings: ClassicSettings, rng: () => number, tuning: RmgTuning = EMPTY_TUNING) {
  // Elevation like the game's RMG: hills follow its per-zone layouts
  // (`gameElevationLayouts`, map_schemas/Default.mrmg.json — `hillChance` just
  // enables them). The game itself never lowers ground, and hand-crafted maps
  // rarely do, so valleys stay rare (0-5%).
  const valleyChance = rng() * (tuning.elevation.valleyChanceMax ?? DEFAULT_VALLEY_CHANCE_MAX)
  return {
    ...DEFAULT_TEMPLATE_OVERRIDES,
    ...resolveClassicSettings(settings, tuning),
    tuning,
    zoneJaggedness: randomInSliderBand(0, 1, 0, 0.70, rng),
    zoneSpread: randomInSliderBand(0.5, 1.8, 0.10, 1.0, rng),
    organicTerrainBlending: randomInSliderBand(0, 1, 0, 0.50, rng),
    hillChance: 1,
    valleyChance,
    gameElevationLayouts: true,
    disabledInteractableSids: [] as string[],
  }
}
