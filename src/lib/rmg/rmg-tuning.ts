// ─── RMG tuning file ─────────────────────────────────────────────────────────
// Optional overrides for Classic-mode generation values, read from
// `<app data>/rmg-tuning.json` (Windows: %APPDATA%\com.oe.map-editor\) at
// every generation — so values can be tried out without rebuilding, also when
// generating from the game map editor mod. Every key is optional; a value
// that's missing, null, out of range or misspelled leaves the built-in value
// in place (and is logged). Keys starting with "_" are comments. Next to it, `rmg-tuning.defaults.json` is
// rewritten on every load with all current values as a reference.
//
// Shape (all optional):
// {
//   "complexity": { "<sparse|light|medium|dense|very_dense>": { "scale": 0.4 } },
//   "richness":   { "<poor|modest|medium|rich|very_rich>": { "pool": "poor|medium|rich", "tier": 0-5 } },
//   "water":      { "<none|few|some|many|islands>": { "waterChance": 0-1 } },
//   "elevation":  { "valleyChanceMax": 0-1, "minAreaSpan": 1-32,
//                   "zoneLayouts": [{ "name": "...", "weight": 10,
//                     "elevationModes": [{ "weight": 10, "minElevatedFraction": 0.2, "maxElevatedFraction": 0.4 }] }] },
//   "difficulty": { "<easy|normal|hard|impossible|deadly|hell>": { "zoneGuardMultiplier": 1.2, "borderGuardMultiplier": 1.2,
//                   "zoneGuardWeeklyIncrement": 0.1, "cityGuardChance": 0.4, "cityGuardValue": 3000, "cityGuardWeeklyIncrement": 0.05 } },
//   "guards": {
//     "chance": { "mine": 0-1, "dwelling": 0-1, "resource": 0-1, "interactableCommon": 0-1, "interactableUncommon": 0-1,
//                 "interactableRare": 0-1, "artifact": 0-1, "treasure": 0-1, "randomCity": 0-1 },
//     "chanceBySid": { "<object sid>": 0-1 }
//   }
// }

import { logInfo, logWarn } from '@/lib/logger'
import type { RmgDifficultyValues, RmgElevationMode, RmgSchema, RmgZoneLayoutPick } from './rmg-schema'

export const COMPLEXITY_IDS = ['sparse', 'light', 'medium', 'dense', 'very_dense'] as const
export const RICHNESS_IDS = ['poor', 'modest', 'medium', 'rich', 'very_rich'] as const
export const WATER_IDS = ['none', 'few', 'some', 'many', 'islands'] as const
export const DIFFICULTY_IDS = ['easy', 'normal', 'hard', 'impossible', 'deadly', 'hell'] as const
const RICHNESS_POOLS = ['poor', 'medium', 'rich'] as const
const DIFFICULTY_FIELDS: (keyof RmgDifficultyValues)[] = [
  'zoneGuardMultiplier', 'borderGuardMultiplier', 'zoneGuardWeeklyIncrement', 'cityGuardChance', 'cityGuardValue', 'cityGuardWeeklyIncrement',
]

/** Object categories whose guard chance can be tuned. mine..artifact are the
 *  "guard placed next to the object" rolls (zone-guard-scatter.ts, today
 *  `squadDensity` for all of them); treasure is the share of treasure slots
 *  that become guarded treasure (zone-population.ts); randomCity is the
 *  neutral city guard chance (today from the difficulty level). */
export const GUARD_CATEGORIES = [
  'mine', 'dwelling', 'resource', 'interactableCommon', 'interactableUncommon', 'interactableRare', 'artifact', 'treasure', 'randomCity',
] as const
export type GuardCategory = (typeof GUARD_CATEGORIES)[number]

export interface RmgTuning {
  complexity: Partial<Record<(typeof COMPLEXITY_IDS)[number], { scale?: number }>>
  richness: Partial<Record<(typeof RICHNESS_IDS)[number], { pool?: (typeof RICHNESS_POOLS)[number]; tier?: number }>>
  water: Partial<Record<(typeof WATER_IDS)[number], { waterChance?: number }>>
  elevation: { valleyChanceMax?: number; minAreaSpan?: number; zoneLayouts?: RmgZoneLayoutPick[] }
  difficulty: Partial<Record<(typeof DIFFICULTY_IDS)[number], Partial<RmgDifficultyValues>>>
  guards: { chance: Partial<Record<GuardCategory, number>>; chanceBySid: Record<string, number> }
}

export const EMPTY_TUNING: RmgTuning = { complexity: {}, richness: {}, water: {}, elevation: {}, difficulty: {}, guards: { chance: {}, chanceBySid: {} } }

type Json = Record<string, unknown>
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Validate a parsed tuning file. Pure: returns the usable overrides plus a
 *  warning per ignored entry. */
