// ─── Headless CLI argument parsing (issue #258) ─────────────────────────────
// No Tauri imports — only argument validation, no side effects.

import { DEFAULT_CLASSIC_SETTINGS, COMPLEXITY_LEVELS, RICHNESS_LEVELS, WATER_LEVELS, type ClassicSettings } from './classic-presets'
import { MAP_SIZE_PRESETS } from '@/components/common/NewMapDialog'

export interface HeadlessArgs {
  output: string
  result: string | null
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

/** Only the first number is read, so `64` and `"64x64"` both mean 64x64
 *  (a square map). Must be one of the dialog's presets — generation was only
 *  ever tuned/verified at those sizes — which makes only the square presets
 *  reachable. */
function parseSize(raw: ArgValue): { sizeX: number; sizeZ: number } {
  if (raw === undefined) return { sizeX: 64, sizeZ: 64 }
  const m = /\d+/.exec(raw)
  if (!m) throw new Error(`--size must contain a number, e.g. 64 or 64x64 (got "${raw}")`)
  const size = Number(m[0])
  if (!MAP_SIZE_PRESETS.some((p) => p.sizeX === size && p.sizeZ === size)) {
    throw new Error(`--size ${size} is not supported; use one of: ${MAP_SIZE_PRESETS.filter((p) => p.sizeX === p.sizeZ).map((p) => p.sizeX).join(', ')}`)
  }
  return { sizeX: size, sizeZ: size }
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
    ...parseSize(raw.size),
    playerCount,
    seed,
    mapName: raw.name?.trim() || 'Random Map',
    classic: {
      richness: pickIndex(raw.richness, RICHNESS_LEVELS, DEFAULT_CLASSIC_SETTINGS.richness, 'richness'),
      complexity: pickIndex(raw.complexity, COMPLEXITY_LEVELS, DEFAULT_CLASSIC_SETTINGS.complexity, 'complexity'),
      water: pickIndex(raw.water, WATER_LEVELS, DEFAULT_CLASSIC_SETTINGS.water, 'water'),
    },
  }
}
