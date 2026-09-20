// ─── Castle building dropdown helpers ─────────────────────────────────────────
// Pure derivation logic shared by ConditionForm/ActionForm's "Building SID"
// param widget (BuildingConstruct/BuildingOwn/UnlockBuildingCity/CreateBuildingCity)
// — kept here rather than duplicated in both forms since, unlike their other
// small per-widget differences, this involves real cross-param + cross-store
// lookups worth getting right once.

import type { GameCatalog, CatalogCityBuilding } from '@/lib/catalog/types'
import type { PlacedObject } from '@/types/map-context'

/** Resolves the faction of a "Castle entity" param's current value from the
 *  loaded .map's placed objects. Undefined means unassigned/random (or the
 *  entity can't be found) — matching PlacedObject.spawnerInfo.factionSid's
 *  own "absent means random" convention. */
export function resolveCastleFaction(
  placedObjects: PlacedObject[] | undefined,
  castleEntitySid: string | undefined,
): string | undefined {
  if (!castleEntitySid) return undefined
  const castle = placedObjects?.find((o) => o.entitySid === castleEntitySid && o.isCity)
  return castle?.spawnerInfo?.factionSid
}

// Roman-numeral suffixes matching the game's own upgrade-naming convention
// (e.g. "Mage Guild II"/"III"/"IV"/"V") — index 0 is level 1 (no suffix).
const LEVEL_SUFFIX = ['', ' II', ' III', ' IV', ' V']

/** Two categories have no faction-neutral real name at all — every faction's
 *  Main building and every Tier dwelling has its own unique flavor name
 *  (confirmed via Core/Lang/english/texts/cities.json: e.g. human's
 *  Build_Main is "Solar Temple", demon's is "Apiary's Heart"), unlike
 *  Bank/Market/Tavern/Magic Guild/Wall/Treasury/Resource Depot, whose real
 *  names are already identical in every faction. Showing one arbitrary
 *  faction's flavor name for a random-faction city would be misleading (it
 *  looks like *the* name, not just one faction's), so these two get a
 *  synthetic neutral label instead — "Garrison" is the game's own
 *  faction-neutral term for a creature dwelling (Core/Lang's `garnison`
 *  token), and "Town Hall" is this editor's own placeholder for Main since
 *  the game has no generic term for it at all. */
function genericLevelNames(building: CatalogCityBuilding): string[] {
  if (building.category === 'main') {
    return building.levelNames.map((_, i) => `Town Hall${LEVEL_SUFFIX[i] ?? ''}`)
  }
  if (building.category === 'dwelling') {
    const tier = building.sid.match(/Tier_(\d+)/)?.[1] ?? '?'
    return building.levelNames.map((_, i) => `Tier ${tier} Garrison${LEVEL_SUFFIX[i] ?? ''}`)
  }
  return building.levelNames
}

/** Building choices for the "Building SID" dropdown: that faction's real
 *  buildings, or — when the faction isn't known yet (random-faction city
 *  spawner, or no castle picked yet) — only the sids present for every
 *  faction in the catalog (the buildings every faction actually has, e.g.
 *  Build_Main/Build_Tavern/Build_Tier_1..7/Build_Magic_Guild/..., excluding
 *  each faction's unique extras like Build_Golden_Calf), with Main/dwelling
 *  labels replaced by a neutral generic name (see genericLevelNames). */
export function getBuildingOptions(catalog: GameCatalog | null, faction: string | undefined): CatalogCityBuilding[] {
  const all = catalog?.cityBuildings ?? []
  if (faction) return all.filter((b) => b.fraction === faction)

  const factionCount = new Set(all.map((b) => b.fraction)).size
  if (factionCount === 0) return []
  const countBySid = new Map<string, number>()
  for (const b of all) countBySid.set(b.sid, (countBySid.get(b.sid) ?? 0) + 1)

  const seen = new Set<string>()
  const generic: CatalogCityBuilding[] = []
  for (const b of all) {
    if (countBySid.get(b.sid) === factionCount && !seen.has(b.sid)) {
      seen.add(b.sid)
      generic.push({ ...b, levelNames: genericLevelNames(b) })
    }
  }
  return generic
}

/** Real level names for a specific building sid (e.g. ["Griffin Rookery",
 *  "Griffin Rookery II"]) — each building's real level count varies (Main: 3,
 *  Magic Guild: 5, dwellings: 2, most others: 1), never a uniform 1-5 range.
 *  With no faction (random-faction castle), Main/dwelling sids resolve to
 *  the same neutral generic name getBuildingOptions shows in the dropdown,
 *  not whichever faction's entry happens to be first in the catalog. Falls
 *  back to any faction carrying that sid if the given faction doesn't
 *  (shouldn't normally happen once picked from getBuildingOptions' own list,
 *  but keeps a stale/hand-typed sid from resolving to nothing). */
export function getBuildingLevelNames(
  catalog: GameCatalog | null,
  sid: string | undefined,
  faction: string | undefined,
): string[] {
  if (!sid) return []
  const all = catalog?.cityBuildings ?? []
  const match =
    (faction ? all.find((b) => b.sid === sid && b.fraction === faction) : undefined) ??
    all.find((b) => b.sid === sid)
  if (!match) return []
  return faction ? match.levelNames : genericLevelNames(match)
}