export function parseRmgTuning(json: unknown): { tuning: RmgTuning; warnings: string[] } {
  const warnings: string[] = []
  const tuning: RmgTuning = { complexity: {}, richness: {}, water: {}, elevation: {}, difficulty: {}, guards: { chance: {}, chanceBySid: {} } }
  if (!isObject(json)) {
    warnings.push('top level is not a JSON object — file ignored')
    return { tuning, warnings }
  }

  const num = (path: string, v: unknown, min: number, max: number): number | undefined => {
    if (v === undefined || v === null) return undefined
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) {
      warnings.push(`${path}: ${JSON.stringify(v)} is not a number in ${min}-${max} — ignored`)
      return undefined
    }
    return v
  }
  const section = (key: string): Json | undefined => {
    const v = json[key]
    if (v === undefined || v === null) return undefined
    if (!isObject(v)) { warnings.push(`${key}: not an object — ignored`); return undefined }
    return v
  }
  /** Entries of `obj` whose key is in `ids`; warns about the rest. */
  const levels = <T extends string>(path: string, obj: Json | undefined, ids: readonly T[]): [T, Json][] => {
    if (!obj) return []
    const out: [T, Json][] = []
    for (const [k, v] of Object.entries(obj)) {
      if (k.startsWith('_')) continue
      if (!(ids as readonly string[]).includes(k)) { warnings.push(`${path}.${k}: unknown key (expected ${ids.join(', ')}) — ignored`); continue }
      if (!isObject(v)) { warnings.push(`${path}.${k}: not an object — ignored`); continue }
      out.push([k as T, v])
    }
    return out
  }
  const known = (path: string, obj: Json, keys: string[]): void => {
    for (const k of Object.keys(obj)) if (!k.startsWith('_') && !keys.includes(k)) warnings.push(`${path}.${k}: unknown key — ignored`)
  }

  for (const k of Object.keys(json)) {
    if (k.startsWith('_')) continue
    if (!['complexity', 'richness', 'water', 'elevation', 'difficulty', 'guards'].includes(k)) warnings.push(`${k}: unknown section — ignored`)
  }

  for (const [id, v] of levels('complexity', section('complexity'), COMPLEXITY_IDS)) {
    known(`complexity.${id}`, v, ['scale'])
    const scale = num(`complexity.${id}.scale`, v.scale, 0, 10)
    if (scale !== undefined) tuning.complexity[id] = { scale }
  }

  for (const [id, v] of levels('richness', section('richness'), RICHNESS_IDS)) {
    known(`richness.${id}`, v, ['pool', 'tier'])
    const entry: { pool?: (typeof RICHNESS_POOLS)[number]; tier?: number } = {}
    if (v.pool !== undefined && v.pool !== null) {
      if ((RICHNESS_POOLS as readonly unknown[]).includes(v.pool)) entry.pool = v.pool as (typeof RICHNESS_POOLS)[number]
      else warnings.push(`richness.${id}.pool: ${JSON.stringify(v.pool)} is not one of ${RICHNESS_POOLS.join(', ')} — ignored`)
    }
    const tier = num(`richness.${id}.tier`, v.tier, 0, 5)
    if (tier !== undefined) {
      if (Number.isInteger(tier)) entry.tier = tier
      else warnings.push(`richness.${id}.tier: must be a whole number 0-5 — ignored`)
    }
    if (entry.pool !== undefined || entry.tier !== undefined) tuning.richness[id] = entry
  }

  for (const [id, v] of levels('water', section('water'), WATER_IDS)) {
    known(`water.${id}`, v, ['waterChance'])
    const waterChance = num(`water.${id}.waterChance`, v.waterChance, 0, 1)
    if (waterChance !== undefined) tuning.water[id] = { waterChance }
  }

  const elevation = section('elevation')
  if (elevation) {
    known('elevation', elevation, ['valleyChanceMax', 'minAreaSpan', 'zoneLayouts'])
    tuning.elevation.valleyChanceMax = num('elevation.valleyChanceMax', elevation.valleyChanceMax, 0, 1)
    const span = num('elevation.minAreaSpan', elevation.minAreaSpan, 1, 32)
    if (span !== undefined) {
      if (Number.isInteger(span)) tuning.elevation.minAreaSpan = span
      else warnings.push('elevation.minAreaSpan: must be a whole number — ignored')
    }
    if (elevation.zoneLayouts !== undefined && elevation.zoneLayouts !== null) {
      const layouts = parseZoneLayouts(elevation.zoneLayouts)
      if (layouts) tuning.elevation.zoneLayouts = layouts
      else warnings.push('elevation.zoneLayouts: expected [{ name, weight, elevationModes: [{ weight, minElevatedFraction, maxElevatedFraction }] }] with fractions 0-1 and min ≤ max — ignored')
    }
  }

  for (const [id, v] of levels('difficulty', section('difficulty'), DIFFICULTY_IDS)) {
    known(`difficulty.${id}`, v, DIFFICULTY_FIELDS)
    const entry: Partial<RmgDifficultyValues> = {}
    for (const field of DIFFICULTY_FIELDS) {
      const max = field === 'cityGuardValue' ? 1_000_000 : field.endsWith('Chance') ? 1 : 10
      const value = num(`difficulty.${id}.${field}`, v[field], 0, max)
      if (value !== undefined) entry[field] = value
    }
    if (Object.keys(entry).length > 0) tuning.difficulty[id] = entry
  }

  const guards = section('guards')
  if (guards) {
    known('guards', guards, ['chance', 'chanceBySid'])
    if (isObject(guards.chance)) {
      for (const [k, v] of Object.entries(guards.chance)) {
        if (k.startsWith('_')) continue
        if (!(GUARD_CATEGORIES as readonly string[]).includes(k)) { warnings.push(`guards.chance.${k}: unknown category (expected ${GUARD_CATEGORIES.join(', ')}) — ignored`); continue }
        const chance = num(`guards.chance.${k}`, v, 0, 1)
        if (chance !== undefined) tuning.guards.chance[k as GuardCategory] = chance
      }
    } else if (guards.chance !== undefined && guards.chance !== null) warnings.push('guards.chance: not an object — ignored')
    if (isObject(guards.chanceBySid)) {
      for (const [sid, v] of Object.entries(guards.chanceBySid)) {
        if (sid.startsWith('_')) continue
        const chance = num(`guards.chanceBySid.${sid}`, v, 0, 1)
        if (chance !== undefined) tuning.guards.chanceBySid[sid] = chance
      }
    } else if (guards.chanceBySid !== undefined && guards.chanceBySid !== null) warnings.push('guards.chanceBySid: not an object — ignored')
  }

  return { tuning, warnings }
}

