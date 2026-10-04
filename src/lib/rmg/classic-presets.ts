// ─── RMG "Classic" mode presets (issue #250) ────────────────────────────────
// Three word-labelled selectors that stand in for the ~30 Advanced sliders.
// Classic and Advanced are either-or: the dialog resolves a Classic choice to
// the same options Advanced sliders would produce (everything not controlled
// here stays at `DEFAULT_TEMPLATE_OVERRIDES`), so nothing downstream knows
// which mode was used.

import { DEFAULT_TEMPLATE_OVERRIDES } from './template'

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

export function resolveClassicSettings(settings: ClassicSettings): {
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
  const scale = COMPLEXITY_LEVELS.find((c) => c.id === settings.complexity)?.scale ?? 1
  const water = WATER_LEVELS.find((w) => w.id === settings.water) ?? WATER_LEVELS[2]
  return {
    waterContent: water.waterContent,
    waterChance: water.waterChance,
    obstacleDensity: Math.min(MAX_OBSTACLE, d.obstacleDensity * scale),
    interactableDensity: Math.min(MAX_INTERACTABLE, d.interactableDensity * scale),
    treasureDensity: Math.min(MAX_TREASURE, d.treasureDensity * scale),
    squadDensity: Math.min(MAX_SQUAD, d.squadDensity * scale),
    richness: settings.richness,
    difficulty: settings.difficulty,
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
export function buildClassicOptions(settings: ClassicSettings, rng: () => number) {
  // Elevation like the game's RMG: hills follow its per-zone layouts
  // (`gameElevationLayouts`, map_schemas/Default.mrmg.json — `hillChance` just
  // enables them). The game itself never lowers ground, and hand-crafted maps
  // rarely do, so valleys stay rare (0-5%).
  const valleyChance = rng() * 0.05
  return {
    ...DEFAULT_TEMPLATE_OVERRIDES,
    ...resolveClassicSettings(settings),
    zoneJaggedness: randomInSliderBand(0, 1, 0, 0.70, rng),
    zoneSpread: randomInSliderBand(0.5, 1.8, 0.10, 1.0, rng),
    organicTerrainBlending: randomInSliderBand(0, 1, 0, 0.50, rng),
    hillChance: 1,
    valleyChance,
    gameElevationLayouts: true,
    disabledInteractableSids: [] as string[],
  }
}
