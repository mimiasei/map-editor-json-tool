// ─── Map Grid statistics ──────────────────────────────────────────────────────
// Real, data-backed counts/percentages for the currently-open .map document —
// shown by StatsDialog in place of the scenario-JSON stats while the Map Grid
// is open. Every category reuses an existing categorization already trusted
// elsewhere in this codebase (INTERACTABLE_SUBCATEGORY_*, RESOURCE_SIDS/
// STORAGE_SIDS, buildBlockedTileSet, ROAD_TYPE_NAMES) rather than inventing a
// new one, so these numbers stay consistent with what the grid itself shows.

import type { MapContext, PlacedObject } from '@/types/map-context'
import type { GameCatalog } from '@/lib/catalog/types'
import { factionDisplayName } from '@/lib/factions'
import { buildBlockedTileSet } from '@/lib/map-grid/passability'
import { RESOURCE_SIDS, STORAGE_SIDS } from '@/lib/rmg/object-variety'
import {
  resolveInteractableSubcategory,
  INTERACTABLE_SUBCATEGORY_ORDER,
  INTERACTABLE_SUBCATEGORY_LABELS,
} from '@/lib/map-grid/interactable-subcategories'
import { BIOME_NAMES, type BiomeId } from '@/lib/map-grid/terrain-colors'

export interface PlayerCityStat {
  owner: number
  faction: string
  hasHero: boolean
}

export interface MapStats {
  sizeX: number
  sizeZ: number
  totalTiles: number
  playerCities: PlayerCityStat[]
  randomCityCount: number
  playerHeroSpawnerCount: number
  squadCount: number
  unitFrequency: [string, number][]
  minesByType: [string, number][]
  interactableByCategory: [string, number][]
  decorationByCategory: [string, number][]
  biomePct: { id: BiomeId; label: string; pct: number }[]
  waterPct: number
  levelPct: { level: number; pct: number }[]
  roadTileCounts: { roadId: number; label: string; tiles: number }[]
  riverLength: number
  resourceCounts: [string, number][]
  chestCount: number
  portalLinkCounts: { kind: string; count: number }[]
  blockingPct: number
}

/** Every catalog category treated as "scenery" for the decorations
 *  breakdown — the same three real, data-backed buckets the object browser
 *  already filters by (environments/animals/fxs), not an invented split. */
const DECORATION_CATEGORIES = ['environments', 'animals', 'fxs'] as const

function pct(count: number, total: number): number {
  return total > 0 ? (count / total) * 100 : 0
}