function parseZoneLayouts(raw: unknown): RmgZoneLayoutPick[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined
  const layouts: RmgZoneLayoutPick[] = []
  for (const l of raw) {
    if (!isObject(l) || typeof l.weight !== 'number' || l.weight < 0 || !Array.isArray(l.elevationModes) || l.elevationModes.length === 0) return undefined
    const modes: RmgElevationMode[] = []
    for (const m of l.elevationModes) {
      if (!isObject(m)) return undefined
      const { weight, minElevatedFraction: min, maxElevatedFraction: max } = m
      if (typeof weight !== 'number' || weight < 0 || typeof min !== 'number' || typeof max !== 'number' || min < 0 || max > 1 || min > max) return undefined
      modes.push({ weight, minElevatedFraction: min, maxElevatedFraction: max })
    }
    layouts.push({ name: typeof l.name === 'string' ? l.name : `layout ${layouts.length + 1}`, weight: l.weight, elevationModes: modes })
  }
  return layouts
}

/** `schema` with the tuning's elevation layouts and per-level difficulty
 *  values applied (unset values keep the schema's). */
export function applySchemaTuning(schema: RmgSchema, tuning: RmgTuning): RmgSchema {
  return {
    ...schema,
    zoneLayouts: tuning.elevation.zoneLayouts ?? schema.zoneLayouts,
    difficulties: schema.difficulties.map((d, i) => ({ ...d, ...tuning.difficulty[DIFFICULTY_IDS[i]] })),
  }
}

export const TUNING_FILE = 'rmg-tuning.json'
export const TUNING_DEFAULTS_FILE = 'rmg-tuning.defaults.json'

/** Read and validate the tuning file (Tauri only), and rewrite the defaults
 *  reference file from `defaults` (the current built-in values) next to it.
 *  Never throws — no file, an unreadable file or the web build all give
 *  EMPTY_TUNING. */
export async function loadRmgTuning(defaults: unknown): Promise<RmgTuning> {
  try {
    const { appDataDir, join } = await import('@tauri-apps/api/path')
    const { exists, mkdir, readTextFile, writeTextFile } = await import('@tauri-apps/plugin-fs')
    const dir = await appDataDir()
    await mkdir(dir, { recursive: true })
    await writeTextFile(await join(dir, TUNING_DEFAULTS_FILE), JSON.stringify(defaults, null, 2) + '\n')

    const path = await join(dir, TUNING_FILE)
    if (!(await exists(path))) return EMPTY_TUNING
    let text = await readTextFile(path)
    if (text.startsWith('﻿')) text = text.slice(1)
    let json: unknown
    try {
      json = JSON.parse(text)
    } catch (e) {
      logWarn(`RMG tuning: ${path} is not valid JSON (${e instanceof Error ? e.message : String(e)}) — ignored`)
      return EMPTY_TUNING
    }
    const { tuning, warnings } = parseRmgTuning(json)
    for (const w of warnings) logWarn(`RMG tuning: ${w}`)
    logInfo(`RMG tuning loaded from ${path}${warnings.length > 0 ? ` (${warnings.length} entr${warnings.length === 1 ? 'y' : 'ies'} ignored)` : ''}`)
    return tuning
  } catch {
    return EMPTY_TUNING
  }
}
