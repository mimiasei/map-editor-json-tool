import i18n from '@/lib/i18n'
// ─── Map Grid — Spawners sub-categories ─────────────────────────────────────
// Core/DB/map/objects/7_spawns.json holds exactly these 8 objects, so each spawner type is its own sub-category.

export const SPAWNER_SUBCATEGORY_ORDER = [
  'city-spawner',
  'hero-spawner',
  'random-city',
  'random-hero',
  'random-squad',
  'random-res',
  'random-item',
  'random-hire',
] as const

export type SpawnerSubcategory = (typeof SPAWNER_SUBCATEGORY_ORDER)[number]

/** Display name of a spawner type in the UI language. */
export function spawnerSubcategoryName(sub: SpawnerSubcategory): string {
  return i18n.t(`shared.spawnerSubcategories.${sub}`)
}

export function isSpawnerSubcategory(sid: string): sid is SpawnerSubcategory {
  return (SPAWNER_SUBCATEGORY_ORDER as readonly string[]).includes(sid)
}
