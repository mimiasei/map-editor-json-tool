// The Generate Random Map dialog's last used settings, kept in localStorage so
// the next time it opens (it is unmounted on close) it starts where it was left.
// Deliberately not saved: seeds (a kept seed would repeat the same map), a
// picked game template (session-only) and the live-preview state.

import type { ClassicSettings } from '@/lib/rmg/classic-presets'
import type { BoundaryGuardStrength } from '@/lib/rmg/zone-boundary'

const STORAGE_KEY = 'oe-rmg-dialog-settings'

export interface PersistedRmgSettings {
  mode?: 'classic' | 'advanced'
  classic?: ClassicSettings
  mapName?: string
  sizeKey?: string
  limitCities?: boolean
  usePortals?: boolean
  waterContent?: 'none' | 'normal' | 'islands'
  boundaryGuardStrength?: BoundaryGuardStrength
  enabledBiomes?: Record<string, boolean>
  disabledInteractableSids?: string[]
  bannedSpellSids?: string[]
  bannedArtifactSids?: string[]
  // numbers
  playerCount?: number
  cityTotal?: number
  maxHeroes?: number
  waterChance?: number
  islandLandRatio?: number
  hillChance?: number
  valleyChance?: number
  obstacleDensity?: number
  interactableDensity?: number
  mountainDensity?: number
  treasureDensity?: number
  objectVariety?: number
  zoneJaggedness?: number
  zoneSpread?: number
  squadDensity?: number
  roadWindingAmplitude?: number
  roadWindingWavelength?: number
  organicTerrainBlending?: number
  decorationRoadDecayStrength?: number
  decorationCoOccurrenceStrength?: number
  decorationElevationDecayStrength?: number
  mineGoldBiomeBiasStrength?: number
}

const NUMBER_KEYS = [
  'playerCount', 'cityTotal', 'maxHeroes', 'waterChance', 'islandLandRatio', 'hillChance', 'valleyChance',
  'obstacleDensity', 'interactableDensity', 'mountainDensity', 'treasureDensity', 'objectVariety',
  'zoneJaggedness', 'zoneSpread', 'squadDensity', 'roadWindingAmplitude', 'roadWindingWavelength',
  'organicTerrainBlending', 'decorationRoadDecayStrength', 'decorationCoOccurrenceStrength',
  'decorationElevationDecayStrength', 'mineGoldBiomeBiasStrength',
] as const
const BOOLEAN_KEYS = ['limitCities', 'usePortals'] as const
const STRING_ARRAY_KEYS = ['disabledInteractableSids', 'bannedSpellSids', 'bannedArtifactSids'] as const

/** Reads the saved settings, dropping anything with an unexpected type (a stale or hand-edited blob must never break the dialog). */
export function loadRmgDialogSettings(): PersistedRmgSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const data = JSON.parse(raw) as Record<string, unknown>
    if (!data || typeof data !== 'object') return {}
    const out: Record<string, unknown> = {}
    for (const k of NUMBER_KEYS) if (typeof data[k] === 'number' && Number.isFinite(data[k])) out[k] = data[k]
    for (const k of BOOLEAN_KEYS) if (typeof data[k] === 'boolean') out[k] = data[k]
    for (const k of STRING_ARRAY_KEYS) {
      const v = data[k]
      if (Array.isArray(v) && v.every((x) => typeof x === 'string')) out[k] = v
    }
    if (data.mode === 'classic' || data.mode === 'advanced') out.mode = data.mode
    if (data.waterContent === 'none' || data.waterContent === 'normal' || data.waterContent === 'islands') out.waterContent = data.waterContent
    if (typeof data.mapName === 'string') out.mapName = data.mapName
    if (typeof data.sizeKey === 'string') out.sizeKey = data.sizeKey
    if (['none', 'normal', 'strong', 'very strong'].includes(data.boundaryGuardStrength as string)) out.boundaryGuardStrength = data.boundaryGuardStrength
    if (data.classic && typeof data.classic === 'object') out.classic = data.classic
    const biomes = data.enabledBiomes
    if (biomes && typeof biomes === 'object' && Object.values(biomes).every((v) => typeof v === 'boolean')) out.enabledBiomes = biomes
    if (typeof out.maxHeroes === 'number') out.maxHeroes = Math.min(10, Math.max(1, Math.round(out.maxHeroes)))
    return out as PersistedRmgSettings
  } catch {
    return {}
  }
}

export function saveRmgDialogSettings(settings: PersistedRmgSettings): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)) } catch { /* storage unavailable */ }
}
