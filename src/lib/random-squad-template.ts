// ─── "Random" squad for SpawnSquad / SpawnSquadNPC ────────────────────────────
// The game only takes a squad template sid there (guide: "only squads from a prepared set"), so the editor's "Random" choice is resolved to a
// real template when the scenario leaves the editor (cleanScenarioForGame). The pick is seeded from the action's own values so a re-export gives
// the same squad. Which template fits a value follows the template's requiredValue/maxValue/rollChance, the same approximation as rollExampleSquad.

import type { GameCatalog } from '@/lib/catalog/types'

export const RANDOM_SQUAD_SID = 'random'

// Campaign-only templates (squad_c_*, squad_M5_*) are not meant for custom maps.
const CAMPAIGN_TEMPLATE = /^squad_(c|m[0-9]+)_/i

function hash(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  return (h >>> 0) / 4294967296
}

/** A squad template sid for `value`, weighted by rollChance. Undefined when the catalog has no squad templates. */
export function pickRandomSquadTemplate(catalog: GameCatalog | null, value: number, seed: string): string | undefined {
  const all = (catalog?.squadTemplates ?? []).filter((t) => t.rollChance > 0 && !CAMPAIGN_TEMPLATE.test(t.id))
  if (all.length === 0) return undefined
  const fitting = all.filter((t) => t.requiredValue <= value && value <= t.maxValue)
  const pool = fitting.length > 0 ? fitting : all
  let roll = hash(seed) * pool.reduce((sum, t) => sum + t.rollChance, 0)
  for (const t of pool) {
    roll -= t.rollChance
    if (roll < 0) return t.id
  }
  return pool[pool.length - 1].id
}

/** Initial values for a new condition/action: blank, except the squad picker, which starts on Random. */
export function defaultParamValues(params: { squadSid?: true }[]): string[] {
  return params.map((param) => (param.squadSid ? RANDOM_SQUAD_SID : ''))
}
