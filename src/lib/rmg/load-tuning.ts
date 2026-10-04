// ─── Load the RMG tuning file for one generation ─────────────────────────────
// Kept apart from rmg-tuning.ts so that module stays free of the generator
// modules (no import cycle with classic-presets.ts).

import type { GameCatalog } from '@/lib/catalog/types'
import { buildTuningDefaults } from './classic-presets'
import { BUILTIN_RMG_SCHEMA } from './rmg-schema'
import { EMPTY_TUNING, loadRmgTuning, type RmgTuning } from './rmg-tuning'
import { defaultTreasureGuardShare } from './zone-population'
import { isTauri } from '@/lib/native-fs'

/** The tuning file's overrides (EMPTY_TUNING when there is none, or on the
 *  web build). Also refreshes rmg-tuning.defaults.json from `catalog`. */
export async function loadClassicTuning(catalog: GameCatalog | null): Promise<RmgTuning> {
  if (!isTauri()) return EMPTY_TUNING
  const defaults = buildTuningDefaults(catalog?.rmgSchema ?? BUILTIN_RMG_SCHEMA, defaultTreasureGuardShare(catalog ?? undefined))
  return loadRmgTuning(defaults)
}
