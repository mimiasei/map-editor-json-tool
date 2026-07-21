// ─── Static fallback catalog ──────────────────────────────────────────────────
// Builds a minimal GameCatalog from the bundled JSON data files in src/data/.
// Used as a fallback in the Game Database dialog when Core.zip has not been
// loaded (or when specific entity arrays from Core.zip come back empty).
//
// Coverage: heroes, creatures (units), map objects, artifacts.
// Spells, skills, buffs, factions require Core.zip.

import heroesData from '@/data/heroes.json'
import unitsData from '@/data/units.json'
import mapObjectsData from '@/data/map-objects.json'
import artifactsData from '@/data/artifacts.json'
import type {
  GameCatalog,
  CatalogHero,
  CatalogCreature,
  CatalogMapObject,
  CatalogArtifact,
} from './types'
import { CATALOG_SCHEMA_VERSION } from './types'

// ─── Raw JSON shapes ──────────────────────────────────────────────────────────

type RawHero = { sid: string; name: string; faction: string }
type RawUnit = { sid: string; name: string; faction: string }
type RawMapObj = { sid: string; name: string | null; category: string | null }
type RawArtifact = { sid: string; name: string; slot?: string; description?: string; rarity?: string }

// ─── Category mapper ──────────────────────────────────────────────────────────
// Maps the human-readable categories from map-objects.json to the four internal
// values that CatalogMapObject.category expects.

function mapCategory(cat: string | null): CatalogMapObject['category'] {
  if (!cat) return 'environments'
  const lower = cat.toLowerCase()
  if (lower.includes('adventure') || lower.includes('treasure') || lower.includes('magic') || lower.includes('special'))
    return 'interactables'
  if (lower.includes('dwelling'))
    return 'spawns'
  return 'environments'
}

// ─── Static entity arrays ─────────────────────────────────────────────────────

export const STATIC_HEROES: CatalogHero[] = (heroesData as RawHero[])
  .map((h) => ({
    id: h.sid,
    name: h.name,
    fraction: h.faction,
    icon: h.sid,
  }))
  .sort((a, b) => a.name.localeCompare(b.name))

export const STATIC_CREATURES: CatalogCreature[] = (unitsData as RawUnit[])
  .map((u) => ({
    id: u.sid,
    name: u.name,
    fraction: u.faction,
    tier: 0,
  }))
  .sort((a, b) => a.name.localeCompare(b.name))

export const STATIC_MAP_OBJECTS: CatalogMapObject[] = (mapObjectsData as RawMapObj[])
  .map((o) => {
    const category = mapCategory(o.category)
    return {
      id: o.sid,
      name: o.name ?? o.sid,
      // Store the original category string as the tag so it shows up in the
      // detail pane subtitle even though we normalise category below.
      tag: o.category ?? undefined,
      category,
      isInteractable: category === 'interactables',
    }
  })
  .sort((a, b) => a.name.localeCompare(b.name))

export const STATIC_ARTIFACTS: CatalogArtifact[] = (artifactsData as RawArtifact[])
  .map((a) => ({
    id: a.sid,
    name: a.name,
    icon: a.sid,
    slot: a.slot,
    rarity: a.rarity,
    description: a.description,
  }))
  .sort((a, b) => a.name.localeCompare(b.name))

// ─── Full static catalog ──────────────────────────────────────────────────────

export const STATIC_CATALOG: GameCatalog = {
  version: CATALOG_SCHEMA_VERSION,
  generatedAt: 'static',
  sourceHint: 'built-in',
  heroes: STATIC_HEROES,
  creatures: STATIC_CREATURES,
  artifacts: STATIC_ARTIFACTS,
  spells: [],
  skills: [],
  buffs: [],
  mapObjects: STATIC_MAP_OBJECTS,
  factions: [],
  dialogs: [],
}