export function computeMapStats(context: MapContext, catalog: GameCatalog | null): MapStats {
  const { sizeX, sizeZ, tilesMap, waterMap, levelsMap, roadsMap, riverNodes, placedObjects } = context
  const totalTiles = sizeX * sizeZ
  const catalogById = new Map((catalog?.mapObjects ?? []).map((o) => [o.id, o]))

  // ── Cities / heroes ──────────────────────────────────────────────────────
  const playerCities: PlayerCityStat[] = placedObjects
    .filter((o): o is PlacedObject & { spawnerInfo: NonNullable<PlacedObject['spawnerInfo']> } =>
      !!o.spawnerInfo && o.spawnerInfo.spawnPointType === 0,
    )
    .map((o) => ({
      owner: o.spawnerInfo.owner,
      faction: o.spawnerInfo.factionSid ? factionDisplayName(o.spawnerInfo.factionSid, catalog?.factions) : 'Random',
      hasHero: !!o.spawnerInfo.spawnHero,
    }))
    .sort((a, b) => a.owner - b.owner)
  const randomCityCount = placedObjects.filter((o) => o.sid === 'random-city').length
  const playerHeroSpawnerCount = placedObjects.filter((o) => o.spawnerInfo?.spawnPointType === 1).length

  // ── Squads / units ───────────────────────────────────────────────────────
  const squads = placedObjects.filter((o) => o.type === 2)
  const unitFreq = new Map<string, number>()
  for (const s of squads) {
    if (!s.firstUnitSid) continue
    unitFreq.set(s.firstUnitSid, (unitFreq.get(s.firstUnitSid) ?? 0) + 1)
  }

  // ── Mines / interactables / decorations ──────────────────────────────────
  const minesByType = new Map<string, number>()
  const interactableByCategory = new Map<string, number>()
  const decorationByCategory = new Map<string, number>()
  for (const o of placedObjects) {
    if (o.type !== 0) continue
    if (o.sid.startsWith('mine_')) minesByType.set(o.sid, (minesByType.get(o.sid) ?? 0) + 1)
    const catalogObj = catalogById.get(o.sid)
    if (!catalogObj) continue
    if (catalogObj.category === 'interactables') {
      const sub = resolveInteractableSubcategory(o.sid)
      const label = INTERACTABLE_SUBCATEGORY_LABELS[sub]
      interactableByCategory.set(label, (interactableByCategory.get(label) ?? 0) + 1)
    }
    if ((DECORATION_CATEGORIES as readonly string[]).includes(catalogObj.category)) {
      decorationByCategory.set(catalogObj.category, (decorationByCategory.get(catalogObj.category) ?? 0) + 1)
    }
  }

  // ── Terrain: biomes / water / levels ─────────────────────────────────────
  const biomeCounts = new Map<BiomeId, number>()
  let waterTiles = 0
  for (let i = 0; i < tilesMap.length; i++) {
    const b = tilesMap[i] as BiomeId
    if (b >= 1 && b <= 7) biomeCounts.set(b, (biomeCounts.get(b) ?? 0) + 1)
    if ((waterMap[i] ?? 0) !== 0) waterTiles++
  }
  const biomePct = ([1, 2, 3, 4, 5, 6, 7] as BiomeId[])
    .filter((id) => (biomeCounts.get(id) ?? 0) > 0)
    .map((id) => ({ id, label: BIOME_NAMES[id], pct: pct(biomeCounts.get(id) ?? 0, totalTiles) }))

  const levelCounts = new Map<number, number>()
  for (const lvl of levelsMap) levelCounts.set(lvl, (levelCounts.get(lvl) ?? 0) + 1)
  const levelPct = [-1, 0, 1].map((level) => ({ level, pct: pct(levelCounts.get(level) ?? 0, totalTiles) }))

  // ── Roads / rivers ────────────────────────────────────────────────────────
  const roadCounts = new Map<number, number>()
  for (const r of roadsMap) { if (r) roadCounts.set(r, (roadCounts.get(r) ?? 0) + 1) }
  const roadTileCounts = [1, 2].map((roadId) => ({
    roadId,
    label: roadId === 1 ? 'Dirt' : 'Stone',
    tiles: roadCounts.get(roadId) ?? 0,
  }))

  // ── Resources / chests ────────────────────────────────────────────────────
  const resourceCounts = new Map<string, number>()
  let chestCount = 0
  for (const o of placedObjects) {
    if (o.type !== 0) continue
    if ((RESOURCE_SIDS as readonly string[]).includes(o.sid) || (STORAGE_SIDS as readonly string[]).includes(o.sid)) {
      resourceCounts.set(o.sid, (resourceCounts.get(o.sid) ?? 0) + 1)
    }
    if (o.sid === 'storage_chest' || o.sid.includes('chest')) chestCount++
  }

  // ── Portals ───────────────────────────────────────────────────────────────
  const portalKindCounts = new Map<string, number>()
  for (const o of placedObjects) {
    if (!o.portalInfo) continue
    portalKindCounts.set(o.portalInfo.linkKind, (portalKindCounts.get(o.portalInfo.linkKind) ?? 0) + 1)
  }

  // ── Blocking vs non-blocking tiles ────────────────────────────────────────
  const blocked = buildBlockedTileSet({ sizeX, sizeZ, placedObjects, levelsMap, climbsMap: context.climbsMap, waterMap }, catalog)
  const blockingPct = pct(blocked.size, totalTiles)

  return {
    sizeX, sizeZ, totalTiles,
    playerCities,
    randomCityCount,
    playerHeroSpawnerCount,
    squadCount: squads.length,
    unitFrequency: [...unitFreq.entries()].sort((a, b) => b[1] - a[1]),
    minesByType: [...minesByType.entries()].sort((a, b) => b[1] - a[1]),
    interactableByCategory: INTERACTABLE_SUBCATEGORY_ORDER
      .map((s) => INTERACTABLE_SUBCATEGORY_LABELS[s])
      .filter((label) => (interactableByCategory.get(label) ?? 0) > 0)
      .map((label) => [label, interactableByCategory.get(label) ?? 0] as [string, number]),
    decorationByCategory: DECORATION_CATEGORIES
      .filter((c) => (decorationByCategory.get(c) ?? 0) > 0)
      .map((c) => [c, decorationByCategory.get(c) ?? 0] as [string, number]),
    biomePct,
    waterPct: pct(waterTiles, totalTiles),
    levelPct,
    roadTileCounts,
    riverLength: riverNodes.size,
    resourceCounts: [...resourceCounts.entries()].sort((a, b) => b[1] - a[1]),
    chestCount,
    portalLinkCounts: [...portalKindCounts.entries()].map(([kind, count]) => ({ kind, count })),
    blockingPct,
  }
}
