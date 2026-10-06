// ─── Headless CLI argument parsing (issue #258) ─────────────────────────────
// No Tauri imports — only argument validation, no side effects.

import { DEFAULT_CLASSIC_SETTINGS, COMPLEXITY_LEVELS, DIFFICULTY_LEVELS, RICHNESS_LEVELS, WATER_LEVELS, type ClassicSettings } from './classic-presets'
import { MAP_SIZE_PRESETS, presetKey } from '@/components/common/NewMapDialog'

export interface HeadlessArgs {
  output: string
  result: string | null
  /** Progress file the mod polls (`{pct, label}`); also keeps the window hidden. */
  progress: string | null
  sizeX: number
  sizeZ: number
  playerCount: number
  seed: number | undefined
  mapName: string
  classic: ClassicSettings
}

export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 8

/** Exit codes the mod can rely on. */
export const EXIT_OK = 0
export const EXIT_FAILED = 1
export const EXIT_BAD_ARGS = 2
export const EXIT_NO_CATALOG = 3

type ArgValue = string | undefined

/** 0-based index into the same array the dialog's dropdown renders, so the
 *  mod can send the GME dropdown's selected index directly. */
function pickIndex<T extends string>(raw: ArgValue, levels: { id: T }[], fallback: T, flag: string): T {
  if (raw === undefined) return fallback
  const valid = `0-${levels.length - 1} (${levels.map((l, i) => `${i}=${l.id}`).join(', ')})`
  if (!/^\d+$/.test(raw.trim())) throw new Error(`--${flag} must be an integer ${valid} (got "${raw}")`)
  const hit = levels[Number(raw)]
  if (!hit) throw new Error(`--${flag} must be an integer ${valid} (got "${raw}")`)
  return hit.id
}

/** `XxZ` (e.g. `128x64`), or a single number `N` for a square N×N map. Must
 *  be one of the dialog's presets — generation was only ever tuned/verified at
 *  those sizes. */
function parseSize(raw: ArgValue): { sizeX: number; sizeZ: number } {
  if (raw === undefined) return { sizeX: 64, sizeZ: 64 }
  const m = /^\s*(\d+)\s*(?:[xX]\s*(\d+))?\s*$/.exec(raw)
  if (!m) throw new Error(`--size must be N or XxZ, e.g. 64 or 128x64 (got "${raw}")`)
  const sizeX = Number(m[1])
  const sizeZ = m[2] === undefined ? sizeX : Number(m[2])
  if (!MAP_SIZE_PRESETS.some((p) => p.sizeX === sizeX && p.sizeZ === sizeZ)) {
    throw new Error(`--size ${sizeX}x${sizeZ} is not supported; use one of: ${MAP_SIZE_PRESETS.map(presetKey).join(', ')}`)
  }
  return { sizeX, sizeZ }
}

export function parseHeadlessArgs(raw: Record<string, ArgValue>): HeadlessArgs {
  const output = raw.output?.trim()
  if (!output) throw new Error('--output is required')
  if (!output.toLowerCase().endsWith('.map')) throw new Error('--output must end in .map')

  const playerCount = raw.players === undefined ? 2 : Number(raw.players)
  if (!Number.isInteger(playerCount) || playerCount < MIN_PLAYERS || playerCount > MAX_PLAYERS) {
    throw new Error(`--players must be an integer ${MIN_PLAYERS}-${MAX_PLAYERS} (got "${raw.players}")`)
  }

  let seed: number | undefined
  if (raw.seed !== undefined) {
    seed = Number(raw.seed)
    if (!Number.isFinite(seed)) throw new Error(`--seed must be numeric (got "${raw.seed}")`)
  }

  return {
    output,
    result: raw.result?.trim() || null,
    progress: raw.progress?.trim() || null,
    ...parseSize(raw.size),
    playerCount,
    seed,
    mapName: raw.name?.trim() || 'Random Map',
    classic: {
      richness: pickIndex(raw.richness, RICHNESS_LEVELS, DEFAULT_CLASSIC_SETTINGS.richness, 'richness'),
      complexity: pickIndex(raw.complexity, COMPLEXITY_LEVELS, DEFAULT_CLASSIC_SETTINGS.complexity, 'complexity'),
      difficulty: pickIndex(raw.difficulty, DIFFICULTY_LEVELS, DEFAULT_CLASSIC_SETTINGS.difficulty, 'difficulty'),
      water: pickIndex(raw.water, WATER_LEVELS, DEFAULT_CLASSIC_SETTINGS.water, 'water'),
    },
  }
}
