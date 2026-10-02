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

function pick<T extends string>(raw: ArgValue, levels: { id: T }[], fallback: T, flag: string): T {
  if (raw === undefined) return fallback
  const hit = levels.find((l) => l.id === raw)
  if (!hit) throw new Error(`--${flag} must be one of: ${levels.map((l) => l.id).join(', ')} (got "${raw}")`)
  return hit.id
}

/** `size` is `N` (square) or `WxH`. Must be one of the dialog's presets —
 *  generation was only ever tuned/verified at those sizes. */
function parseSize(raw: ArgValue): { sizeX: number; sizeZ: number } {
  if (raw === undefined) return { sizeX: 64, sizeZ: 64 }
  const m = /^(\d+)(?:x(\d+))?$/i.exec(raw.trim())
  if (!m) throw new Error(`--size must be N or WxH (got "${raw}")`)
  const sizeX = Number(m[1])
  const sizeZ = m[2] !== undefined ? Number(m[2]) : sizeX
  if (!MAP_SIZE_PRESETS.some((p) => p.sizeX === sizeX && p.sizeZ === sizeZ)) {
    throw new Error(`--size ${sizeX}x${sizeZ} is not supported; use one of: ${MAP_SIZE_PRESETS.map((p) => `${p.sizeX}x${p.sizeZ}`).join(', ')}`)
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
    ...parseSize(raw.size),
    playerCount,
    seed,
    mapName: raw.name?.trim() || 'Random Map',
    classic: {
      richness: pick(raw.richness, RICHNESS_LEVELS, DEFAULT_CLASSIC_SETTINGS.richness, 'richness'),
      complexity: pick(raw.complexity, COMPLEXITY_LEVELS, DEFAULT_CLASSIC_SETTINGS.complexity, 'complexity'),
      water: pick(raw.water, WATER_LEVELS, DEFAULT_CLASSIC_SETTINGS.water, 'water'),
    },
  }
}
