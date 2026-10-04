// ─── The game's own RMG schema (map_schemas/Default.mrmg.json) ──────────────
// The in-game random map generator's parameters live in
// `HeroesOldenEra_Data/StreamingAssets/map_schemas/Default.mrmg.json`, next to
// (not inside) Core.zip. Two parts are used here:
//
// - Elevation: every zone class picks one `layout` (weighted — all 14 classes
//   use `zone_layout_basic` / `zone_layout_basic_plane` 10/10), and each
//   layout's `elevationModes` is a weighted pick of an elevated-fraction band.
//   The game's RMG only raises terrain — it has no valleys.
// - Difficulty (0-5): entries conditioned on `conditionsAnd.difficulties` —
//   zone guard value multiplier, border guard multiplier, zone guard weekly
//   growth, and the `BasicCity` main object's guard chance/value/growth.
//
// `parseRmgSchema` is pure; `loadRmgSchema` reads the file in the Tauri build.
// `BUILTIN_RMG_SCHEMA` is a copy of the same values (game version current as
// of 2026-10), used whenever the file can't be found or parsed.

export interface RmgElevationMode {
  weight: number
  minElevatedFraction: number
  maxElevatedFraction: number
}

export interface RmgZoneLayoutPick {
  name: string
  weight: number
  elevationModes: RmgElevationMode[]
}

export interface RmgDifficultyValues {
  /** `perProgressionPointZoneGuardValue` — multiplier on zone guard values. */
  zoneGuardMultiplier: number
  /** `borderGuardMultiplier` — multiplier on guards between zones. */
  borderGuardMultiplier: number
  /** `zoneGuardWeeklyIncrement` — guards' weekly growth bonus. */
  zoneGuardWeeklyIncrement: number
  /** `BasicCity.guardChance` — chance a neutral city gets a guard. */
  cityGuardChance: number
  /** `BasicCity.guardValue` — that guard's value. */
  cityGuardValue: number
  /** `BasicCity.guardWeeklyIncrement` — that guard's weekly growth bonus. */
  cityGuardWeeklyIncrement: number
}

export interface RmgSchema {
  source: 'game' | 'builtin'
  zoneLayouts: RmgZoneLayoutPick[]
  /** Indexed by difficulty 0-5. */
  difficulties: RmgDifficultyValues[]
}

export const RMG_DIFFICULTY_COUNT = 6

export const BUILTIN_RMG_SCHEMA: RmgSchema = {
  source: 'builtin',
  zoneLayouts: [
    {
      name: 'zone_layout_basic',
      weight: 10,
      elevationModes: [
        { weight: 10, minElevatedFraction: 0.2, maxElevatedFraction: 0.4 },
        { weight: 10, minElevatedFraction: 0.6, maxElevatedFraction: 0.8 },
      ],
    },
    {
      name: 'zone_layout_basic_plane',
      weight: 10,
      elevationModes: [
        { weight: 10, minElevatedFraction: 0, maxElevatedFraction: 0 },
        { weight: 10, minElevatedFraction: 1, maxElevatedFraction: 1 },
      ],
    },
  ],
  difficulties: [
    { zoneGuardMultiplier: 1.0, borderGuardMultiplier: 1.0, zoneGuardWeeklyIncrement: 0.05, cityGuardChance: 0.0, cityGuardValue: 1000, cityGuardWeeklyIncrement: 0 },
    { zoneGuardMultiplier: 1.1, borderGuardMultiplier: 1.1, zoneGuardWeeklyIncrement: 0.075, cityGuardChance: 0.2, cityGuardValue: 2000, cityGuardWeeklyIncrement: 0 },
    { zoneGuardMultiplier: 1.2, borderGuardMultiplier: 1.2, zoneGuardWeeklyIncrement: 0.1, cityGuardChance: 0.4, cityGuardValue: 3000, cityGuardWeeklyIncrement: 0.05 },
    { zoneGuardMultiplier: 1.3, borderGuardMultiplier: 1.3, zoneGuardWeeklyIncrement: 0.125, cityGuardChance: 0.6, cityGuardValue: 4000, cityGuardWeeklyIncrement: 0.05 },
    { zoneGuardMultiplier: 1.4, borderGuardMultiplier: 1.4, zoneGuardWeeklyIncrement: 0.15, cityGuardChance: 0.8, cityGuardValue: 5000, cityGuardWeeklyIncrement: 0.1 },
    { zoneGuardMultiplier: 1.5, borderGuardMultiplier: 1.5, zoneGuardWeeklyIncrement: 0.2, cityGuardChance: 1.0, cityGuardValue: 6000, cityGuardWeeklyIncrement: 0.1 },
  ],
}

type Json = Record<string, unknown>

interface ConditionalEntry {
  value?: unknown
  weight?: unknown
  conditionsAnd?: { difficulties?: unknown; flagOn?: unknown; flagOff?: unknown }
}

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)
const asNumber = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

/** Value of a difficulty-conditioned entry list for one difficulty. Entries
 *  gated by `flagOn` (e.g. `SingleHero`) are skipped — the default variant is
 *  the one without a flag or with `flagOff`. */
function valueForDifficulty(entries: unknown, difficulty: number): number | undefined {
  if (!Array.isArray(entries)) return undefined
  for (const e of entries as ConditionalEntry[]) {
    const cond = e?.conditionsAnd
    const diffs = cond?.difficulties
    if (!Array.isArray(diffs) || !diffs.includes(difficulty)) continue
    if (Array.isArray(cond?.flagOn) && cond.flagOn.length > 0) continue
    const value = asNumber(e.value)
    if (value !== undefined) return value
  }
  return undefined
}

