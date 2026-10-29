// Display names of biomes, water types and road types in the UI language. The English tables in terrain-colors.ts stay the
// source of the values that are stored or compared (e.g. a hero's native biome); these only change what is shown.
import i18n from '@/lib/i18n'
import { BIOME_NAMES, WATER_TYPE_NAMES, ROAD_TYPE_NAMES, type BiomeId } from './terrain-colors'

export function biomeName(id: BiomeId): string {
  return i18n.t(`shared.biomes.${id}`)
}

/** For a stored English biome name such as a hero's `nativeBiome`. */
export function biomeNameFromEnglish(english: string): string {
  const id = (Object.entries(BIOME_NAMES) as [string, string][]).find(([, name]) => name === english)?.[0]
  return id ? biomeName(Number(id) as BiomeId) : english
}

export function waterTypeName(id: number): string {
  return id in WATER_TYPE_NAMES ? i18n.t(`shared.waterTypes.${id as 1}`) : String(id)
}

export function roadTypeName(id: number): string {
  return id in ROAD_TYPE_NAMES ? i18n.t(`shared.roadTypes.${id as 1}`) : String(id)
}
