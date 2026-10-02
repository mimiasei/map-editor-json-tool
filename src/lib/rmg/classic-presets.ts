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

export interface ClassicSettings {
  richness: RmgRichness
  complexity: RmgComplexity
  water: RmgWaterLevel
}

export const DEFAULT_CLASSIC_SETTINGS: ClassicSettings = { richness: 'medium', complexity: 'medium', water: 'some' }

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
  }
}

/** Random value within [lo%, hi%] of the slider's own min..max range. */
export function randomInSliderBand(min: number, max: number, loPct: number, hiPct: number, rng: () => number): number {
    const t = loPct + rng() * (hiPct - loPct)
    return min + t * (max - min)
}