function parseElevationModes(raw: unknown): RmgElevationMode[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined
  const modes: RmgElevationMode[] = []
  for (const m of raw) {
    if (!isObject(m)) return undefined
    const weight = asNumber(m.weight)
    const min = asNumber(m.minElevatedFraction)
    const max = asNumber(m.maxElevatedFraction)
    if (weight === undefined || min === undefined || max === undefined) return undefined
    modes.push({ weight, minElevatedFraction: min, maxElevatedFraction: max })
  }
  return modes
}

/** Parse the schema JSON. Each part falls back to the built-in values on its
 *  own, so one renamed field doesn't discard everything else. Returns which
 *  parts came from the file in `fromFile` for logging. */
export function parseRmgSchema(json: unknown): { schema: RmgSchema; fromFile: string[] } {
  const fromFile: string[] = []
  if (!isObject(json)) return { schema: BUILTIN_RMG_SCHEMA, fromFile }

  // Elevation: the first zone class's layout picks, resolved against zoneLayouts.
  let zoneLayouts = BUILTIN_RMG_SCHEMA.zoneLayouts
  const layoutDefs = new Map<string, RmgElevationMode[]>()
  if (Array.isArray(json.zoneLayouts)) {
    for (const l of json.zoneLayouts) {
      if (!isObject(l) || typeof l.name !== 'string') continue
      const modes = parseElevationModes(l.elevationModes)
      if (modes) layoutDefs.set(l.name, modes)
    }
  }
  const firstClass = Array.isArray(json.zoneClasses) ? json.zoneClasses.find(isObject) : undefined
  if (firstClass && Array.isArray(firstClass.layout)) {
    const picks: RmgZoneLayoutPick[] = []
    for (const p of firstClass.layout as ConditionalEntry[]) {
      const name = typeof p?.value === 'string' ? p.value : undefined
      const weight = asNumber(p?.weight)
      const modes = name ? layoutDefs.get(name) : undefined
      if (name && weight !== undefined && modes) picks.push({ name, weight, elevationModes: modes })
    }
    if (picks.length > 0) {
      zoneLayouts = picks
      fromFile.push('zoneLayouts')
    }
  }

  // Difficulty: each field independently, falling back per field.
  const city = Array.isArray(json.mainObjectClasses)
    ? (json.mainObjectClasses as unknown[]).find((m): m is Json => isObject(m) && m.name === 'BasicCity')
    : undefined
  const sources: [keyof RmgDifficultyValues, unknown, string][] = [
    ['zoneGuardMultiplier', json.perProgressionPointZoneGuardValue, 'perProgressionPointZoneGuardValue'],
    ['borderGuardMultiplier', json.borderGuardMultiplier, 'borderGuardMultiplier'],
    ['zoneGuardWeeklyIncrement', json.zoneGuardWeeklyIncrement, 'zoneGuardWeeklyIncrement'],
    ['cityGuardChance', city?.guardChance, 'BasicCity.guardChance'],
    ['cityGuardValue', city?.guardValue, 'BasicCity.guardValue'],
    ['cityGuardWeeklyIncrement', city?.guardWeeklyIncrement, 'BasicCity.guardWeeklyIncrement'],
  ]
  const difficulties = BUILTIN_RMG_SCHEMA.difficulties.map((d) => ({ ...d }))
  for (const [field, entries, label] of sources) {
    const values: number[] = []
    for (let i = 0; i < RMG_DIFFICULTY_COUNT; i++) {
      const v = valueForDifficulty(entries, i)
      if (v === undefined) break
      values.push(v)
    }
    if (values.length !== RMG_DIFFICULTY_COUNT) continue
    values.forEach((v, i) => { difficulties[i][field] = v })
    fromFile.push(label)
  }

  return {
    schema: { source: fromFile.length > 0 ? 'game' : 'builtin', zoneLayouts, difficulties },
    fromFile,
  }
}

const SCHEMA_SUFFIX = 'map_schemas/Default.mrmg.json'

/** Find and parse Default.mrmg.json (Tauri only), which sits in the same
 *  folder as Core.zip. Never throws — returns the built-in schema when
 *  nothing usable is found. */
export async function loadRmgSchema(
  coreZipPath: string | null,
): Promise<{ schema: RmgSchema; path: string | null; fromFile: string[] }> {
  const candidates: string[] = []
  if (coreZipPath) {
    const dir = coreZipPath.replace(/[\\/][^\\/]*$/, '')
    candidates.push(`${dir}/${SCHEMA_SUFFIX}`)
  }

  try {
    const { exists, readTextFile } = await import('@tauri-apps/plugin-fs')
    for (const raw of candidates) {
      const path = /^[A-Za-z]:/.test(raw) ? raw.replace(/\//g, '\\') : raw
      try {
        if (!(await exists(path))) continue
        let text = await readTextFile(path)
        if (text.startsWith('﻿')) text = text.slice(1)
        const { schema, fromFile } = parseRmgSchema(JSON.parse(text))
        return { schema, path, fromFile }
      } catch {
        // unreadable or malformed — try the next candidate
      }
    }
  } catch {
    // Tauri FS API unavailable (web build)
  }
  return { schema: BUILTIN_RMG_SCHEMA, path: null, fromFile: [] }
}
