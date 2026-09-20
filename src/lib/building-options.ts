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

/** Building choices for the "Building SID" dropdown: that faction's real
 *  buildings, or — when the faction isn't known yet (random-faction city
 *  spawner, or no castle picked yet) — only the sids present for every
 *  faction in the catalog (the buildings every faction actually has, e.g.
 *  Build_Main/Build_Tavern/Build_Tier_1..7/Build_Magic_Guild/..., excluding
 *  each faction's unique extras like Build_Golden_Calf). */
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
      generic.push(b)
    }
  }
  return generic
}

/** Real level names for a specific building sid (e.g. ["Griffin Rookery",
 *  "Griffin Rookery II"]) — each building's real level count varies (Main: 3,
 *  Magic Guild: 5, dwellings: 2, most others: 1), never a uniform 1-5 range.
 *  Falls back to any faction carrying that sid if the given faction doesn't
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
  return match?.levelNames ?? []
}
